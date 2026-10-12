/**
 * The pomodoro controls: timer transitions plus session recording.
 *
 * @module
 */
import { Context, Effect, Layer, Stream } from "effect";
import type { TimerPreset } from "@/shared/domain/Timer";
import { AudioNotification } from "./AudioNotification";
import { SessionRecorder } from "./SessionRecorder";
import { Timer } from "./Timer";

/**
 * User-facing pomodoro actions.
 *
 * The timer updates immediately; the matching recording runs in the
 * background, in order. A chime plays whenever a phase reaches zero.
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
			const audio = yield* AudioNotification;
			const scope = yield* Effect.scope;

			yield* timer.completions.pipe(
				Stream.runForEach(() => audio.play),
				Effect.forkIn(scope),
			);

			const record = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
				effect.pipe(Effect.forkIn(scope), Effect.asVoid);

			const start = Effect.fn("Pomodoro.start")(function* () {
				const before = yield* timer.get;
				if (before.status === "running") return;
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
								before.config.breakSeconds,
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

			return {
				start,
				skip,
				stop,
				reset: () => timer.reset(),
				setPreset: (preset: TimerPreset) => timer.setPreset(preset),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
