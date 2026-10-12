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
import { Model } from "effect/schema";
import { SqlClient, SqlSchema } from "effect/sql";
import {
	BreakSession,
	BreakSessionId,
	BreakSessionNotFound,
	type CompleteSession,
	type CreatePomodoro,
	FocusSession,
	FocusSessionId,
	FocusSessionNotFound,
	type LabelPomodoro,
	Pomodoro,
	PomodoroId,
	PomodoroLabel,
	PomodoroNotFound,
	Seconds,
	type StartSession,
} from "@/shared/domain/Session";
import {
	HistoryEntry,
	HistoryPage,
	ImportResult,
} from "@/shared/domain/History";
import { UserName } from "@/shared/domain/Auth";
import { CurrentUser } from "./CurrentUser";
import { computeStats } from "./Stats";

const Completion = <Id extends Schema.Top>(id: Id) =>
	Schema.Struct({
		owner: UserName,
		id,
		elapsedSeconds: Seconds,
		completedAt: Schema.DateTimeUtcFromMillis,
	});

const Owned = <S extends Schema.Top>(row: S) =>
	Schema.Struct({ owner: UserName, row });

/**
 * Repository for recording pomodoro cycles and reading statistics.
 *
 * Every read and write is scoped to the {@link CurrentUser}: other users'
 * records behave as if they did not exist. Database and decoding failures
 * are defects; only missing records are expected errors.
 *
 * @since 0.2.0
 * @category Services
 */
export class SessionRepository extends Context.Service<SessionRepository>()(
	"spotify-pomodoro/server/SessionRepository",
	{
		make: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const owns = (owner: string) =>
				sql`pomodoro_id IN (SELECT id FROM pomodoros WHERE user_id = ${owner})`;

			const insertPomodoro = SqlSchema.findOne({
				Request: Owned(Pomodoro.insert),
				Result: Pomodoro,
				execute: ({ owner, row }) =>
					sql`INSERT INTO pomodoros ${sql.insert({ ...row, userId: owner })} RETURNING *`,
			});
			const findPomodoro = SqlSchema.findOneOption({
				Request: Schema.Struct({ owner: UserName, id: PomodoroId }),
				Result: Pomodoro,
				execute: ({ owner, id }) =>
					sql`SELECT * FROM pomodoros WHERE id = ${id} AND user_id = ${owner}`,
			});
			const markPomodoroComplete = SqlSchema.findOneOption({
				Request: Schema.Struct({
					owner: UserName,
					id: PomodoroId,
					completedAt: Schema.DateTimeUtcFromMillis,
				}),
				Result: Pomodoro,
				execute: ({ owner, id, completedAt }) =>
					sql`UPDATE pomodoros SET completed_at = ${completedAt} WHERE id = ${id} AND user_id = ${owner} RETURNING *`,
			});
			const setPomodoroLabel = SqlSchema.findOneOption({
				Request: Schema.Struct({
					owner: UserName,
					id: PomodoroId,
					label: Schema.NullOr(PomodoroLabel),
				}),
				Result: Pomodoro,
				execute: ({ owner, id, label }) =>
					sql`UPDATE pomodoros SET label = ${label} WHERE id = ${id} AND user_id = ${owner} RETURNING *`,
			});
			const allPomodoros = SqlSchema.findAll({
				Request: UserName,
				Result: Pomodoro,
				execute: (owner) =>
					sql`SELECT * FROM pomodoros WHERE user_id = ${owner}`,
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
				execute: ({ owner, id, elapsedSeconds, completedAt }) =>
					sql`UPDATE focus_sessions SET elapsed_seconds = ${elapsedSeconds}, completed_at = ${completedAt}, completed = 1 WHERE id = ${id} AND ${owns(owner)} RETURNING *`,
			});
			const allFocus = SqlSchema.findAll({
				Request: UserName,
				Result: FocusSession,
				execute: (owner) =>
					sql`SELECT * FROM focus_sessions WHERE ${owns(owner)}`,
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
				execute: ({ owner, id, elapsedSeconds, completedAt }) =>
					sql`UPDATE break_sessions SET elapsed_seconds = ${elapsedSeconds}, completed_at = ${completedAt}, completed = 1 WHERE id = ${id} AND ${owns(owner)} RETURNING *`,
			});
			const allBreaks = SqlSchema.findAll({
				Request: UserName,
				Result: BreakSession,
				execute: (owner) =>
					sql`SELECT * FROM break_sessions WHERE ${owns(owner)}`,
			});

			const pomodorosBefore = SqlSchema.findAll({
				Request: Schema.Struct({
					owner: UserName,
					before: Schema.Number,
					limit: Schema.Int,
				}),
				Result: Pomodoro,
				execute: ({ owner, before, limit }) =>
					sql`SELECT * FROM pomodoros WHERE user_id = ${owner} AND created_at < ${before} ORDER BY created_at DESC LIMIT ${limit}`,
			});
			const focusFor = SqlSchema.findAll({
				Request: Schema.Array(PomodoroId),
				Result: FocusSession,
				execute: (ids) =>
					sql`SELECT * FROM focus_sessions WHERE ${sql.in("pomodoro_id", ids)}`,
			});
			const breaksFor = SqlSchema.findAll({
				Request: Schema.Array(PomodoroId),
				Result: BreakSession,
				execute: (ids) =>
					sql`SELECT * FROM break_sessions WHERE ${sql.in("pomodoro_id", ids)}`,
			});

			const restorePomodoro = SqlSchema.void({
				Request: Owned(Pomodoro),
				execute: ({ owner, row }) =>
					sql`INSERT INTO pomodoros ${sql.insert({ ...row, userId: owner })}`,
			});
			const takenIds = Effect.map(
				sql<{ readonly id: string }>`
					SELECT id FROM pomodoros
					UNION ALL SELECT id FROM focus_sessions
					UNION ALL SELECT id FROM break_sessions
				`,
				(rows) => new Set(rows.map((row) => row.id)),
			);
			const restoreFocus = SqlSchema.void({
				Request: FocusSession,
				execute: (row) => sql`INSERT INTO focus_sessions ${sql.insert(row)}`,
			});
			const restoreBreak = SqlSchema.void({
				Request: BreakSession,
				execute: (row) => sql`INSERT INTO break_sessions ${sql.insert(row)}`,
			});

			const requirePomodoro = (owner: UserName, id: PomodoroId) =>
				findPomodoro({ owner, id }).pipe(
					Effect.orDie,
					Effect.flatMap(
						Option.match({
							onNone: () => Effect.fail(new PomodoroNotFound({ id })),
							onSome: Effect.succeed,
						}),
					),
				);

			const instant = (at: number | undefined) =>
				Effect.map(DateTime.now, (now) =>
					at === undefined || at > DateTime.toEpochMillis(now)
						? now
						: DateTime.makeUnsafe(at),
				);

			const sessionDraft = (input: StartSession, startedAt: DateTime.Utc) => ({
				pomodoroId: input.pomodoroId,
				configuredSeconds: input.configuredSeconds,
				elapsedSeconds: 0,
				startedAt: Model.Override(startedAt),
				createdAt: Model.Override(startedAt),
				completedAt: Option.none(),
				completed: false,
			});

			const findFocus = SqlSchema.findOneOption({
				Request: Schema.Struct({ owner: UserName, id: FocusSessionId }),
				Result: FocusSession,
				execute: ({ owner, id }) =>
					sql`SELECT * FROM focus_sessions WHERE id = ${id} AND ${owns(owner)}`,
			});
			const findBreak = SqlSchema.findOneOption({
				Request: Schema.Struct({ owner: UserName, id: BreakSessionId }),
				Result: BreakSession,
				execute: ({ owner, id }) =>
					sql`SELECT * FROM break_sessions WHERE id = ${id} AND ${owns(owner)}`,
			});
			const decodeFocusId = Schema.decodeEffect(FocusSessionId);
			const decodeBreakId = Schema.decodeEffect(BreakSessionId);

			const createPomodoro = Effect.fn("SessionRepository.createPomodoro")(
				function* (input: CreatePomodoro) {
					const owner = yield* CurrentUser;
					if (input.id !== undefined) {
						const existing = yield* findPomodoro({ owner, id: input.id });
						if (Option.isSome(existing)) return existing.value;
					}
					const row = yield* Pomodoro.insert.makeEffect({
						...(input.id === undefined ? {} : { id: input.id }),
						createdAt: Model.Override(yield* instant(input.at)),
						completedAt: Option.none(),
						label: Option.fromUndefinedOr(input.label),
					});
					const pomodoro = yield* insertPomodoro({ owner, row });
					yield* Effect.annotateCurrentSpan("pomodoroId", pomodoro.id);
					return pomodoro;
				},
				Effect.orDie,
			);

			const completePomodoro = Effect.fn("SessionRepository.completePomodoro")(
				function* (id: PomodoroId, at?: number) {
					yield* Effect.annotateCurrentSpan("pomodoroId", id);
					const owner = yield* CurrentUser;
					const completedAt = yield* instant(at);
					const updated = yield* Effect.orDie(
						markPomodoroComplete({ owner, id, completedAt }),
					);
					return yield* Option.match(updated, {
						onNone: () => Effect.fail(new PomodoroNotFound({ id })),
						onSome: Effect.succeed,
					});
				},
			);

			const labelPomodoro = Effect.fn("SessionRepository.labelPomodoro")(
				function* (id: PomodoroId, input: LabelPomodoro) {
					yield* Effect.annotateCurrentSpan("pomodoroId", id);
					const owner = yield* CurrentUser;
					const updated = yield* Effect.orDie(
						setPomodoroLabel({ owner, id, label: input.label }),
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
				const owner = yield* CurrentUser;
				yield* requirePomodoro(owner, input.pomodoroId);
				const id =
					input.id === undefined
						? undefined
						: yield* Effect.orDie(decodeFocusId(input.id));
				if (id !== undefined) {
					const existing = yield* Effect.orDie(findFocus({ owner, id }));
					if (Option.isSome(existing)) return existing.value;
				}
				const row = yield* Effect.orDie(
					FocusSession.insert.makeEffect({
						...sessionDraft(input, yield* instant(input.at)),
						...(id === undefined ? {} : { id }),
					}),
				);
				return yield* Effect.orDie(insertFocus(row));
			});

			const completeFocus = Effect.fn("SessionRepository.completeFocus")(
				function* (id: FocusSessionId, input: CompleteSession) {
					yield* Effect.annotateCurrentSpan({
						sessionId: id,
						elapsedSeconds: input.elapsedSeconds,
					});
					const owner = yield* CurrentUser;
					const completedAt = yield* instant(input.at);
					const updated = yield* Effect.orDie(
						markFocusComplete({
							owner,
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
				const owner = yield* CurrentUser;
				yield* requirePomodoro(owner, input.pomodoroId);
				const id =
					input.id === undefined
						? undefined
						: yield* Effect.orDie(decodeBreakId(input.id));
				if (id !== undefined) {
					const existing = yield* Effect.orDie(findBreak({ owner, id }));
					if (Option.isSome(existing)) return existing.value;
				}
				const row = yield* Effect.orDie(
					BreakSession.insert.makeEffect({
						...sessionDraft(input, yield* instant(input.at)),
						...(id === undefined ? {} : { id }),
					}),
				);
				return yield* Effect.orDie(insertBreak(row));
			});

			const completeBreak = Effect.fn("SessionRepository.completeBreak")(
				function* (id: BreakSessionId, input: CompleteSession) {
					yield* Effect.annotateCurrentSpan({
						sessionId: id,
						elapsedSeconds: input.elapsedSeconds,
					});
					const owner = yield* CurrentUser;
					const completedAt = yield* instant(input.at);
					const updated = yield* Effect.orDie(
						markBreakComplete({
							owner,
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
				const owner = yield* CurrentUser;
				const [pomodoros, focusSessions, breakSessions] = yield* Effect.all(
					[allPomodoros(owner), allFocus(owner), allBreaks(owner)],
					{ concurrency: "unbounded" },
				);
				const now = DateTime.makeZonedUnsafe(yield* Clock.currentTimeMillis, {
					timeZone,
				});
				return computeStats({ pomodoros, focusSessions, breakSessions, now });
			}, Effect.orDie);

			const history = Effect.fn("SessionRepository.history")(
				function* (options: {
					readonly before: number;
					readonly limit: number;
				}) {
					const rows = yield* pomodorosBefore({
						owner: yield* CurrentUser,
						before: options.before,
						limit: options.limit + 1,
					});
					const page = rows.slice(0, options.limit);
					const ids = page.map((p) => p.id);
					const [focus, breaks] =
						ids.length === 0
							? [[], []]
							: yield* Effect.all([focusFor(ids), breaksFor(ids)], {
									concurrency: "unbounded",
								});
					const items = page.map((pomodoro) => {
						const own = <S extends FocusSession | BreakSession>(
							sessions: ReadonlyArray<S>,
						) =>
							sessions.filter(
								(s) => s.pomodoroId === pomodoro.id && s.completed,
							);
						const f = own(focus);
						const b = own(breaks);
						const total = (list: ReadonlyArray<FocusSession | BreakSession>) =>
							list.reduce((sum, s) => sum + s.elapsedSeconds, 0);
						const extra = (list: ReadonlyArray<FocusSession | BreakSession>) =>
							list.reduce(
								(sum, s) =>
									sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
								0,
							);
						return new HistoryEntry({
							id: pomodoro.id,
							label: pomodoro.label,
							createdAt: pomodoro.createdAt,
							completedAt: pomodoro.completedAt,
							focusSeconds: total(f),
							breakSeconds: total(b),
							overtimeSeconds: extra(f) + extra(b),
							focusSessions: f.length,
							breakSessions: b.length,
						});
					});
					const last = page.at(-1);
					return new HistoryPage({
						items,
						nextBefore:
							rows.length > options.limit && last
								? Option.some(DateTime.toEpochMillis(last.createdAt))
								: Option.none(),
					});
				},
				Effect.orDie,
			);

			const deletePomodoro = Effect.fn("SessionRepository.deletePomodoro")(
				function* (id: PomodoroId) {
					yield* requirePomodoro(yield* CurrentUser, id);
					yield* sql
						.withTransaction(
							Effect.all([
								sql`DELETE FROM focus_sessions WHERE pomodoro_id = ${id}`,
								sql`DELETE FROM break_sessions WHERE pomodoro_id = ${id}`,
								sql`DELETE FROM pomodoros WHERE id = ${id}`,
							]),
						)
						.pipe(Effect.orDie);
				},
			);

			const exportAll = Effect.fn("SessionRepository.exportAll")(function* () {
				const owner = yield* CurrentUser;
				const [pomodoros, focusSessions, breakSessions] = yield* Effect.all(
					[allPomodoros(owner), allFocus(owner), allBreaks(owner)],
					{ concurrency: "unbounded" },
				);
				return { pomodoros, focusSessions, breakSessions };
			}, Effect.orDie);

			const importAll = Effect.fn("SessionRepository.importAll")(
				function* (input: {
					readonly pomodoros: ReadonlyArray<Pomodoro>;
					readonly focusSessions: ReadonlyArray<FocusSession>;
					readonly breakSessions: ReadonlyArray<BreakSession>;
				}) {
					return yield* sql.withTransaction(
						Effect.gen(function* () {
							const owner = yield* CurrentUser;
							const known = yield* takenIds;
							const pomodoroIds = new Set<string>(
								(yield* allPomodoros(owner)).map((p) => p.id),
							);
							let skipped = 0;
							const fresh = <A extends { readonly id: string }>(
								rows: ReadonlyArray<A>,
							) =>
								rows.filter((row) => {
									const isNew = !known.has(row.id);
									if (!isNew) skipped++;
									known.add(row.id);
									return isNew;
								});
							const pomodoros = fresh(input.pomodoros);
							for (const pomodoro of pomodoros) {
								yield* restorePomodoro({
									owner,
									row: new Pomodoro(pomodoro),
								});
								pomodoroIds.add(pomodoro.id);
							}
							const attached = <A extends { readonly pomodoroId: string }>(
								rows: ReadonlyArray<A>,
							) =>
								rows.filter((row) => {
									const ok = pomodoroIds.has(row.pomodoroId);
									if (!ok) skipped++;
									return ok;
								});
							const focusSessions = attached(fresh(input.focusSessions));
							for (const session of focusSessions) {
								yield* restoreFocus(new FocusSession(session));
							}
							const breakSessions = attached(fresh(input.breakSessions));
							for (const session of breakSessions) {
								yield* restoreBreak(new BreakSession(session));
							}
							return new ImportResult({
								pomodoros: pomodoros.length,
								focusSessions: focusSessions.length,
								breakSessions: breakSessions.length,
								skipped,
							});
						}),
					);
				},
				Effect.orDie,
			);

			const cleanupAbandoned = Effect.fn("SessionRepository.cleanupAbandoned")(
				function* (olderThan: DateTime.Utc) {
					const cutoff = DateTime.toEpochMillis(olderThan);
					return yield* sql.withTransaction(
						Effect.gen(function* () {
							yield* sql`
								UPDATE pomodoros SET completed_at = (
									SELECT MAX(completed_at) FROM (
										SELECT completed_at FROM focus_sessions WHERE pomodoro_id = pomodoros.id AND completed = 1
										UNION ALL
										SELECT completed_at FROM break_sessions WHERE pomodoro_id = pomodoros.id AND completed = 1
									)
								)
								WHERE completed_at IS NULL AND created_at < ${cutoff}
							`;
							const orphans = yield* sql<{ readonly id: string }>`
								SELECT id FROM pomodoros WHERE completed_at IS NULL AND created_at < ${cutoff}
							`;
							const ids = orphans.map((row) => row.id);
							if (ids.length > 0) {
								yield* sql`DELETE FROM focus_sessions WHERE ${sql.in("pomodoro_id", ids)}`;
								yield* sql`DELETE FROM break_sessions WHERE ${sql.in("pomodoro_id", ids)}`;
								yield* sql`DELETE FROM pomodoros WHERE ${sql.in("id", ids)}`;
							}
							yield* sql`DELETE FROM focus_sessions WHERE completed = 0 AND created_at < ${cutoff}`;
							yield* sql`DELETE FROM break_sessions WHERE completed = 0 AND created_at < ${cutoff}`;
							return ids.length;
						}),
					);
				},
				Effect.orDie,
			);

			return {
				history,
				deletePomodoro,
				exportAll,
				importAll,
				cleanupAbandoned,
				createPomodoro,
				completePomodoro,
				labelPomodoro,
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
