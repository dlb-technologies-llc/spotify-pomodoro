/**
 * Session schemas for Effect.
 *
 * @module
 */
import { Schema, SchemaTransformation } from "effect";

/**
 * A non-negative integer (>= 0).
 *
 * @since 0.5.0
 * @category Schemas
 */
const NonNegativeInt = Schema.Int.pipe(
	Schema.check(Schema.isGreaterThanOrEqualTo(0)),
);

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
	id: Schema.NonEmptyString,
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
	id: Schema.NonEmptyString,
	pomodoroId: Schema.NonEmptyString,
	configuredSeconds: NonNegativeInt,
	elapsedSeconds: NonNegativeInt,
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
	id: Schema.NonEmptyString,
	pomodoroId: Schema.NonEmptyString,
	configuredSeconds: NonNegativeInt,
	elapsedSeconds: NonNegativeInt,
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
	pomodoroId: Schema.NonEmptyString,
	configuredSeconds: NonNegativeInt,
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
	pomodoroId: Schema.NonEmptyString,
	configuredSeconds: NonNegativeInt,
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
	elapsedSeconds: NonNegativeInt,
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
		date: Schema.NonEmptyString,
		/** Number of pomodoros completed on this day */
		count: NonNegativeInt,
		/** Total focus seconds on this day */
		focusSeconds: NonNegativeInt,
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
	pomodoros: NonNegativeInt,
	/** Focus time in seconds */
	focusSeconds: NonNegativeInt,
	/** Break time in seconds */
	breakSeconds: NonNegativeInt,
	/** Focus overtime in seconds */
	focusOvertimeSeconds: NonNegativeInt,
	/** Break overtime in seconds */
	breakOvertimeSeconds: NonNegativeInt,
}) {}

/**
 * Stats computed from session data.
 *
 * @since 0.2.0
 * @category Schemas
 */
export class SessionStats extends Schema.Class<SessionStats>("SessionStats")({
	/** Total pomodoro cycles started */
	totalPomodoros: NonNegativeInt,
	/** Total pomodoro cycles completed (focus + break done) */
	completedPomodoros: NonNegativeInt,
	/** Total completed focus sessions */
	completedFocusSessions: NonNegativeInt,
	/** Total completed break sessions */
	completedBreakSessions: NonNegativeInt,
	/** Total time in focus sessions (seconds) */
	totalFocusSeconds: NonNegativeInt,
	/** Total time in break sessions (seconds) */
	totalBreakSeconds: NonNegativeInt,
	/** Total overtime in focus sessions (seconds) */
	totalFocusOvertimeSeconds: NonNegativeInt,
	/** Total overtime in break sessions (seconds) */
	totalBreakOvertimeSeconds: NonNegativeInt,
	/** Current daily streak */
	currentStreak: NonNegativeInt,
	/** Longest ever streak */
	longestStreak: NonNegativeInt,
	/** Pomodoros completed today */
	todayPomodoros: NonNegativeInt,
	/** Pomodoros completed this week */
	thisWeekPomodoros: NonNegativeInt,
	/** Pomodoros completed this month */
	thisMonthPomodoros: NonNegativeInt,
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
