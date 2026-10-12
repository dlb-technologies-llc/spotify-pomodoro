/**
 * Records pomodoros and their sessions through the API.
 *
 * @module
 */
import { Context, Effect, Layer, Option, Ref, Semaphore } from "effect";
import type {
	BreakSessionId,
	FocusSessionId,
	PomodoroId,
} from "@/shared/domain/Session";
import type { TimerPhase } from "@/shared/domain/Timer";
import { ApiClient } from "./ApiClient";

/**
 * Tracks the pomodoro and session currently being recorded.
 *
 * Calls run one at a time in the order made. A failed call is logged and
 * skipped so recording problems never block the timer.
 *
 * @since 2.0.0
 * @category Services
 */
export class SessionRecorder extends Context.Service<SessionRecorder>()(
	"spotify-pomodoro/client/SessionRecorder",
	{
		make: Effect.gen(function* () {
			const api = yield* ApiClient;
			const lock = yield* Semaphore.make(1);
			const pomodoro = yield* Ref.make(Option.none<PomodoroId>());
			const focus = yield* Ref.make(Option.none<FocusSessionId>());
			const breakSession = yield* Ref.make(Option.none<BreakSessionId>());

			const attempt = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
				effect.pipe(
					Effect.asSome,
					Effect.catchCause((cause) =>
						Effect.logWarning("Session recording failed", cause).pipe(
							Effect.as(Option.none<A>()),
						),
					),
				);

			const take = <A>(ref: Ref.Ref<Option.Option<A>>) =>
				Ref.getAndSet(ref, Option.none());

			const startFocus = Effect.fn("SessionRecorder.startFocus")(function* (
				configuredSeconds: number,
			) {
				const created = yield* attempt(api.sessions.createPomodoro());
				yield* Ref.set(
					pomodoro,
					Option.map(created, (p) => p.id),
				);
				if (Option.isNone(created)) return;
				const session = yield* attempt(
					api.sessions.startFocus({
						payload: { pomodoroId: created.value.id, configuredSeconds },
					}),
				);
				yield* Ref.set(
					focus,
					Option.map(session, (s) => s.id),
				);
			});

			const completeFocus = Effect.fn("SessionRecorder.completeFocus")(
				function* (elapsedSeconds: number) {
					const id = yield* take(focus);
					if (Option.isNone(id)) return;
					yield* attempt(
						api.sessions.completeFocus({
							params: { id: id.value },
							payload: { elapsedSeconds },
						}),
					);
				},
			);

			const startBreak = Effect.fn("SessionRecorder.startBreak")(function* (
				configuredSeconds: number,
			) {
				const pomodoroId = yield* Ref.get(pomodoro);
				if (Option.isNone(pomodoroId)) return;
				const session = yield* attempt(
					api.sessions.startBreak({
						payload: { pomodoroId: pomodoroId.value, configuredSeconds },
					}),
				);
				yield* Ref.set(
					breakSession,
					Option.map(session, (s) => s.id),
				);
			});

			const completeBreak = Effect.fn("SessionRecorder.completeBreak")(
				function* (elapsedSeconds: number) {
					const id = yield* take(breakSession);
					if (Option.isNone(id)) return;
					yield* attempt(
						api.sessions.completeBreak({
							params: { id: id.value },
							payload: { elapsedSeconds },
						}),
					);
				},
			);

			const completePomodoro = Effect.fn("SessionRecorder.completePomodoro")(
				function* () {
					const id = yield* take(pomodoro);
					if (Option.isNone(id)) return;
					yield* attempt(
						api.sessions.completePomodoro({ params: { id: id.value } }),
					);
				},
			);

			const completeSession = (phase: TimerPhase, elapsedSeconds: number) =>
				phase === "focus"
					? completeFocus(elapsedSeconds)
					: phase === "break"
						? completeBreak(elapsedSeconds)
						: Effect.void;

			const serial = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
				lock.withPermits(1)(effect);

			return {
				beginPomodoro: (focusSeconds: number) =>
					serial(startFocus(focusSeconds)),
				focusToBreak: (elapsedSeconds: number, breakSeconds: number) =>
					serial(
						completeFocus(elapsedSeconds).pipe(
							Effect.andThen(startBreak(breakSeconds)),
						),
					),
				breakToFocus: (elapsedSeconds: number, focusSeconds: number) =>
					serial(
						completeBreak(elapsedSeconds).pipe(
							Effect.andThen(completePomodoro()),
							Effect.andThen(startFocus(focusSeconds)),
						),
					),
				end: (phase: TimerPhase, elapsedSeconds: number) =>
					serial(
						completeSession(phase, elapsedSeconds).pipe(
							Effect.andThen(completePomodoro()),
						),
					),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
