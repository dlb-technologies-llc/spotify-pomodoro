/**
 * Switches music as the pomodoro moves between phases.
 *
 * @module
 */
import { Context, Effect, Layer, Option, Ref, Schema, Stream } from "effect";
import type { MusicSettings } from "@/shared/domain/Settings";
import { isBreak, TimerPhase } from "@/shared/domain/Timer";
import { Playback } from "./Playback";
import { SettingsStore } from "./SettingsStore";
import { SpotifyAuth } from "./SpotifyAuth";
import { Timer } from "./Timer";

/**
 * A phase change: where the timer was and where it is now.
 *
 * @since 2.1.0
 * @category Models
 */
const Transition = Schema.Struct({ from: TimerPhase, to: TimerPhase });

type Transition = typeof Transition.Type;

const step = (
	from: TimerPhase,
	to: TimerPhase,
): readonly [TimerPhase, ReadonlyArray<Transition>] => [to, [{ from, to }]];

/**
 * Applies the music settings on every phase change:
 *
 * - focus starts or returns to the focus playlist, resumes paused music, or
 *   fades the volume back up;
 * - breaks switch to the break playlist, pause, lower the volume, or keep
 *   playing;
 * - ending the pomodoro optionally pauses.
 *
 * Nothing happens while Spotify is disconnected, and failures are shown as a
 * playback notice without affecting the timer.
 *
 * @since 2.1.0
 * @category Services
 */
export class MusicDirector extends Context.Service<MusicDirector>()(
	"spotify-pomodoro/client/MusicDirector",
	{
		make: Effect.gen(function* () {
			const timer = yield* Timer;
			const playback = yield* Playback;
			const settings = yield* SettingsStore;
			const auth = yield* SpotifyAuth;
			const scope = yield* Effect.scope;
			const volumeBeforeBreak = yield* Ref.make(Option.none<number>());
			const pausedForBreak = yield* Ref.make(false);

			const enterFocus = Effect.fn("MusicDirector.enterFocus")(function* (
				music: MusicSettings,
				from: TimerPhase,
			) {
				const restoreVolume = yield* Ref.getAndSet(
					volumeBeforeBreak,
					Option.none(),
				);
				if (Option.isSome(restoreVolume)) {
					yield* playback.fadeTo(restoreVolume.value);
				}
				if (yield* Ref.getAndSet(pausedForBreak, false)) {
					yield* playback.resumeMusic;
					return;
				}
				const switchingBack = isBreak(from) && music.onBreak === "playlist";
				if (
					(from === "idle" || switchingBack) &&
					Option.isSome(music.focusPlaylist)
				) {
					yield* playback.startPlaylist(music.focusPlaylist.value, false);
				}
			});

			const enterBreak = Effect.fn("MusicDirector.enterBreak")(function* (
				music: MusicSettings,
			) {
				switch (music.onBreak) {
					case "playlist":
						if (Option.isSome(music.breakPlaylist)) {
							yield* playback.startPlaylist(music.breakPlaylist.value, false);
						}
						return;
					case "pause":
						yield* playback.pauseMusic;
						yield* Ref.set(pausedForBreak, true);
						return;
					case "lower": {
						const before = yield* playback.fadeTo(
							Math.round(music.breakVolume * 100),
						);
						yield* Ref.set(volumeBeforeBreak, Option.some(before));
						return;
					}
					case "keep":
						return;
				}
			});

			const apply = Effect.fn("MusicDirector.apply")(
				function* (change: Transition) {
					if (!(yield* auth.isConnected)) return;
					const { music } = yield* settings.get;
					if (change.to === "focus") yield* enterFocus(music, change.from);
					else if (isBreak(change.to)) yield* enterBreak(music);
					else if (change.to === "idle") {
						const restore = yield* Ref.getAndSet(
							volumeBeforeBreak,
							Option.none(),
						);
						if (Option.isSome(restore)) yield* playback.fadeTo(restore.value);
						yield* Ref.set(pausedForBreak, false);
						if (music.pauseOnEnd) yield* playback.pauseMusic;
					}
				},
				Effect.catchCause((cause) =>
					Effect.logWarning("Music change failed", cause),
				),
			);

			const initial = yield* timer.get;
			yield* timer.changes.pipe(
				Stream.map((state) => state.phase),
				Stream.changes,
				Stream.mapAccum(() => initial.phase, step),
				Stream.filter((change) => change.from !== change.to),
				Stream.runForEach(apply),
				Effect.forkIn(scope),
			);

			return {};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
