/**
 * Durable, ordered queue of recording calls that survives being offline.
 *
 * @module
 */
import {
	Cause,
	Context,
	type Duration,
	Effect,
	Layer,
	Option,
	Predicate,
	PubSub,
	Queue,
	Schema,
	Stream,
	SubscriptionRef,
} from "effect";
import { HttpClientError } from "effect/http";
import { KeyValueStore } from "effect/persistence";
import {
	BreakSessionId,
	FocusSessionId,
	Millis,
	PomodoroId,
	PomodoroLabel,
	Seconds,
} from "@/shared/domain/Session";
import { ApiClient } from "./ApiClient";

/**
 * One recording call, with the ids and times decided on the client.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const OutboxOp = Schema.Union([
	Schema.TaggedStruct("CreatePomodoro", {
		id: PomodoroId,
		label: Schema.NullOr(PomodoroLabel),
		at: Millis,
	}),
	Schema.TaggedStruct("CompletePomodoro", { id: PomodoroId, at: Millis }),
	Schema.TaggedStruct("LabelPomodoro", {
		id: PomodoroId,
		label: Schema.NullOr(PomodoroLabel),
	}),
	Schema.TaggedStruct("StartFocus", {
		id: FocusSessionId,
		pomodoroId: PomodoroId,
		configuredSeconds: Seconds,
		at: Millis,
	}),
	Schema.TaggedStruct("CompleteFocus", {
		id: FocusSessionId,
		elapsedSeconds: Seconds,
		at: Millis,
	}),
	Schema.TaggedStruct("StartBreak", {
		id: BreakSessionId,
		pomodoroId: PomodoroId,
		configuredSeconds: Seconds,
		at: Millis,
	}),
	Schema.TaggedStruct("CompleteBreak", {
		id: BreakSessionId,
		elapsedSeconds: Seconds,
		at: Millis,
	}),
]);

/**
 * @since 2.1.0
 * @category Schemas
 */
export type OutboxOp = typeof OutboxOp.Type;

/**
 * Storage key for queued calls.
 *
 * @since 2.1.0
 * @category Config
 */
export const OUTBOX_STORAGE_KEY = "pomodoro_outbox";

const RETRY_DELAYS: ReadonlyArray<Duration.Input> = [
	"2 seconds",
	"5 seconds",
	"15 seconds",
	"1 minute",
];

/**
 * Whether a failure might succeed later: no connection, a server error, or
 * an expired login.
 *
 * @since 2.1.0
 * @category Functions
 */
export const isRetryable = (error: unknown): boolean => {
	if (HttpClientError.isHttpClientError(error)) {
		const reason = error.reason;
		if (reason._tag === "TransportError") return true;
		if ("response" in reason) {
			const { status } = reason.response;
			return status >= 500 || status === 401;
		}
		return false;
	}
	return Predicate.isTagged(error, "Unauthorized");
};

/**
 * Sends queued calls one at a time, in order.
 *
 * Calls are saved before sending, so a reload or going offline loses
 * nothing; retryable failures are retried with backoff and as soon as the
 * browser is back online. A call the server rejects for good is dropped
 * with a warning so it cannot block the queue.
 *
 * @since 2.1.0
 * @category Services
 */
export class Outbox extends Context.Service<Outbox>()(
	"spotify-pomodoro/client/Outbox",
	{
		make: Effect.gen(function* () {
			const api = yield* ApiClient;
			const store = KeyValueStore.toSchemaStore(
				yield* KeyValueStore.KeyValueStore,
				Schema.Array(OutboxOp),
			);
			const pending = yield* SubscriptionRef.make<ReadonlyArray<OutboxOp>>(
				yield* store.get(OUTBOX_STORAGE_KEY).pipe(
					Effect.map(Option.getOrElse((): ReadonlyArray<OutboxOp> => [])),
					Effect.catch(() => Effect.succeed([])),
				),
			);
			const wake = yield* Queue.sliding<void>(1);
			const flushed = yield* PubSub.unbounded<OutboxOp>();

			const save = Effect.flatMap(SubscriptionRef.get(pending), (ops) =>
				store.set(OUTBOX_STORAGE_KEY, ops).pipe(Effect.ignore),
			);

			const send = (op: OutboxOp): Effect.Effect<unknown, unknown> => {
				switch (op._tag) {
					case "CreatePomodoro":
						return api.sessions.createPomodoro({
							query: { id: op.id, at: op.at, label: op.label ?? undefined },
						});
					case "CompletePomodoro":
						return api.sessions.completePomodoro({
							params: { id: op.id },
							query: { at: op.at },
						});
					case "LabelPomodoro":
						return api.sessions.labelPomodoro({
							params: { id: op.id },
							payload: { label: op.label },
						});
					case "StartFocus":
						return api.sessions.startFocus({
							payload: {
								id: op.id,
								pomodoroId: op.pomodoroId,
								configuredSeconds: op.configuredSeconds,
								at: op.at,
							},
						});
					case "CompleteFocus":
						return api.sessions.completeFocus({
							params: { id: op.id },
							payload: { elapsedSeconds: op.elapsedSeconds, at: op.at },
						});
					case "StartBreak":
						return api.sessions.startBreak({
							payload: {
								id: op.id,
								pomodoroId: op.pomodoroId,
								configuredSeconds: op.configuredSeconds,
								at: op.at,
							},
						});
					case "CompleteBreak":
						return api.sessions.completeBreak({
							params: { id: op.id },
							payload: { elapsedSeconds: op.elapsedSeconds, at: op.at },
						});
				}
			};

			const dropHead = SubscriptionRef.update(pending, (ops) =>
				ops.slice(1),
			).pipe(Effect.andThen(save));

			const worker = Effect.gen(function* () {
				let attempt = 0;
				while (true) {
					const [head] = yield* SubscriptionRef.get(pending);
					if (head === undefined) {
						attempt = 0;
						yield* Queue.take(wake);
						continue;
					}
					const exit = yield* Effect.exit(send(head));
					if (exit._tag === "Success") {
						attempt = 0;
						yield* dropHead;
						yield* PubSub.publish(flushed, head);
						continue;
					}
					const error = Cause.squash(exit.cause);
					if (!isRetryable(error)) {
						yield* Effect.logWarning(
							"Dropping a recording the server rejected",
							{
								op: head._tag,
								error: String(error),
							},
						);
						attempt = 0;
						yield* dropHead;
						continue;
					}
					const delay =
						RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)] ??
						"1 minute";
					attempt++;
					yield* Effect.raceFirst(Effect.sleep(delay), Queue.take(wake));
				}
			}).pipe(Effect.withSpan("Outbox.worker"));

			yield* Effect.forkScoped(worker);

			if (Predicate.hasProperty(globalThis, "addEventListener")) {
				const context = yield* Effect.context();
				yield* Effect.acquireRelease(
					Effect.sync(() => {
						const onOnline = () => {
							void Effect.runPromiseWith(context)(Queue.offer(wake, undefined));
						};
						globalThis.addEventListener("online", onOnline);
						return onOnline;
					}),
					(onOnline) =>
						Effect.sync(() =>
							globalThis.removeEventListener("online", onOnline),
						),
				);
			}

			const enqueue = Effect.fn("Outbox.enqueue")(function* (
				...ops: ReadonlyArray<OutboxOp>
			) {
				yield* SubscriptionRef.update(pending, (current) => [
					...current,
					...ops,
				]);
				yield* save;
				yield* Queue.offer(wake, undefined);
			});

			return {
				enqueue,
				pendingCount: SubscriptionRef.changes(pending).pipe(
					Stream.map((ops) => ops.length),
					Stream.changes,
				),
				flushed: Stream.fromPubSub(flushed),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
