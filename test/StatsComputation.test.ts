/**
 * Pure computation tests for computeStats.
 *
 * @module
 */
import { describe, expect, it } from "@effect/vitest";
import { computeStats } from "@/effect/services/SessionRepository";

type PomodoroRow = {
	readonly id: string;
	readonly createdAt: number;
	readonly completedAt: number | null;
};

type SessionRow = {
	readonly pomodoroId: string;
	readonly configuredSeconds: number;
	readonly elapsedSeconds: number;
	readonly completedAt: number | null;
	readonly completed: boolean;
};

/** Fixed reference date: Wednesday 2025-06-18T12:00:00Z */
const NOW = new Date("2025-06-18T12:00:00Z");

const oneDay = 24 * 60 * 60 * 1000;

describe("computeStats", () => {
	describe("empty data", () => {
		it("returns all zeros for empty arrays", () => {
			const result = computeStats([], [], [], NOW);

			expect(result.totalPomodoros).toBe(0);
			expect(result.completedPomodoros).toBe(0);
			expect(result.completedFocusSessions).toBe(0);
			expect(result.completedBreakSessions).toBe(0);
			expect(result.totalFocusSeconds).toBe(0);
			expect(result.totalBreakSeconds).toBe(0);
			expect(result.totalFocusOvertimeSeconds).toBe(0);
			expect(result.totalBreakOvertimeSeconds).toBe(0);
			expect(result.currentStreak).toBe(0);
			expect(result.longestStreak).toBe(0);
			expect(result.todayPomodoros).toBe(0);
			expect(result.thisWeekPomodoros).toBe(0);
			expect(result.thisMonthPomodoros).toBe(0);
			expect(result.dailyActivity).toEqual([]);
		});

		it("returns zero period stats for all periods", () => {
			const result = computeStats([], [], [], NOW);

			for (const period of [
				result.today,
				result.week,
				result.month,
				result.year,
				result.all,
			]) {
				expect(period.pomodoros).toBe(0);
				expect(period.focusSeconds).toBe(0);
				expect(period.breakSeconds).toBe(0);
				expect(period.focusOvertimeSeconds).toBe(0);
				expect(period.breakOvertimeSeconds).toBe(0);
			}
		});
	});

	describe("single completed pomodoro", () => {
		it("counts total and completed pomodoros", () => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 1500000, completedAt },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt,
					completed: true,
				},
			];
			const breaks: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 300,
					elapsedSeconds: 300,
					completedAt,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, breaks, NOW);

			expect(result.totalPomodoros).toBe(1);
			expect(result.completedPomodoros).toBe(1);
			expect(result.completedFocusSessions).toBe(1);
			expect(result.completedBreakSessions).toBe(1);
			expect(result.totalFocusSeconds).toBe(1500);
			expect(result.totalBreakSeconds).toBe(300);
		});

		it("counts incomplete pomodoro as total but not completed", () => {
			const pomodoroId = crypto.randomUUID();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: pomodoroId,
					createdAt: NOW.getTime() - 1500000,
					completedAt: null,
				},
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 1500,
					elapsedSeconds: 800,
					completedAt: null,
					completed: false,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.totalPomodoros).toBe(1);
			expect(result.completedPomodoros).toBe(0);
			expect(result.completedFocusSessions).toBe(0);
			expect(result.totalFocusSeconds).toBe(0);
		});
	});

	describe("overtime", () => {
		it("computes focus overtime when elapsed exceeds configured", () => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 2000000, completedAt },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 1500,
					elapsedSeconds: 1800,
					completedAt,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.totalFocusOvertimeSeconds).toBe(300);
			expect(result.totalFocusSeconds).toBe(1800);
		});

		it("computes break overtime when elapsed exceeds configured", () => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 2000000, completedAt },
			];
			const breaks: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 300,
					elapsedSeconds: 450,
					completedAt,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, [], breaks, NOW);

			expect(result.totalBreakOvertimeSeconds).toBe(150);
		});

		it("reports zero overtime when elapsed equals configured", () => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 2000000, completedAt },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.totalFocusOvertimeSeconds).toBe(0);
		});

		it("reports zero overtime when elapsed is less than configured", () => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 2000000, completedAt },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 1500,
					elapsedSeconds: 1200,
					completedAt,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.totalFocusOvertimeSeconds).toBe(0);
		});

		it.each([
			{ configured: 1500, elapsed: 1800, expectedOvertime: 300 },
			{ configured: 1500, elapsed: 1500, expectedOvertime: 0 },
			{ configured: 1500, elapsed: 900, expectedOvertime: 0 },
			{ configured: 300, elapsed: 600, expectedOvertime: 300 },
		])("overtime for configured=$configured elapsed=$elapsed is $expectedOvertime", ({
			configured,
			elapsed,
			expectedOvertime,
		}) => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 2000000, completedAt },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: configured,
					elapsedSeconds: elapsed,
					completedAt,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.totalFocusOvertimeSeconds).toBe(expectedOvertime);
		});
	});

	describe("streaks", () => {
		it("reports current streak of 1 for today only", () => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 1500000, completedAt },
			];

			const result = computeStats(pomodoros, [], [], NOW);

			expect(result.currentStreak).toBe(1);
			expect(result.longestStreak).toBe(1);
		});

		it("counts consecutive days as a streak", () => {
			const pomodoroIds = [
				crypto.randomUUID(),
				crypto.randomUUID(),
				crypto.randomUUID(),
			];

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: pomodoroIds[0],
					createdAt: NOW.getTime() - 1000,
					completedAt: NOW.getTime() - 1000,
				},
				{
					id: pomodoroIds[1],
					createdAt: NOW.getTime() - oneDay - 1000,
					completedAt: NOW.getTime() - oneDay - 1000,
				},
				{
					id: pomodoroIds[2],
					createdAt: NOW.getTime() - 2 * oneDay - 1000,
					completedAt: NOW.getTime() - 2 * oneDay - 1000,
				},
			];

			const result = computeStats(pomodoros, [], [], NOW);

			expect(result.currentStreak).toBe(3);
			expect(result.longestStreak).toBe(3);
		});

		it("resets current streak on a gap", () => {
			const pomodoroIds = [
				crypto.randomUUID(),
				crypto.randomUUID(),
				crypto.randomUUID(),
			];

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: pomodoroIds[0],
					createdAt: NOW.getTime() - 1000,
					completedAt: NOW.getTime() - 1000,
				},
				{
					id: pomodoroIds[1],
					createdAt: NOW.getTime() - 3 * oneDay - 1000,
					completedAt: NOW.getTime() - 3 * oneDay - 1000,
				},
				{
					id: pomodoroIds[2],
					createdAt: NOW.getTime() - 4 * oneDay - 1000,
					completedAt: NOW.getTime() - 4 * oneDay - 1000,
				},
			];

			const result = computeStats(pomodoros, [], [], NOW);

			expect(result.currentStreak).toBe(1);
			expect(result.longestStreak).toBe(2);
		});

		it("reports zero streak when no pomodoros completed today", () => {
			const pomodoroId = crypto.randomUUID();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: pomodoroId,
					createdAt: NOW.getTime() - 3 * oneDay,
					completedAt: NOW.getTime() - 3 * oneDay,
				},
			];

			const result = computeStats(pomodoros, [], [], NOW);

			expect(result.currentStreak).toBe(0);
			expect(result.longestStreak).toBe(1);
		});

		it("longest streak tracks historical max even if current is lower", () => {
			const ids = Array.from({ length: 6 }, () => crypto.randomUUID());

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: ids[0],
					createdAt: NOW.getTime() - 1000,
					completedAt: NOW.getTime() - 1000,
				},
				{
					id: ids[1],
					createdAt: NOW.getTime() - oneDay - 1000,
					completedAt: NOW.getTime() - oneDay - 1000,
				},
				{
					id: ids[2],
					createdAt: NOW.getTime() - 10 * oneDay - 1000,
					completedAt: NOW.getTime() - 10 * oneDay - 1000,
				},
				{
					id: ids[3],
					createdAt: NOW.getTime() - 11 * oneDay - 1000,
					completedAt: NOW.getTime() - 11 * oneDay - 1000,
				},
				{
					id: ids[4],
					createdAt: NOW.getTime() - 12 * oneDay - 1000,
					completedAt: NOW.getTime() - 12 * oneDay - 1000,
				},
				{
					id: ids[5],
					createdAt: NOW.getTime() - 13 * oneDay - 1000,
					completedAt: NOW.getTime() - 13 * oneDay - 1000,
				},
			];

			const result = computeStats(pomodoros, [], [], NOW);

			expect(result.currentStreak).toBe(2);
			expect(result.longestStreak).toBe(4);
		});
	});

	describe("period stats", () => {
		it("filters pomodoros into today bucket", () => {
			const todayId = crypto.randomUUID();
			const yesterdayId = crypto.randomUUID();
			const todayCompleted = NOW.getTime() - 1000;
			const yesterdayCompleted = NOW.getTime() - oneDay - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: todayId,
					createdAt: todayCompleted - 1500000,
					completedAt: todayCompleted,
				},
				{
					id: yesterdayId,
					createdAt: yesterdayCompleted - 1500000,
					completedAt: yesterdayCompleted,
				},
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId: todayId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: todayCompleted,
					completed: true,
				},
				{
					pomodoroId: yesterdayId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: yesterdayCompleted,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.todayPomodoros).toBe(1);
			expect(result.today.pomodoros).toBe(1);
			expect(result.today.focusSeconds).toBe(1500);
		});

		it("filters pomodoros into week bucket", () => {
			/** NOW is Wednesday 2025-06-18. Week starts Sunday 2025-06-15. */
			const mondayId = crypto.randomUUID();
			const lastSaturdayId = crypto.randomUUID();

			const mondayTime = new Date("2025-06-16T10:00:00Z").getTime();
			const lastSaturdayTime = new Date("2025-06-14T10:00:00Z").getTime();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: mondayId,
					createdAt: mondayTime - 1500000,
					completedAt: mondayTime,
				},
				{
					id: lastSaturdayId,
					createdAt: lastSaturdayTime - 1500000,
					completedAt: lastSaturdayTime,
				},
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId: mondayId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: mondayTime,
					completed: true,
				},
				{
					pomodoroId: lastSaturdayId,
					configuredSeconds: 1500,
					elapsedSeconds: 1200,
					completedAt: lastSaturdayTime,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.thisWeekPomodoros).toBe(1);
			expect(result.week.pomodoros).toBe(1);
			expect(result.week.focusSeconds).toBe(1500);
		});

		it("filters pomodoros into month bucket", () => {
			const thisMonthId = crypto.randomUUID();
			const lastMonthId = crypto.randomUUID();

			const thisMonthTime = new Date("2025-06-05T10:00:00Z").getTime();
			const lastMonthTime = new Date("2025-05-20T10:00:00Z").getTime();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: thisMonthId,
					createdAt: thisMonthTime - 1500000,
					completedAt: thisMonthTime,
				},
				{
					id: lastMonthId,
					createdAt: lastMonthTime - 1500000,
					completedAt: lastMonthTime,
				},
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId: thisMonthId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: thisMonthTime,
					completed: true,
				},
				{
					pomodoroId: lastMonthId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: lastMonthTime,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.thisMonthPomodoros).toBe(1);
			expect(result.month.pomodoros).toBe(1);
		});

		it("filters pomodoros into year bucket", () => {
			const thisYearId = crypto.randomUUID();
			const lastYearId = crypto.randomUUID();

			const thisYearTime = new Date("2025-03-10T10:00:00Z").getTime();
			const lastYearTime = new Date("2024-12-20T10:00:00Z").getTime();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: thisYearId,
					createdAt: thisYearTime - 1500000,
					completedAt: thisYearTime,
				},
				{
					id: lastYearId,
					createdAt: lastYearTime - 1500000,
					completedAt: lastYearTime,
				},
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId: thisYearId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: thisYearTime,
					completed: true,
				},
				{
					pomodoroId: lastYearId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: lastYearTime,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.year.pomodoros).toBe(1);
			expect(result.all.pomodoros).toBe(2);
		});

		it("includes overtime in period stats", () => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 2000000, completedAt },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 1500,
					elapsedSeconds: 1800,
					completedAt,
					completed: true,
				},
			];
			const breaks: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 300,
					elapsedSeconds: 450,
					completedAt,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, breaks, NOW);

			expect(result.today.focusOvertimeSeconds).toBe(300);
			expect(result.today.breakOvertimeSeconds).toBe(150);
		});
	});

	describe("daily activity", () => {
		it("aggregates multiple pomodoros on the same day", () => {
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			const time1 = new Date("2025-06-18T09:00:00Z").getTime();
			const time2 = new Date("2025-06-18T14:00:00Z").getTime();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: id1, createdAt: time1 - 1500000, completedAt: time1 },
				{ id: id2, createdAt: time2 - 1500000, completedAt: time2 },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId: id1,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: time1,
					completed: true,
				},
				{
					pomodoroId: id2,
					configuredSeconds: 1500,
					elapsedSeconds: 1200,
					completedAt: time2,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.dailyActivity).toHaveLength(1);
			expect(result.dailyActivity[0].date).toBe("2025-06-18");
			expect(result.dailyActivity[0].count).toBe(2);
			expect(result.dailyActivity[0].focusSeconds).toBe(2700);
		});

		it("creates separate entries for different days", () => {
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			const day1 = new Date("2025-06-17T10:00:00Z").getTime();
			const day2 = new Date("2025-06-18T10:00:00Z").getTime();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: id1, createdAt: day1 - 1500000, completedAt: day1 },
				{ id: id2, createdAt: day2 - 1500000, completedAt: day2 },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId: id1,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: day1,
					completed: true,
				},
				{
					pomodoroId: id2,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: day2,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.dailyActivity).toHaveLength(2);
			expect(result.dailyActivity[0].date).toBe("2025-06-17");
			expect(result.dailyActivity[1].date).toBe("2025-06-18");
		});

		it("sorts daily activity by date ascending", () => {
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			const id3 = crypto.randomUUID();
			const laterDay = new Date("2025-06-18T10:00:00Z").getTime();
			const earlierDay = new Date("2025-06-10T10:00:00Z").getTime();
			const middleDay = new Date("2025-06-14T10:00:00Z").getTime();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: id1, createdAt: laterDay - 1500000, completedAt: laterDay },
				{ id: id2, createdAt: earlierDay - 1500000, completedAt: earlierDay },
				{ id: id3, createdAt: middleDay - 1500000, completedAt: middleDay },
			];

			const result = computeStats(pomodoros, [], [], NOW);

			expect(result.dailyActivity).toHaveLength(3);
			expect(result.dailyActivity[0].date).toBe("2025-06-10");
			expect(result.dailyActivity[1].date).toBe("2025-06-14");
			expect(result.dailyActivity[2].date).toBe("2025-06-18");
		});

		it("does not include incomplete pomodoros in daily activity", () => {
			const pomodoroId = crypto.randomUUID();

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{
					id: pomodoroId,
					createdAt: NOW.getTime() - 1500000,
					completedAt: null,
				},
			];

			const result = computeStats(pomodoros, [], [], NOW);

			expect(result.dailyActivity).toEqual([]);
		});
	});

	describe("aggregate totals", () => {
		it("sums focus and break seconds across multiple sessions", () => {
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			const time1 = NOW.getTime() - 2000;
			const time2 = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: id1, createdAt: time1 - 1500000, completedAt: time1 },
				{ id: id2, createdAt: time2 - 1500000, completedAt: time2 },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId: id1,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt: time1,
					completed: true,
				},
				{
					pomodoroId: id2,
					configuredSeconds: 1500,
					elapsedSeconds: 1800,
					completedAt: time2,
					completed: true,
				},
			];
			const breaks: ReadonlyArray<SessionRow> = [
				{
					pomodoroId: id1,
					configuredSeconds: 300,
					elapsedSeconds: 300,
					completedAt: time1,
					completed: true,
				},
				{
					pomodoroId: id2,
					configuredSeconds: 300,
					elapsedSeconds: 400,
					completedAt: time2,
					completed: true,
				},
			];

			const result = computeStats(pomodoros, focus, breaks, NOW);

			expect(result.totalFocusSeconds).toBe(3300);
			expect(result.totalBreakSeconds).toBe(700);
			expect(result.totalFocusOvertimeSeconds).toBe(300);
			expect(result.totalBreakOvertimeSeconds).toBe(100);
			expect(result.completedFocusSessions).toBe(2);
			expect(result.completedBreakSessions).toBe(2);
		});

		it("only counts completed sessions in totals", () => {
			const pomodoroId = crypto.randomUUID();
			const completedAt = NOW.getTime() - 1000;

			const pomodoros: ReadonlyArray<PomodoroRow> = [
				{ id: pomodoroId, createdAt: completedAt - 2000000, completedAt },
			];
			const focus: ReadonlyArray<SessionRow> = [
				{
					pomodoroId,
					configuredSeconds: 1500,
					elapsedSeconds: 1500,
					completedAt,
					completed: true,
				},
				{
					pomodoroId,
					configuredSeconds: 1500,
					elapsedSeconds: 500,
					completedAt: null,
					completed: false,
				},
			];

			const result = computeStats(pomodoros, focus, [], NOW);

			expect(result.completedFocusSessions).toBe(1);
			expect(result.totalFocusSeconds).toBe(1500);
		});
	});
});
