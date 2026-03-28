/**
 * Repository service for session data persistence.
 *
 * @module
 */
import { eq } from "drizzle-orm";
import { Effect, Layer, Schema, ServiceMap } from "effect";
import { breakSessions, DbClient, focusSessions, pomodoros } from "../../db";
import {
	BreakSessionNotFoundError,
	DatabaseError,
	FocusSessionNotFoundError,
	PomodoroNotFoundError,
} from "../errors/DatabaseError";
import {
	BreakSession,
	type CompleteSessionInput,
	type CreateBreakSessionInput,
	type CreateFocusSessionInput,
	DailyActivity,
	FocusSession,
	PeriodStats,
	Pomodoro,
	SessionStats,
} from "../schema/Session";

/**
 * Row shape for pomodoro records from the database.
 *
 * @since 1.3.0
 * @category Types
 */
export type PomodoroRow = {
	readonly id: string;
	readonly createdAt: number;
	readonly completedAt: number | null;
};

/**
 * Row shape for session records from the database.
 *
 * @since 1.3.0
 * @category Types
 */
export type SessionRow = {
	readonly pomodoroId: string;
	readonly configuredSeconds: number;
	readonly elapsedSeconds: number;
	readonly completedAt: number | null;
	readonly completed: boolean;
};

const decodePomodoro = Schema.decodeUnknownSync(Pomodoro);
const decodeFocusSession = Schema.decodeUnknownSync(FocusSession);
const decodeBreakSession = Schema.decodeUnknownSync(BreakSession);
const decodePeriodStats = Schema.decodeUnknownSync(PeriodStats);
const decodeDailyActivity = Schema.decodeUnknownSync(DailyActivity);
const decodeSessionStats = Schema.decodeUnknownSync(SessionStats);

/**
 * Pure computation of session statistics from raw data.
 *
 * @since 1.3.0
 * @category Functions
 */
export const computeStats = (
	allPomodoros: ReadonlyArray<PomodoroRow>,
	allFocusSessions: ReadonlyArray<SessionRow>,
	allBreakSessions: ReadonlyArray<SessionRow>,
	now: Date,
): SessionStats => {
	const completedFocus = allFocusSessions.filter((s) => s.completed);
	const completedBreak = allBreakSessions.filter((s) => s.completed);

	const totalFocusSeconds = completedFocus.reduce(
		(sum, s) => sum + s.elapsedSeconds,
		0,
	);
	const totalBreakSeconds = completedBreak.reduce(
		(sum, s) => sum + s.elapsedSeconds,
		0,
	);

	const totalFocusOvertimeSeconds = completedFocus.reduce(
		(sum, s) => sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
		0,
	);
	const totalBreakOvertimeSeconds = completedBreak.reduce(
		(sum, s) => sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
		0,
	);

	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const weekStart = new Date(todayStart);
	weekStart.setDate(weekStart.getDate() - weekStart.getDay());
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

	const completedPomodoros = allPomodoros.filter((p) => p.completedAt);

	const todayPomodoros = completedPomodoros.filter(
		(p) => p.completedAt && new Date(p.completedAt) >= todayStart,
	).length;

	const thisWeekPomodoros = completedPomodoros.filter(
		(p) => p.completedAt && new Date(p.completedAt) >= weekStart,
	).length;

	const thisMonthPomodoros = completedPomodoros.filter(
		(p) => p.completedAt && new Date(p.completedAt) >= monthStart,
	).length;

	const pomodoroDates = new Set(
		completedPomodoros.flatMap((p) => {
			if (!p.completedAt) return [];
			const d = new Date(p.completedAt);
			return [`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`];
		}),
	);

	let currentStreak = 0;
	let longestStreak = 0;
	const checkDate = new Date(todayStart);

	while (true) {
		const dateKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
		if (pomodoroDates.has(dateKey)) {
			currentStreak++;
			checkDate.setDate(checkDate.getDate() - 1);
		} else {
			break;
		}
	}

	const sortedDates = Array.from(pomodoroDates).sort();
	let tempStreak = 1;
	for (let i = 1; i < sortedDates.length; i++) {
		const prev = new Date(sortedDates[i - 1]);
		const curr = new Date(sortedDates[i]);
		const diffDays = Math.floor(
			(curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
		);
		if (diffDays === 1) {
			tempStreak++;
			longestStreak = Math.max(longestStreak, tempStreak);
		} else {
			tempStreak = 1;
		}
	}
	longestStreak = Math.max(
		longestStreak,
		currentStreak,
		pomodoroDates.size > 0 ? 1 : 0,
	);

	const computePeriodStats = (
		startDate: Date,
		pomodoroList: typeof completedPomodoros,
		focusList: typeof completedFocus,
		breakList: typeof completedBreak,
	) => {
		const periodPomodoros = pomodoroList.filter(
			(p) => p.completedAt && new Date(p.completedAt) >= startDate,
		);
		const periodPomodoroIds = new Set(periodPomodoros.map((p) => p.id));

		const periodFocus = focusList.filter((s) =>
			periodPomodoroIds.has(s.pomodoroId),
		);
		const periodBreak = breakList.filter((s) =>
			periodPomodoroIds.has(s.pomodoroId),
		);

		return decodePeriodStats({
			pomodoros: periodPomodoros.length,
			focusSeconds: periodFocus.reduce((sum, s) => sum + s.elapsedSeconds, 0),
			breakSeconds: periodBreak.reduce((sum, s) => sum + s.elapsedSeconds, 0),
			focusOvertimeSeconds: periodFocus.reduce(
				(sum, s) => sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
				0,
			),
			breakOvertimeSeconds: periodBreak.reduce(
				(sum, s) => sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
				0,
			),
		});
	};

	const today = computePeriodStats(
		todayStart,
		completedPomodoros,
		completedFocus,
		completedBreak,
	);
	const week = computePeriodStats(
		weekStart,
		completedPomodoros,
		completedFocus,
		completedBreak,
	);
	const month = computePeriodStats(
		monthStart,
		completedPomodoros,
		completedFocus,
		completedBreak,
	);
	const yearStart = new Date(now.getFullYear(), 0, 1);
	const year = computePeriodStats(
		yearStart,
		completedPomodoros,
		completedFocus,
		completedBreak,
	);

	const allPomodoroIds = new Set(completedPomodoros.map((p) => p.id));
	const allPeriodFocus = completedFocus.filter((s) =>
		allPomodoroIds.has(s.pomodoroId),
	);
	const allPeriodBreak = completedBreak.filter((s) =>
		allPomodoroIds.has(s.pomodoroId),
	);
	const all = decodePeriodStats({
		pomodoros: completedPomodoros.length,
		focusSeconds: allPeriodFocus.reduce((sum, s) => sum + s.elapsedSeconds, 0),
		breakSeconds: allPeriodBreak.reduce((sum, s) => sum + s.elapsedSeconds, 0),
		focusOvertimeSeconds: allPeriodFocus.reduce(
			(sum, s) => sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
			0,
		),
		breakOvertimeSeconds: allPeriodBreak.reduce(
			(sum, s) => sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
			0,
		),
	});

	const dailyActivityMap = new Map<
		string,
		{ count: number; focusSeconds: number }
	>();

	for (const p of completedPomodoros) {
		if (!p.completedAt) continue;
		const d = new Date(p.completedAt);
		const dateStr = d.toISOString().split("T")[0];
		const existing = dailyActivityMap.get(dateStr) || {
			count: 0,
			focusSeconds: 0,
		};
		existing.count++;
		dailyActivityMap.set(dateStr, existing);
	}

	for (const s of completedFocus) {
		if (!s.completedAt) continue;
		const d = new Date(s.completedAt);
		const dateStr = d.toISOString().split("T")[0];
		const existing = dailyActivityMap.get(dateStr) || {
			count: 0,
			focusSeconds: 0,
		};
		existing.focusSeconds += s.elapsedSeconds;
		dailyActivityMap.set(dateStr, existing);
	}

	const dailyActivity = Array.from(dailyActivityMap.entries())
		.map(([date, data]) =>
			decodeDailyActivity({
				date,
				count: data.count,
				focusSeconds: data.focusSeconds,
			}),
		)
		.sort((a, b) => a.date.localeCompare(b.date));

	return decodeSessionStats({
		totalPomodoros: allPomodoros.length,
		completedPomodoros: completedPomodoros.length,
		completedFocusSessions: completedFocus.length,
		completedBreakSessions: completedBreak.length,
		totalFocusSeconds,
		totalBreakSeconds,
		totalFocusOvertimeSeconds,
		totalBreakOvertimeSeconds,
		currentStreak,
		longestStreak,
		todayPomodoros,
		thisWeekPomodoros,
		thisMonthPomodoros,
		today,
		week,
		month,
		year,
		all,
		dailyActivity,
	});
};

/**
 * Repository service for managing pomodoros and sessions.
 *
 * @since 0.2.0
 * @category Services
 */
export class SessionRepository extends ServiceMap.Service<SessionRepository>()(
	"SessionRepository",
	{
		make: Effect.gen(function* () {
			yield* Effect.logDebug("SessionRepository initializing");
			const db = yield* DbClient;
			yield* Effect.logDebug("SessionRepository initialized");

			const createPomodoro = Effect.fn("SessionRepository.createPomodoro")(
				function* () {
					yield* Effect.logDebug("Creating pomodoro");
					const result = yield* Effect.tryPromise({
						try: async () => {
							const [row] = await db.insert(pomodoros).values({}).returning();
							return decodePomodoro(row);
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to create pomodoro",
								cause: error,
							}),
					});
					yield* Effect.annotateCurrentSpan("pomodoroId", result.id);
					yield* Effect.logDebug("Pomodoro created").pipe(
						Effect.annotateLogs("pomodoroId", result.id),
					);
					return result;
				},
			);

			const getPomodoro = Effect.fn("SessionRepository.getPomodoro")(function* (
				id: string,
			) {
				const row = yield* Effect.tryPromise({
					try: async () => {
						const result = await db
							.select()
							.from(pomodoros)
							.where(eq(pomodoros.id, id))
							.limit(1);
						return result[0];
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to get pomodoro",
							cause: error,
						}),
				});
				if (!row) {
					return yield* Effect.fail(
						new PomodoroNotFoundError({ pomodoroId: id }),
					);
				}
				return decodePomodoro(row);
			});

			const completePomodoro = Effect.fn("SessionRepository.completePomodoro")(
				function* (id: string) {
					yield* Effect.logDebug("Completing pomodoro").pipe(
						Effect.annotateLogs("pomodoroId", id),
					);
					yield* Effect.annotateCurrentSpan("pomodoroId", id);
					return yield* Effect.tryPromise({
						try: async () => {
							const [result] = await db
								.update(pomodoros)
								.set({ completedAt: Date.now() })
								.where(eq(pomodoros.id, id))
								.returning();
							return decodePomodoro(result);
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to complete pomodoro",
								cause: error,
							}),
					});
				},
			);

			const createFocusSession = Effect.fn(
				"SessionRepository.createFocusSession",
			)(function* (input: CreateFocusSessionInput) {
				yield* Effect.logDebug("Creating focus session").pipe(
					Effect.annotateLogs("pomodoroId", input.pomodoroId),
				);
				const result = yield* Effect.tryPromise({
					try: async () => {
						const [row] = await db
							.insert(focusSessions)
							.values({
								pomodoroId: input.pomodoroId,
								configuredSeconds: input.configuredSeconds,
								startedAt: Date.now(),
							})
							.returning();
						return decodeFocusSession(row);
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to create focus session",
							cause: error,
						}),
				});
				yield* Effect.annotateCurrentSpan({
					pomodoroId: input.pomodoroId,
					sessionId: result.id,
				});
				yield* Effect.logDebug("Focus session created").pipe(
					Effect.annotateLogs("sessionId", result.id),
				);
				return result;
			});

			const getFocusSession = Effect.fn("SessionRepository.getFocusSession")(
				function* (id: string) {
					const row = yield* Effect.tryPromise({
						try: async () => {
							const result = await db
								.select()
								.from(focusSessions)
								.where(eq(focusSessions.id, id))
								.limit(1);
							return result[0];
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to get focus session",
								cause: error,
							}),
					});
					if (!row) {
						return yield* Effect.fail(
							new FocusSessionNotFoundError({ sessionId: id }),
						);
					}
					return decodeFocusSession(row);
				},
			);

			const completeFocusSession = Effect.fn(
				"SessionRepository.completeFocusSession",
			)(function* (id: string, input: CompleteSessionInput) {
				yield* Effect.logInfo("Completing focus session").pipe(
					Effect.annotateLogs({
						sessionId: id,
						elapsedSeconds: String(input.elapsedSeconds),
					}),
				);
				yield* Effect.annotateCurrentSpan({
					sessionId: id,
					elapsedSeconds: String(input.elapsedSeconds),
				});
				return yield* Effect.tryPromise({
					try: async () => {
						const [result] = await db
							.update(focusSessions)
							.set({
								elapsedSeconds: input.elapsedSeconds,
								completedAt: Date.now(),
								completed: true,
							})
							.where(eq(focusSessions.id, id))
							.returning();
						return decodeFocusSession(result);
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to complete focus session",
							cause: error,
						}),
				});
			});

			const createBreakSession = Effect.fn(
				"SessionRepository.createBreakSession",
			)(function* (input: CreateBreakSessionInput) {
				yield* Effect.logDebug("Creating break session").pipe(
					Effect.annotateLogs("pomodoroId", input.pomodoroId),
				);
				const result = yield* Effect.tryPromise({
					try: async () => {
						const [row] = await db
							.insert(breakSessions)
							.values({
								pomodoroId: input.pomodoroId,
								configuredSeconds: input.configuredSeconds,
								startedAt: Date.now(),
							})
							.returning();
						return decodeBreakSession(row);
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to create break session",
							cause: error,
						}),
				});
				yield* Effect.annotateCurrentSpan({
					pomodoroId: input.pomodoroId,
					sessionId: result.id,
				});
				yield* Effect.logDebug("Break session created").pipe(
					Effect.annotateLogs("sessionId", result.id),
				);
				return result;
			});

			const getBreakSession = Effect.fn("SessionRepository.getBreakSession")(
				function* (id: string) {
					const row = yield* Effect.tryPromise({
						try: async () => {
							const result = await db
								.select()
								.from(breakSessions)
								.where(eq(breakSessions.id, id))
								.limit(1);
							return result[0];
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to get break session",
								cause: error,
							}),
					});
					if (!row) {
						return yield* Effect.fail(
							new BreakSessionNotFoundError({ sessionId: id }),
						);
					}
					return decodeBreakSession(row);
				},
			);

			const completeBreakSession = Effect.fn(
				"SessionRepository.completeBreakSession",
			)(function* (id: string, input: CompleteSessionInput) {
				yield* Effect.logInfo("Completing break session").pipe(
					Effect.annotateLogs({
						sessionId: id,
						elapsedSeconds: String(input.elapsedSeconds),
					}),
				);
				yield* Effect.annotateCurrentSpan({
					sessionId: id,
					elapsedSeconds: String(input.elapsedSeconds),
				});
				return yield* Effect.tryPromise({
					try: async () => {
						const [result] = await db
							.update(breakSessions)
							.set({
								elapsedSeconds: input.elapsedSeconds,
								completedAt: Date.now(),
								completed: true,
							})
							.where(eq(breakSessions.id, id))
							.returning();
						return decodeBreakSession(result);
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to complete break session",
							cause: error,
						}),
				});
			});

			const getStats = Effect.fn("SessionRepository.getStats")(function* () {
				yield* Effect.logDebug("Fetching stats");
				const allPomodoroRows = yield* Effect.tryPromise({
					try: () => db.select().from(pomodoros),
					catch: (error) =>
						new DatabaseError({
							message: "Failed to get stats",
							cause: error,
						}),
				});
				const allFocusRows = yield* Effect.tryPromise({
					try: () => db.select().from(focusSessions),
					catch: (error) =>
						new DatabaseError({
							message: "Failed to get stats",
							cause: error,
						}),
				});
				const allBreakRows = yield* Effect.tryPromise({
					try: () => db.select().from(breakSessions),
					catch: (error) =>
						new DatabaseError({
							message: "Failed to get stats",
							cause: error,
						}),
				});
				return computeStats(
					allPomodoroRows,
					allFocusRows,
					allBreakRows,
					new Date(),
				);
			});

			return {
				createPomodoro,
				getPomodoro,
				completePomodoro,
				createFocusSession,
				getFocusSession,
				completeFocusSession,
				createBreakSession,
				getBreakSession,
				completeBreakSession,
				getStats,
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
