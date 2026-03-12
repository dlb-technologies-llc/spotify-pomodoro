/**
 * Session schemas for Effect.
 *
 * @module
 */
import { Schema, SchemaTransformation } from "effect";

/**
 * Transforms a number (epoch milliseconds) to a valid Date object.
 *
 * @since 0.4.0
 * @category Schemas
 */
const DateFromNumber = Schema.Number.pipe(
	Schema.decodeTo(
		Schema.DateValid,
		SchemaTransformation.transform({
			decode: (n) => new globalThis.Date(n),
			encode: (d) => d.getTime(),
		}),
	),
);

/**
 * Pomodoro record from database.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class Pomodoro extends Schema.Class<Pomodoro>("Pomodoro")({
	id: Schema.String,
	createdAt: DateFromNumber,
	completedAt: Schema.NullOr(DateFromNumber),
}) {}

/**
 * Focus session record from database.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class FocusSession extends Schema.Class<FocusSession>("FocusSession")({
	id: Schema.String,
	pomodoroId: Schema.String,
	configuredSeconds: Schema.Number,
	elapsedSeconds: Schema.Number,
	startedAt: DateFromNumber,
	completedAt: Schema.NullOr(DateFromNumber),
	completed: Schema.Boolean,
	createdAt: DateFromNumber,
}) {
	/**
	 * Overtime is derived: elapsed - configured (0 if no overtime).
	 * @since 0.2.0
	 */
	get overtime(): number {
		return Math.max(0, this.elapsedSeconds - this.configuredSeconds);
	}
}

/**
 * Break session record from database.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class BreakSession extends Schema.Class<BreakSession>("BreakSession")({
	id: Schema.String,
	pomodoroId: Schema.String,
	configuredSeconds: Schema.Number,
	elapsedSeconds: Schema.Number,
	startedAt: DateFromNumber,
	completedAt: Schema.NullOr(DateFromNumber),
	completed: Schema.Boolean,
	createdAt: DateFromNumber,
}) {
	/**
	 * Overtime is derived: elapsed - configured (0 if no overtime).
	 * @since 0.2.0
	 */
	get overtime(): number {
		return Math.max(0, this.elapsedSeconds - this.configuredSeconds);
	}
}

/**
 * Input for creating a new focus session.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class CreateFocusSessionInput extends Schema.Class<CreateFocusSessionInput>(
	"CreateFocusSessionInput",
)({
	pomodoroId: Schema.String,
	configuredSeconds: Schema.Number,
}) {}

/**
 * Input for creating a new break session.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class CreateBreakSessionInput extends Schema.Class<CreateBreakSessionInput>(
	"CreateBreakSessionInput",
)({
	pomodoroId: Schema.String,
	configuredSeconds: Schema.Number,
}) {}

/**
 * Input for completing a session.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class CompleteSessionInput extends Schema.Class<CompleteSessionInput>(
	"CompleteSessionInput",
)({
	elapsedSeconds: Schema.Number,
}) {}

/**
 * Daily activity record for contribution graph.
 *
 * @since 0.3.0
 * @category Schemas
 */
export class DailyActivity extends Schema.Class<DailyActivity>("DailyActivity")(
	{
		/** Date string in YYYY-MM-DD format */
		date: Schema.String,
		/** Number of pomodoros completed on this day */
		count: Schema.Number,
		/** Total focus seconds on this day */
		focusSeconds: Schema.Number,
	},
) {}

/**
 * Stats for a specific time period.
 *
 * @since 0.3.0
 * @category Schemas
 */
export class PeriodStats extends Schema.Class<PeriodStats>("PeriodStats")({
	/** Pomodoros completed in this period */
	pomodoros: Schema.Number,
	/** Focus time in seconds */
	focusSeconds: Schema.Number,
	/** Break time in seconds */
	breakSeconds: Schema.Number,
	/** Focus overtime in seconds */
	focusOvertimeSeconds: Schema.Number,
	/** Break overtime in seconds */
	breakOvertimeSeconds: Schema.Number,
}) {}

/**
 * Stats computed from session data.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class SessionStats extends Schema.Class<SessionStats>("SessionStats")({
	/** Total pomodoro cycles started */
	totalPomodoros: Schema.Number,
	/** Total pomodoro cycles completed (focus + break done) */
	completedPomodoros: Schema.Number,
	/** Total completed focus sessions */
	completedFocusSessions: Schema.Number,
	/** Total completed break sessions */
	completedBreakSessions: Schema.Number,
	/** Total time in focus sessions (seconds) */
	totalFocusSeconds: Schema.Number,
	/** Total time in break sessions (seconds) */
	totalBreakSeconds: Schema.Number,
	/** Total overtime in focus sessions (seconds) */
	totalFocusOvertimeSeconds: Schema.Number,
	/** Total overtime in break sessions (seconds) */
	totalBreakOvertimeSeconds: Schema.Number,
	/** Current daily streak */
	currentStreak: Schema.Number,
	/** Longest ever streak */
	longestStreak: Schema.Number,
	/** Pomodoros completed today */
	todayPomodoros: Schema.Number,
	/** Pomodoros completed this week */
	thisWeekPomodoros: Schema.Number,
	/** Pomodoros completed this month */
	thisMonthPomodoros: Schema.Number,
	/** Today's detailed stats */
	today: PeriodStats,
	/** This week's detailed stats */
	week: PeriodStats,
	/** This month's detailed stats */
	month: PeriodStats,
	/** This year's detailed stats */
	year: PeriodStats,
	/** All time detailed stats */
	all: PeriodStats,
	/** Daily activity for contribution graph (all time) */
	dailyActivity: Schema.Array(DailyActivity),
}) {}
