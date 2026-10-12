/**
 * Session statistics returned by the stats endpoint.
 *
 * @module
 */
import { Schema } from "effect";
import { Count, Seconds } from "./Session";

/**
 * Calendar date in `YYYY-MM-DD` form, in the viewer's time zone. Years
 * outside 0000–9999 use the ISO 8601 extended form, e.g. `+275760-09-13`.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const IsoDate = Schema.String.check(
	Schema.isPattern(/^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}$/),
);

/**
 * Pomodoros completed and focus time spent on one calendar day.
 *
 * @since 0.3.0
 * @category Schemas
 */
export class DailyActivity extends Schema.Class<DailyActivity>("DailyActivity")(
	{
		date: IsoDate,
		count: Count,
		focusSeconds: Seconds,
	},
) {}

/**
 * Totals for pomodoros completed within one time period.
 *
 * @since 0.3.0
 * @category Schemas
 */
export class PeriodStats extends Schema.Class<PeriodStats>("PeriodStats")({
	pomodoros: Count,
	focusSeconds: Seconds,
	breakSeconds: Seconds,
	focusOvertimeSeconds: Seconds,
	breakOvertimeSeconds: Seconds,
}) {}

/**
 * The selectable stats periods.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const StatsPeriod = Schema.Literals([
	"today",
	"week",
	"month",
	"year",
	"all",
]);

/**
 * @since 2.0.0
 * @category Schemas
 */
export type StatsPeriod = typeof StatsPeriod.Type;

/**
 * Aggregated statistics across every recorded session.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class SessionStats extends Schema.Class<SessionStats>("SessionStats")({
	totalPomodoros: Count,
	completedPomodoros: Count,
	completedFocusSessions: Count,
	completedBreakSessions: Count,
	totalFocusSeconds: Seconds,
	totalBreakSeconds: Seconds,
	totalFocusOvertimeSeconds: Seconds,
	totalBreakOvertimeSeconds: Seconds,
	currentStreak: Count,
	longestStreak: Count,
	today: PeriodStats,
	week: PeriodStats,
	month: PeriodStats,
	year: PeriodStats,
	all: PeriodStats,
	dailyActivity: Schema.Array(DailyActivity),
}) {}

/**
 * Query string for the stats endpoint.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const StatsQuery = Schema.Struct({
	tz: Schema.optional(Schema.TimeZoneNamedFromString),
});
