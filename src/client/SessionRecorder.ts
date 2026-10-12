/**
 * Records pomodoros and their sessions through the API.
 *
 * @module
 */
import {
	Context,
	Effect,
	Layer,
	Option,
	PubSub,
	Semaphore,
	Stream,
	SubscriptionRef,
} from "effect";
import { KeyValueStore } from "effect/persistence";
import { type PomodoroId, RecordingIds } from "@/shared/domain/Session";
import { isBreak, type TimerPhase } from "@/shared/domain/Timer";
import { ApiClient } from "./ApiClient";

/**
 * Storage key for the ids being recorded.
 *
 * @since 2.1.0
 * @category Config
 */
export const RECORDING_STORAGE_KEY = "pomodoro_recording";

/**
 * Tracks the pomodoro and session currently being recorded.
 *
 * Calls run one at a time in the order made. A failed call is logged and
 * skipped so recording problems never block the timer. The ids are saved, so
 * a session started before a reload is still completed after it.
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
			const store = KeyValueStore.toSchemaStore(
				yield* KeyValueStore.KeyValueStore,
				RecordingIds,
			);
			const completed = yield* PubSub.unbounded<PomodoroId>();
			const ids = yield* SubscriptionRef.make(
				yield* store.get(RECORDING_STORAGE_KEY).pipe(
					Effect.map(Option.getOrElse(() => RecordingIds.empty)),
					Effect.catch(() => Effect.succeed(RecordingIds.empty)),
				),
			);

			const update = (f: (current: RecordingIds) => RecordingIds) =>
				SubscriptionRef.updateAndGet(ids, f).pipe(
					Effect.flatMap((next) =>
						store.set(RECORDING_STORAGE_KEY, next).pipe(Effect.ignore),
					),
				);

			const attempt = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
				effect.pipe(
					Effect.asSome,
					Effect.catchCause((cause) =>
						Effect.logWarning("Session recording failed", cause).pipe(
							Effect.as(Option.none<A>()),
						),
					),
				);

			const startFocus = Effect.fn("SessionRecorder.startFocus")(function* (
				configuredSeconds: number,
			) {
				const { label } = yield* SubscriptionRef.get(ids);
				const created = yield* attempt(
					api.sessions.createPomodoro({
						query: { label: Option.getOrUndefined(label) },
					}),
				);
				yield* update(
					(current) =>
						new RecordingIds({
							...RecordingIds.empty,
							label: current.label,
							pomodoro: Option.map(created, (p) => p.id),
						}),
				);
				if (Option.isNone(created)) return;
				const session = yield* attempt(
					api.sessions.startFocus({
						payload: { pomodoroId: created.value.id, configuredSeconds },
					}),
				);
				yield* update(
					(current) =>
						new RecordingIds({
							...current,
							focus: Option.map(session, (s) => s.id),
						}),
				);
			});

			const completeFocus = Effect.fn("SessionRecorder.completeFocus")(
				function* (elapsedSeconds: number) {
					const { focus } = yield* SubscriptionRef.get(ids);
					yield* update(
						(current) => new RecordingIds({ ...current, focus: Option.none() }),
					);
					if (Option.isNone(focus)) return;
					yield* attempt(
						api.sessions.completeFocus({
							params: { id: focus.value },
							payload: { elapsedSeconds },
						}),
					);
				},
			);

			const startBreak = Effect.fn("SessionRecorder.startBreak")(function* (
				configuredSeconds: number,
			) {
				const { pomodoro } = yield* SubscriptionRef.get(ids);
				if (Option.isNone(pomodoro)) return;
				const session = yield* attempt(
					api.sessions.startBreak({
						payload: { pomodoroId: pomodoro.value, configuredSeconds },
					}),
				);
				yield* update(
					(current) =>
						new RecordingIds({
							...current,
							break: Option.map(session, (s) => s.id),
						}),
				);
			});

			const completeBreak = Effect.fn("SessionRecorder.completeBreak")(
				function* (elapsedSeconds: number) {
					const current = yield* SubscriptionRef.get(ids);
					yield* update(
						(latest) => new RecordingIds({ ...latest, break: Option.none() }),
					);
					if (Option.isNone(current.break)) return;
					yield* attempt(
						api.sessions.completeBreak({
							params: { id: current.break.value },
							payload: { elapsedSeconds },
						}),
					);
				},
			);

			const completePomodoro = Effect.fn("SessionRecorder.completePomodoro")(
				function* () {
					const { pomodoro } = yield* SubscriptionRef.get(ids);
					yield* update(
						(current) =>
							new RecordingIds({ ...RecordingIds.empty, label: current.label }),
					);
					if (Option.isNone(pomodoro)) return;
					const done = yield* attempt(
						api.sessions.completePomodoro({ params: { id: pomodoro.value } }),
					);
					if (Option.isSome(done)) {
						yield* PubSub.publish(completed, pomodoro.value);
					}
				},
			);

			const completeSession = (phase: TimerPhase, elapsedSeconds: number) =>
				phase === "focus"
					? completeFocus(elapsedSeconds)
					: isBreak(phase)
						? completeBreak(elapsedSeconds)
						: Effect.void;

			const serial = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
				lock.withPermits(1)(effect);

			const relabel = Effect.fn("SessionRecorder.relabel")(function* (
				label: Option.Option<string>,
			) {
				const { pomodoro } = yield* SubscriptionRef.get(ids);
				yield* update((current) => new RecordingIds({ ...current, label }));
				if (Option.isNone(pomodoro)) return;
				yield* attempt(
					api.sessions.labelPomodoro({
						params: { id: pomodoro.value },
						payload: { label: Option.getOrNull(label) },
					}),
				);
			});

			return {
				label: ids.pipe(
					SubscriptionRef.changes,
					Stream.map((current) => current.label),
					Stream.changes,
				),
				completed: Stream.fromPubSub(completed),
				relabel: (label: Option.Option<string>) => serial(relabel(label)),
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
