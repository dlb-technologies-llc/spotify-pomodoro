/**
 * Repository service for session data persistence.
 *
 * @module
 */
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { Effect, Layer, ServiceMap } from "effect";
import { breakSessions, focusSessions, pomodoros } from "../../db/schema";
import {
	BreakSessionNotFoundError,
	DatabaseError,
	FocusSessionNotFoundError,
	PomodoroNotFoundError,
} from "../errors/DatabaseError";
import type {
	BreakSession,
	CompleteSessionInput,
	CreateBreakSessionInput,
	CreateFocusSessionInput,
	FocusSession,
	Pomodoro,
	SessionStats,
} from "../schema/Session";

/**
 * Database client singleton for server-side operations.
 *
 * @since 0.2.0
 * @category Database
 */
const getDb = () => {
	const client = createClient({ url: "file:./data/pomodoro.db" });
	return drizzle(client);
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
			const db = getDb();
			yield* Effect.logDebug("SessionRepository initialized");

			const createPomodoro = Effect.gen(function* () {
				yield* Effect.logDebug("Creating pomodoro");
				const result = yield* Effect.tryPromise({
					try: async () => {
						const [row] = await db.insert(pomodoros).values({}).returning();
						return row as Pomodoro;
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to create pomodoro",
							cause: error,
						}),
				});
				yield* Effect.logDebug("Pomodoro created").pipe(
					Effect.annotateLogs("pomodoroId", result.id),
				);
				return result;
			}).pipe(Effect.withLogSpan("SessionRepository.createPomodoro"));

			const getPomodoro = (id: string) =>
				Effect.tryPromise({
					try: async () => {
						const result = await db
							.select()
							.from(pomodoros)
							.where(eq(pomodoros.id, id))
							.limit(1);
						return result[0] as Pomodoro | undefined;
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to get pomodoro",
							cause: error,
						}),
				}).pipe(
					Effect.flatMap((result) =>
						result
							? Effect.succeed(result)
							: Effect.fail(new PomodoroNotFoundError({ pomodoroId: id })),
					),
				);

			const completePomodoro = (id: string) =>
				Effect.gen(function* () {
					yield* Effect.logDebug("Completing pomodoro").pipe(
						Effect.annotateLogs("pomodoroId", id),
					);
					return yield* Effect.tryPromise({
						try: async () => {
							const [result] = await db
								.update(pomodoros)
								.set({ completedAt: new Date() })
								.where(eq(pomodoros.id, id))
								.returning();
							return result as Pomodoro;
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to complete pomodoro",
								cause: error,
							}),
					});
				}).pipe(Effect.withLogSpan("SessionRepository.completePomodoro"));

			const createFocusSession = (input: CreateFocusSessionInput) =>
				Effect.gen(function* () {
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
									startedAt: new Date(),
								})
								.returning();
							return row as unknown as FocusSession;
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to create focus session",
								cause: error,
							}),
					});
					yield* Effect.logDebug("Focus session created").pipe(
						Effect.annotateLogs("sessionId", result.id),
					);
					return result;
				}).pipe(Effect.withLogSpan("SessionRepository.createFocusSession"));

			const getFocusSession = (id: string) =>
				Effect.tryPromise({
					try: async () => {
						const result = await db
							.select()
							.from(focusSessions)
							.where(eq(focusSessions.id, id))
							.limit(1);
						return result[0] as unknown as FocusSession | undefined;
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to get focus session",
							cause: error,
						}),
				}).pipe(
					Effect.flatMap((result) =>
						result
							? Effect.succeed(result)
							: Effect.fail(new FocusSessionNotFoundError({ sessionId: id })),
					),
				);

			const completeFocusSession = (id: string, input: CompleteSessionInput) =>
				Effect.gen(function* () {
					yield* Effect.logInfo("Completing focus session").pipe(
						Effect.annotateLogs({
							sessionId: id,
							elapsedSeconds: String(input.elapsedSeconds),
						}),
					);
					return yield* Effect.tryPromise({
						try: async () => {
							const [result] = await db
								.update(focusSessions)
								.set({
									elapsedSeconds: input.elapsedSeconds,
									completedAt: new Date(),
									completed: true,
								})
								.where(eq(focusSessions.id, id))
								.returning();
							return result as unknown as FocusSession;
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to complete focus session",
								cause: error,
							}),
					});
				}).pipe(Effect.withLogSpan("SessionRepository.completeFocusSession"));

			const createBreakSession = (input: CreateBreakSessionInput) =>
				Effect.gen(function* () {
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
									startedAt: new Date(),
								})
								.returning();
							return row as unknown as BreakSession;
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to create break session",
								cause: error,
							}),
					});
					yield* Effect.logDebug("Break session created").pipe(
						Effect.annotateLogs("sessionId", result.id),
					);
					return result;
				}).pipe(Effect.withLogSpan("SessionRepository.createBreakSession"));

			const getBreakSession = (id: string) =>
				Effect.tryPromise({
					try: async () => {
						const result = await db
							.select()
							.from(breakSessions)
							.where(eq(breakSessions.id, id))
							.limit(1);
						return result[0] as unknown as BreakSession | undefined;
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to get break session",
							cause: error,
						}),
				}).pipe(
					Effect.flatMap((result) =>
						result
							? Effect.succeed(result)
							: Effect.fail(new BreakSessionNotFoundError({ sessionId: id })),
					),
				);

			const completeBreakSession = (id: string, input: CompleteSessionInput) =>
				Effect.gen(function* () {
					yield* Effect.logInfo("Completing break session").pipe(
						Effect.annotateLogs({
							sessionId: id,
							elapsedSeconds: String(input.elapsedSeconds),
						}),
					);
					return yield* Effect.tryPromise({
						try: async () => {
							const [result] = await db
								.update(breakSessions)
								.set({
									elapsedSeconds: input.elapsedSeconds,
									completedAt: new Date(),
									completed: true,
								})
								.where(eq(breakSessions.id, id))
								.returning();
							return result as unknown as BreakSession;
						},
						catch: (error) =>
							new DatabaseError({
								message: "Failed to complete break session",
								cause: error,
							}),
					});
				}).pipe(Effect.withLogSpan("SessionRepository.completeBreakSession"));

			const getStats = Effect.gen(function* () {
				yield* Effect.logDebug("Fetching stats");
				return yield* Effect.tryPromise({
					try: async () => {
						const allPomodoros = await db.select().from(pomodoros);
						const allFocusSessions = await db.select().from(focusSessions);
						const allBreakSessions = await db.select().from(breakSessions);

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
							(sum, s) =>
								sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
							0,
						);
						const totalBreakOvertimeSeconds = completedBreak.reduce(
							(sum, s) =>
								sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
							0,
						);

						const now = new Date();
						const todayStart = new Date(
							now.getFullYear(),
							now.getMonth(),
							now.getDate(),
						);
						const weekStart = new Date(todayStart);
						weekStart.setDate(weekStart.getDate() - weekStart.getDay());
						const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

						const completedPomodoros = allPomodoros.filter(
							(p) => p.completedAt,
						);

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
							const periodPomodoroIds = new Set(
								periodPomodoros.map((p) => p.id),
							);

							const periodFocus = focusList.filter((s) =>
								periodPomodoroIds.has(s.pomodoroId),
							);
							const periodBreak = breakList.filter((s) =>
								periodPomodoroIds.has(s.pomodoroId),
							);

							return {
								pomodoros: periodPomodoros.length,
								focusSeconds: periodFocus.reduce(
									(sum, s) => sum + s.elapsedSeconds,
									0,
								),
								breakSeconds: periodBreak.reduce(
									(sum, s) => sum + s.elapsedSeconds,
									0,
								),
								focusOvertimeSeconds: periodFocus.reduce(
									(sum, s) =>
										sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
									0,
								),
								breakOvertimeSeconds: periodBreak.reduce(
									(sum, s) =>
										sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
									0,
								),
							};
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
						const all = {
							pomodoros: completedPomodoros.length,
							focusSeconds: allPeriodFocus.reduce(
								(sum, s) => sum + s.elapsedSeconds,
								0,
							),
							breakSeconds: allPeriodBreak.reduce(
								(sum, s) => sum + s.elapsedSeconds,
								0,
							),
							focusOvertimeSeconds: allPeriodFocus.reduce(
								(sum, s) =>
									sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
								0,
							),
							breakOvertimeSeconds: allPeriodBreak.reduce(
								(sum, s) =>
									sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
								0,
							),
						};

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
							.map(([date, data]) => ({
								date,
								count: data.count,
								focusSeconds: data.focusSeconds,
							}))
							.sort((a, b) => a.date.localeCompare(b.date));

						return {
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
						} as SessionStats;
					},
					catch: (error) =>
						new DatabaseError({
							message: "Failed to get stats",
							cause: error,
						}),
				});
			}).pipe(Effect.withLogSpan("SessionRepository.getStats"));

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
