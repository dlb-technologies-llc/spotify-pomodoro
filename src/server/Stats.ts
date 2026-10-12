/**
 * Pure computation of session statistics.
 *
 * @module
 */
import { DateTime, Option } from "effect";
import type {
	BreakSession,
	FocusSession,
	Pomodoro,
} from "@/shared/domain/Session";
import {
	DailyActivity,
	PeriodStats,
	SessionStats,
} from "@/shared/domain/Stats";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A calendar day in some time zone: its ISO date and a sequential index.
 *
 * @since 2.0.0
 * @category Functions
 */
export const calendarDay = (dateTime: DateTime.DateTime) => {
	const { year, month, day } = DateTime.toParts(dateTime);
	const pad = (n: number, width: number) => String(n).padStart(width, "0");
	const yearPart =
		year >= 0 && year <= 9999
			? pad(year, 4)
			: `${year < 0 ? "-" : "+"}${pad(Math.abs(year), 6)}`;
	return {
		iso: `${yearPart}-${pad(month, 2)}-${pad(day, 2)}`,
		index: Date.UTC(year, month - 1, day) / DAY_MS,
	};
};

const overtime = (session: FocusSession | BreakSession) =>
	Math.max(0, session.elapsedSeconds - session.configuredSeconds);

const sumBy = <A>(items: ReadonlyArray<A>, f: (a: A) => number) =>
	items.reduce((total, item) => total + f(item), 0);

const periodStats = (
	pomodoros: ReadonlyArray<Pomodoro>,
	focus: ReadonlyArray<FocusSession>,
	breaks: ReadonlyArray<BreakSession>,
) => {
	const ids = new Set(pomodoros.map((p) => p.id));
	const periodFocus = focus.filter((s) => ids.has(s.pomodoroId));
	const periodBreaks = breaks.filter((s) => ids.has(s.pomodoroId));
	return new PeriodStats({
		pomodoros: pomodoros.length,
		focusSeconds: sumBy(periodFocus, (s) => s.elapsedSeconds),
		breakSeconds: sumBy(periodBreaks, (s) => s.elapsedSeconds),
		focusOvertimeSeconds: sumBy(periodFocus, overtime),
		breakOvertimeSeconds: sumBy(periodBreaks, overtime),
	});
};

/**
 * Longest run of consecutive day indices.
 *
 * @since 2.0.0
 * @category Functions
 */
export const longestRun = (days: ReadonlySet<number>): number => {
	let longest = 0;
	let run = 0;
	let previous = Number.NaN;
	for (const index of [...days].toSorted((x, y) => x - y)) {
		run = index - previous === 1 ? run + 1 : 1;
		longest = Math.max(longest, run);
		previous = index;
	}
	return longest;
};

/**
 * Consecutive days present in `days`, counting back from `today`.
 *
 * @since 2.0.0
 * @category Functions
 */
export const currentRun = (
	days: ReadonlySet<number>,
	today: number,
): number => {
	let streak = 0;
	while (days.has(today - streak)) streak++;
	return streak;
};

/**
 * Computes statistics as seen from `now`, whose time zone defines calendar
 * days, weeks (starting Sunday), months, and years.
 *
 * The current streak stays alive through today: until a pomodoro is done
 * today, it counts back from yesterday and `streakAtRisk` is set. The heatmap
 * holds focus seconds by weekday (0 = Sunday) and starting hour.
 *
 * Only completed sessions count toward time totals, and period totals only
 * include sessions whose pomodoro was completed in that period.
 *
 * @since 1.3.0
 * @category Functions
 */
export const computeStats = (input: {
	readonly pomodoros: ReadonlyArray<Pomodoro>;
	readonly focusSessions: ReadonlyArray<FocusSession>;
	readonly breakSessions: ReadonlyArray<BreakSession>;
	readonly now: DateTime.Zoned;
}): SessionStats => {
	const { now } = input;
	const localDay = (instant: DateTime.Utc) =>
		calendarDay(DateTime.setZone(instant, now.zone));

	const focus = input.focusSessions.filter((s) => s.completed);
	const breaks = input.breakSessions.filter((s) => s.completed);
	const completed = input.pomodoros.flatMap((pomodoro) =>
		Option.match(pomodoro.completedAt, {
			onNone: () => [],
			onSome: (completedAt) => [{ pomodoro, completedAt }],
		}),
	);

	const completedSince = (start: DateTime.Zoned) =>
		completed
			.filter(({ completedAt }) =>
				DateTime.isGreaterThanOrEqualTo(completedAt, start),
			)
			.map(({ pomodoro }) => pomodoro);

	const statsSince = (unit: "day" | "week" | "month" | "year") =>
		periodStats(completedSince(DateTime.startOf(now, unit)), focus, breaks);

	const activity = new Map<string, { count: number; focusSeconds: number }>();
	const entry = (date: string) => {
		const existing = activity.get(date);
		if (existing) return existing;
		const created = { count: 0, focusSeconds: 0 };
		activity.set(date, created);
		return created;
	};
	for (const { completedAt } of completed) {
		entry(localDay(completedAt).iso).count++;
	}
	for (const session of focus) {
		if (Option.isSome(session.completedAt)) {
			entry(localDay(session.completedAt.value).iso).focusSeconds +=
				session.elapsedSeconds;
		}
	}

	const daysWithPomodoro = new Set(
		completed.map(({ completedAt }) => localDay(completedAt).index),
	);
	const today = calendarDay(now).index;
	const doneToday = daysWithPomodoro.has(today);
	const streak = currentRun(daysWithPomodoro, doneToday ? today : today - 1);

	const heatmap = Array.from({ length: 7 }, () =>
		Array.from({ length: 24 }, () => 0),
	);
	for (const session of focus) {
		const { weekDay, hour } = DateTime.toParts(
			DateTime.setZone(session.startedAt, now.zone),
		);
		const row = heatmap[weekDay];
		if (row) row[hour] = (row[hour] ?? 0) + session.elapsedSeconds;
	}

	const average = (sessions: ReadonlyArray<FocusSession | BreakSession>) =>
		sessions.length === 0
			? 0
			: Math.round(sumBy(sessions, overtime) / sessions.length);

	return new SessionStats({
		totalPomodoros: input.pomodoros.length,
		completedPomodoros: completed.length,
		completedFocusSessions: focus.length,
		completedBreakSessions: breaks.length,
		totalFocusSeconds: sumBy(focus, (s) => s.elapsedSeconds),
		totalBreakSeconds: sumBy(breaks, (s) => s.elapsedSeconds),
		totalFocusOvertimeSeconds: sumBy(focus, overtime),
		totalBreakOvertimeSeconds: sumBy(breaks, overtime),
		currentStreak: streak,
		longestStreak: longestRun(daysWithPomodoro),
		streakAtRisk: !doneToday && streak > 0,
		averageFocusOvertimeSeconds: average(focus),
		averageBreakOvertimeSeconds: average(breaks),
		focusHeatmap: heatmap,
		today: statsSince("day"),
		week: statsSince("week"),
		month: statsSince("month"),
		year: statsSince("year"),
		all: periodStats(
			completed.map(({ pomodoro }) => pomodoro),
			focus,
			breaks,
		),
		dailyActivity: [...activity.entries()]
			.toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([date, day]) => new DailyActivity({ date, ...day })),
	});
};
