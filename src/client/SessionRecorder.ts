/**
 * Records pomodoros and their sessions through the outbox.
 *
 * @module
 */
import {
	Clock,
	Context,
	Effect,
	Layer,
	Option,
	Schema,
	Stream,
	SubscriptionRef,
} from "effect";
import { KeyValueStore } from "effect/persistence";
import {
	BreakSessionId,
	FocusSessionId,
	PomodoroId,
	RecordingIds,
} from "@/shared/domain/Session";
import { isBreak, type TimerPhase } from "@/shared/domain/Timer";
import { Outbox, type OutboxOp } from "./Outbox";

/**
 * Storage key for the ids being recorded.
 *
 * @since 2.1.0
 * @category Config
 */
export const RECORDING_STORAGE_KEY = "pomodoro_recording";

const newId = <S extends Schema.Top>(schema: S) =>
	Effect.sync(() => crypto.randomUUID()).pipe(
		Effect.flatMap(Schema.decodeUnknownEffect(schema)),
		Effect.orDie,
	);

/**
 * Tracks the pomodoro and session being recorded and queues the matching
 * API calls.
 *
 * Ids and times are decided here, so recording works offline: the outbox
 * sends the calls in order whenever the server is reachable. The ids are
 * saved, so a session started before a reload is still completed after it.
 *
 * @since 2.0.0
 * @category Services
 */
export class SessionRecorder extends Context.Service<SessionRecorder>()(
	"spotify-pomodoro/client/SessionRecorder",
	{
		make: Effect.gen(function* () {
			const outbox = yield* Outbox;
			const store = KeyValueStore.toSchemaStore(
				yield* KeyValueStore.KeyValueStore,
				RecordingIds,
			);
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

			const queue = (ops: ReadonlyArray<OutboxOp>) =>
				ops.length === 0 ? Effect.void : outbox.enqueue(...ops);

			const startPomodoro = Effect.fn("SessionRecorder.startPomodoro")(
				function* (focusSeconds: number) {
					const at = yield* Clock.currentTimeMillis;
					const pomodoro = yield* newId(PomodoroId);
					const focus = yield* newId(FocusSessionId);
					const { label } = yield* SubscriptionRef.get(ids);
					yield* update(
						(current) =>
							new RecordingIds({
								...RecordingIds.empty,
								label: current.label,
								pomodoro: Option.some(pomodoro),
								focus: Option.some(focus),
							}),
					);
					const ops: ReadonlyArray<OutboxOp> = [
						{
							_tag: "CreatePomodoro",
							id: pomodoro,
							label: Option.getOrNull(label),
							at,
						},
						{
							_tag: "StartFocus",
							id: focus,
							pomodoroId: pomodoro,
							configuredSeconds: focusSeconds,
							at,
						},
					];
					return ops;
				},
			);

			const finishSession = Effect.fn("SessionRecorder.finishSession")(
				function* (phase: TimerPhase, elapsedSeconds: number) {
					const at = yield* Clock.currentTimeMillis;
					const current = yield* SubscriptionRef.get(ids);
					const ops: Array<OutboxOp> = [];
					if (phase === "focus" && Option.isSome(current.focus)) {
						ops.push({
							_tag: "CompleteFocus",
							id: current.focus.value,
							elapsedSeconds,
							at,
						});
					}
					if (isBreak(phase) && Option.isSome(current.break)) {
						ops.push({
							_tag: "CompleteBreak",
							id: current.break.value,
							elapsedSeconds,
							at,
						});
					}
					yield* update(
						(latest) =>
							new RecordingIds({
								...latest,
								focus: Option.none(),
								break: Option.none(),
							}),
					);
					return ops;
				},
			);

			const finishPomodoro = Effect.fn("SessionRecorder.finishPomodoro")(
				function* () {
					const at = yield* Clock.currentTimeMillis;
					const { pomodoro } = yield* SubscriptionRef.get(ids);
					yield* update(
						(current) =>
							new RecordingIds({ ...RecordingIds.empty, label: current.label }),
					);
					const ops: ReadonlyArray<OutboxOp> = Option.match(pomodoro, {
						onNone: () => [],
						onSome: (id) => [{ _tag: "CompletePomodoro", id, at }],
					});
					return ops;
				},
			);

			const startBreak = Effect.fn("SessionRecorder.startBreak")(function* (
				breakSeconds: number,
			) {
				const at = yield* Clock.currentTimeMillis;
				const { pomodoro } = yield* SubscriptionRef.get(ids);
				if (Option.isNone(pomodoro)) return [];
				const id = yield* newId(BreakSessionId);
				yield* update(
					(current) => new RecordingIds({ ...current, break: Option.some(id) }),
				);
				const ops: ReadonlyArray<OutboxOp> = [
					{
						_tag: "StartBreak",
						id,
						pomodoroId: pomodoro.value,
						configuredSeconds: breakSeconds,
						at,
					},
				];
				return ops;
			});

			const relabel = Effect.fn("SessionRecorder.relabel")(function* (
				label: Option.Option<string>,
			) {
				const { pomodoro } = yield* SubscriptionRef.get(ids);
				yield* update((current) => new RecordingIds({ ...current, label }));
				if (Option.isSome(pomodoro)) {
					yield* queue([
						{
							_tag: "LabelPomodoro",
							id: pomodoro.value,
							label: Option.getOrNull(label),
						},
					]);
				}
			});

			return {
				label: SubscriptionRef.changes(ids).pipe(
					Stream.map((current) => current.label),
					Stream.changes,
				),
				completed: outbox.flushed.pipe(
					Stream.filter((op) => op._tag === "CompletePomodoro"),
					Stream.map((op) => op.id),
				),
				pendingCount: outbox.pendingCount,
				relabel,
				beginPomodoro: (focusSeconds: number) =>
					startPomodoro(focusSeconds).pipe(Effect.flatMap(queue)),
				focusToBreak: (elapsedSeconds: number, breakSeconds: number) =>
					Effect.gen(function* () {
						const done = yield* finishSession("focus", elapsedSeconds);
						const started = yield* startBreak(breakSeconds);
						yield* queue([...done, ...started]);
					}),
				breakToFocus: (elapsedSeconds: number, focusSeconds: number) =>
					Effect.gen(function* () {
						const done = yield* finishSession("break", elapsedSeconds);
						const finished = yield* finishPomodoro();
						const started = yield* startPomodoro(focusSeconds);
						yield* queue([...done, ...finished, ...started]);
					}),
				end: (phase: TimerPhase, elapsedSeconds: number) =>
					Effect.gen(function* () {
						const done = yield* finishSession(phase, elapsedSeconds);
						const finished = yield* finishPomodoro();
						yield* queue([...done, ...finished]);
					}),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
