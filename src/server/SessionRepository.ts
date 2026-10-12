/**
 * Persistence for pomodoros, focus sessions, and break sessions.
 *
 * @module
 */
import {
	Clock,
	Context,
	DateTime,
	Effect,
	Layer,
	Option,
	Schema,
} from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import {
	BreakSession,
	BreakSessionId,
	BreakSessionNotFound,
	type CompleteSession,
	FocusSession,
	FocusSessionId,
	FocusSessionNotFound,
	Pomodoro,
	PomodoroId,
	PomodoroNotFound,
	Seconds,
	type StartSession,
} from "@/shared/domain/Session";
import { computeStats } from "./Stats";

const Completion = <Id extends Schema.Top>(id: Id) =>
	Schema.Struct({
		id,
		elapsedSeconds: Seconds,
		completedAt: Schema.DateTimeUtcFromMillis,
	});

/**
 * Repository for recording pomodoro cycles and reading statistics.
 *
 * Database and decoding failures are defects; only missing records are
 * expected errors.
 *
 * @since 0.2.0
 * @category Services
 */
export class SessionRepository extends Context.Service<SessionRepository>()(
	"spotify-pomodoro/server/SessionRepository",
	{
		make: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const insertPomodoro = SqlSchema.findOne({
				Request: Pomodoro.insert,
				Result: Pomodoro,
				execute: (row) =>
					sql`INSERT INTO pomodoros ${sql.insert(row)} RETURNING *`,
			});
			const findPomodoro = SqlSchema.findOneOption({
				Request: PomodoroId,
				Result: Pomodoro,
				execute: (id) => sql`SELECT * FROM pomodoros WHERE id = ${id}`,
			});
			const markPomodoroComplete = SqlSchema.findOneOption({
				Request: Schema.Struct({
					id: PomodoroId,
					completedAt: Schema.DateTimeUtcFromMillis,
				}),
				Result: Pomodoro,
				execute: ({ id, completedAt }) =>
					sql`UPDATE pomodoros SET completed_at = ${completedAt} WHERE id = ${id} RETURNING *`,
			});
			const allPomodoros = SqlSchema.findAll({
				Request: Schema.Void,
				Result: Pomodoro,
				execute: () => sql`SELECT * FROM pomodoros`,
			});

			const insertFocus = SqlSchema.findOne({
				Request: FocusSession.insert,
				Result: FocusSession,
				execute: (row) =>
					sql`INSERT INTO focus_sessions ${sql.insert(row)} RETURNING *`,
			});
			const markFocusComplete = SqlSchema.findOneOption({
				Request: Completion(FocusSessionId),
				Result: FocusSession,
				execute: ({ id, elapsedSeconds, completedAt }) =>
					sql`UPDATE focus_sessions SET elapsed_seconds = ${elapsedSeconds}, completed_at = ${completedAt}, completed = 1 WHERE id = ${id} RETURNING *`,
			});
			const allFocus = SqlSchema.findAll({
				Request: Schema.Void,
				Result: FocusSession,
				execute: () => sql`SELECT * FROM focus_sessions`,
			});

			const insertBreak = SqlSchema.findOne({
				Request: BreakSession.insert,
				Result: BreakSession,
				execute: (row) =>
					sql`INSERT INTO break_sessions ${sql.insert(row)} RETURNING *`,
			});
			const markBreakComplete = SqlSchema.findOneOption({
				Request: Completion(BreakSessionId),
				Result: BreakSession,
				execute: ({ id, elapsedSeconds, completedAt }) =>
					sql`UPDATE break_sessions SET elapsed_seconds = ${elapsedSeconds}, completed_at = ${completedAt}, completed = 1 WHERE id = ${id} RETURNING *`,
			});
			const allBreaks = SqlSchema.findAll({
				Request: Schema.Void,
				Result: BreakSession,
				execute: () => sql`SELECT * FROM break_sessions`,
			});

			const requirePomodoro = (id: PomodoroId) =>
				findPomodoro(id).pipe(
					Effect.orDie,
					Effect.flatMap(
						Option.match({
							onNone: () => Effect.fail(new PomodoroNotFound({ id })),
							onSome: Effect.succeed,
						}),
					),
				);

			const sessionDraft = (input: StartSession) => ({
				pomodoroId: input.pomodoroId,
				configuredSeconds: input.configuredSeconds,
				elapsedSeconds: 0,
				completedAt: Option.none(),
				completed: false,
			});

			const createPomodoro = Effect.fn("SessionRepository.createPomodoro")(
				function* () {
					const row = yield* Pomodoro.insert.makeEffect({
						completedAt: Option.none(),
					});
					const pomodoro = yield* insertPomodoro(row);
					yield* Effect.annotateCurrentSpan("pomodoroId", pomodoro.id);
					return pomodoro;
				},
				Effect.orDie,
			);

			const completePomodoro = Effect.fn("SessionRepository.completePomodoro")(
				function* (id: PomodoroId) {
					yield* Effect.annotateCurrentSpan("pomodoroId", id);
					const completedAt = yield* DateTime.now;
					const updated = yield* Effect.orDie(
						markPomodoroComplete({ id, completedAt }),
					);
					return yield* Option.match(updated, {
						onNone: () => Effect.fail(new PomodoroNotFound({ id })),
						onSome: Effect.succeed,
					});
				},
			);

			const startFocus = Effect.fn("SessionRepository.startFocus")(function* (
				input: StartSession,
			) {
				yield* requirePomodoro(input.pomodoroId);
				const row = yield* Effect.orDie(
					FocusSession.insert.makeEffect(sessionDraft(input)),
				);
				return yield* Effect.orDie(insertFocus(row));
			});

			const completeFocus = Effect.fn("SessionRepository.completeFocus")(
				function* (id: FocusSessionId, input: CompleteSession) {
					yield* Effect.annotateCurrentSpan({
						sessionId: id,
						elapsedSeconds: input.elapsedSeconds,
					});
					const completedAt = yield* DateTime.now;
					const updated = yield* Effect.orDie(
						markFocusComplete({
							id,
							elapsedSeconds: input.elapsedSeconds,
							completedAt,
						}),
					);
					return yield* Option.match(updated, {
						onNone: () => Effect.fail(new FocusSessionNotFound({ id })),
						onSome: Effect.succeed,
					});
				},
			);

			const startBreak = Effect.fn("SessionRepository.startBreak")(function* (
				input: StartSession,
			) {
				yield* requirePomodoro(input.pomodoroId);
				const row = yield* Effect.orDie(
					BreakSession.insert.makeEffect(sessionDraft(input)),
				);
				return yield* Effect.orDie(insertBreak(row));
			});

			const completeBreak = Effect.fn("SessionRepository.completeBreak")(
				function* (id: BreakSessionId, input: CompleteSession) {
					yield* Effect.annotateCurrentSpan({
						sessionId: id,
						elapsedSeconds: input.elapsedSeconds,
					});
					const completedAt = yield* DateTime.now;
					const updated = yield* Effect.orDie(
						markBreakComplete({
							id,
							elapsedSeconds: input.elapsedSeconds,
							completedAt,
						}),
					);
					return yield* Option.match(updated, {
						onNone: () => Effect.fail(new BreakSessionNotFound({ id })),
						onSome: Effect.succeed,
					});
				},
			);

			const stats = Effect.fn("SessionRepository.stats")(function* (
				timeZone: DateTime.TimeZone,
			) {
				const [pomodoros, focusSessions, breakSessions] = yield* Effect.all(
					[allPomodoros(), allFocus(), allBreaks()],
					{ concurrency: "unbounded" },
				);
				const now = DateTime.makeZonedUnsafe(yield* Clock.currentTimeMillis, {
					timeZone,
				});
				return computeStats({ pomodoros, focusSessions, breakSessions, now });
			}, Effect.orDie);

			return {
				createPomodoro,
				completePomodoro,
				startFocus,
				completeFocus,
				startBreak,
				completeBreak,
				stats,
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
