/**
 * Music following the pomodoro phases.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Ref, Stream, SubscriptionRef } from "effect";
import { KeyValueStore } from "effect/persistence";
import { MusicDirector } from "@/client/MusicDirector";
import { Playback, PlayerView } from "@/client/Playback";
import { SettingsStore } from "@/client/SettingsStore";
import { SpotifyAuth } from "@/client/SpotifyAuth";
import { Timer } from "@/client/Timer";
import { Toasts } from "@/client/Toasts";
import { MusicSettings, Settings } from "@/shared/domain/Settings";
import { Playlist } from "@/shared/domain/Spotify";
import { sample } from "../support/arbitrary";

const settle = Effect.repeat(Effect.yieldNow, { times: 30 });

const director = (options: {
	readonly calls: Ref.Ref<ReadonlyArray<string>>;
	readonly connected?: boolean;
}) => {
	const record = (call: string) =>
		Ref.update(options.calls, (all) => [...all, call]);
	const playback = Layer.effect(
		Playback,
		Effect.gen(function* () {
			const view = yield* SubscriptionRef.make(PlayerView.empty);
			return {
				view,
				refresh: () => Effect.succeedNone,
				startPlaylist: (playlist: Playlist) => record(`start:${playlist.name}`),
				toggle: () => Effect.void,
				pauseMusic: record("pause"),
				resumeMusic: record("resume"),
				fadeTo: (target: number) =>
					record(`fade:${target}`).pipe(Effect.as(80)),
				selectDevice: () => Effect.void,
				next: Effect.void,
				previous: Effect.void,
				setVolume: () => Effect.void,
				togglePin: () => Effect.succeed(Settings.defaults),
				showError: () => Effect.void,
				reset: Effect.void,
			};
		}),
	);
	const auth = Layer.succeed(SpotifyAuth, {
		accessToken: Effect.succeed("token"),
		save: () => Effect.void,
		disconnect: () => Effect.void,
		isConnected: Effect.succeed(options.connected ?? true),
		connectedChanges: Stream.make(options.connected ?? true),
	});
	return MusicDirector.layer.pipe(
		Layer.provideMerge(Timer.layer),
		Layer.provideMerge(SettingsStore.layer),
		Layer.provide(Toasts.layer),
		Layer.provide(playback),
		Layer.provide(auth),
		Layer.provide(KeyValueStore.layerMemory),
	);
};

const configure = (music: Partial<MusicSettings>) =>
	SettingsStore.use((store) =>
		store.update(
			(current) =>
				new Settings({
					...current,
					music: new MusicSettings({ ...current.music, ...music }),
				}),
		),
	);

const cycle = Timer.use((timer) =>
	Effect.gen(function* () {
		yield* timer.start();
		yield* settle;
		yield* timer.switchPhase();
		yield* settle;
		yield* timer.switchPhase();
		yield* settle;
		yield* timer.stop();
		yield* settle;
	}),
);

describe("MusicDirector", () => {
	it.effect("switches between focus and break playlists", () =>
		Effect.gen(function* () {
			const calls = yield* Ref.make<ReadonlyArray<string>>([]);
			const focus = new Playlist({
				...(yield* sample(Playlist)),
				name: "Focus",
			});
			const rest = new Playlist({ ...(yield* sample(Playlist)), name: "Rest" });
			yield* Effect.gen(function* () {
				yield* configure({
					focusPlaylist: Option.some(focus),
					breakPlaylist: Option.some(rest),
					onBreak: "playlist",
					pauseOnEnd: true,
				});
				yield* cycle;
			}).pipe(Effect.provide(director({ calls })));
			assert.deepStrictEqual(yield* Ref.get(calls), [
				"start:Focus",
				"start:Rest",
				"start:Focus",
				"pause",
			]);
		}),
	);

	it.effect("pauses for breaks and resumes for focus", () =>
		Effect.gen(function* () {
			const calls = yield* Ref.make<ReadonlyArray<string>>([]);
			yield* Effect.gen(function* () {
				yield* configure({ onBreak: "pause" });
				yield* cycle;
			}).pipe(Effect.provide(director({ calls })));
			assert.deepStrictEqual(yield* Ref.get(calls), ["pause", "resume"]);
		}),
	);

	it.effect("lowers the volume for breaks and restores it", () =>
		Effect.gen(function* () {
			const calls = yield* Ref.make<ReadonlyArray<string>>([]);
			yield* Effect.gen(function* () {
				yield* configure({ onBreak: "lower", breakVolume: 0.25 });
				yield* cycle;
			}).pipe(Effect.provide(director({ calls })));
			assert.deepStrictEqual(yield* Ref.get(calls), ["fade:25", "fade:80"]);
		}),
	);

	it.effect("does nothing while Spotify is disconnected", () =>
		Effect.gen(function* () {
			const calls = yield* Ref.make<ReadonlyArray<string>>([]);
			const focus = yield* sample(Playlist);
			yield* Effect.gen(function* () {
				yield* configure({
					focusPlaylist: Option.some(focus),
					onBreak: "pause",
				});
				yield* cycle;
			}).pipe(Effect.provide(director({ calls, connected: false })));
			assert.deepStrictEqual(yield* Ref.get(calls), []);
		}),
	);
});
