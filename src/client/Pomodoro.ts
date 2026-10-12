/**
 * The pomodoro controls: timer transitions plus session recording.
 *
 * @module
 */
import { Context, Effect, Layer, type Option, Stream } from "effect";
import { Settings } from "@/shared/domain/Settings";
import {
	isBreak,
	type NamedPreset,
	TIMER_PRESETS,
	type TimerPhase,
} from "@/shared/domain/Timer";
import { AudioNotification } from "./AudioNotification";
import { Notifier } from "./Notifier";
import { ScreenWake } from "./ScreenWake";
import { SessionRecorder } from "./SessionRecorder";
import { SettingsStore } from "./SettingsStore";
import { Timer } from "./Timer";

const NOTICES: {
	readonly [P in Exclude<TimerPhase, "idle">]: readonly [string, string];
} = {
	focus: ["Focus complete", "Time for a break."],
	break: ["Break over", "Ready to focus?"],
	longBreak: ["Long break over", "Ready for the next cycle?"],
};

/**
 * User-facing pomodoro actions.
 *
 * The timer follows the durations in settings and updates immediately; the
 * matching recording runs in the background, in order. When a phase reaches
 * zero the chosen chime plays, a desktop notification appears if the page is
 * in the background, and the next phase starts on its own if auto-start is
 * on. The screen is kept awake while the timer runs.
 *
 * @since 2.0.0
 * @category Services
 */
export class Pomodoro extends Context.Service<Pomodoro>()(
	"spotify-pomodoro/client/Pomodoro",
	{
		make: Effect.gen(function* () {
			const timer = yield* Timer;
			const recorder = yield* SessionRecorder;
			const settings = yield* SettingsStore;
			const audio = yield* AudioNotification;
			const notifier = yield* Notifier;
			const screen = yield* ScreenWake;
			const scope = yield* Effect.scope;

			const record = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
				effect.pipe(Effect.forkIn(scope), Effect.asVoid);

			const start = Effect.fn("Pomodoro.start")(function* () {
				const before = yield* timer.get;
				if (before.status === "running") return;
				yield* notifier.requestPermission.pipe(Effect.forkIn(scope));
				yield* timer.start();
				if (before.phase === "idle") {
					yield* record(recorder.beginPomodoro(before.config.focusSeconds));
				}
			});

			const skip = Effect.fn("Pomodoro.skip")(function* () {
				const before = yield* timer.get;
				if (before.phase === "idle") return;
				yield* timer.switchPhase();
				yield* record(
					before.phase === "focus"
						? recorder.focusToBreak(
								before.elapsedSeconds,
								before.config.durationOf(before.nextBreak),
							)
						: recorder.breakToFocus(
								before.elapsedSeconds,
								before.config.focusSeconds,
							),
				);
			});

			const stop = Effect.fn("Pomodoro.stop")(function* () {
				const before = yield* timer.get;
				if (before.phase === "idle") return;
				yield* timer.stop();
				yield* record(recorder.end(before.phase, before.elapsedSeconds));
			});

			const updateSettings = (f: (current: Settings) => Settings) =>
				settings.update(f);

			const setPreset = (preset: NamedPreset) =>
				settings.update(
					(current) =>
						new Settings({ ...current, timer: TIMER_PRESETS[preset] }),
				);

			yield* settings.changes.pipe(
				Stream.map((current) => current.timer),
				Stream.changes,
				Stream.runForEach(timer.setConfig),
				Effect.forkIn(scope),
			);

			yield* timer.completions.pipe(
				Stream.runForEach((phase) =>
					Effect.gen(function* () {
						const current = yield* settings.get;
						const [title, body] = NOTICES[phase === "idle" ? "focus" : phase];
						yield* audio.play(current.chime, current.chimeVolume);
						yield* notifier.notify(title, body);
						const autoStart =
							phase === "focus"
								? current.autoStartBreaks
								: current.autoStartFocus;
						if (autoStart && (phase === "focus" || isBreak(phase))) {
							yield* skip();
						}
					}),
				),
				Effect.forkIn(scope),
			);

			yield* timer.changes.pipe(
				Stream.map((state) => state.status === "running"),
				Stream.changes,
				Stream.runForEach(screen.keepAwake),
				Effect.forkIn(scope),
			);

			return {
				start,
				skip,
				stop,
				reset: () => timer.reset(),
				setPreset,
				updateSettings,
				relabel: (label: Option.Option<string>) =>
					record(recorder.relabel(label)),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
