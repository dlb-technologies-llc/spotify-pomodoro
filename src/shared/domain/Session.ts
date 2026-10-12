/**
 * Pomodoro, focus session, and break session domain models.
 *
 * Each model is a `Model.Class`, so the database row shape and the JSON
 * shape served by the API are both derived from one field declaration.
 *
 * @module
 */
import { Schema } from "effect";
import { Model } from "effect/schema";

/**
 * Whole seconds, never negative.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const Seconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * A non-negative whole count.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * A UUID string.
 *
 * @since 2.0.0
 * @category Schemas
 */
const Uuid = Schema.String.check(Schema.isUUID());

/**
 * Identifier of a pomodoro cycle.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const PomodoroId = Uuid.pipe(Schema.brand("PomodoroId"));

/**
 * @since 2.0.0
 * @category Schemas
 */
export type PomodoroId = typeof PomodoroId.Type;

/**
 * Identifier of a focus session.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const FocusSessionId = Uuid.pipe(Schema.brand("FocusSessionId"));

/**
 * @since 2.0.0
 * @category Schemas
 */
export type FocusSessionId = typeof FocusSessionId.Type;

/**
 * Identifier of a break session.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const BreakSessionId = Uuid.pipe(Schema.brand("BreakSessionId"));

/**
 * @since 2.0.0
 * @category Schemas
 */
export type BreakSessionId = typeof BreakSessionId.Type;

/**
 * Optional instant stored as nullable epoch milliseconds.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const OptionalInstant = Schema.OptionFromNullOr(
	Schema.DateTimeUtcFromMillis,
);

/**
 * A pomodoro cycle grouping one focus session with its break.
 *
 * @since 0.2.0
 * @category Models
 */
export class Pomodoro extends Model.Class<Pomodoro>("Pomodoro")({
	id: Model.UuidV4Insert(PomodoroId),
	createdAt: Model.DateTimeInsertFromNumber,
	completedAt: OptionalInstant,
}) {}

/**
 * Fields shared by focus and break sessions.
 *
 * @since 2.0.0
 * @category Models
 */
const sessionFields = {
	pomodoroId: PomodoroId,
	configuredSeconds: Seconds,
	elapsedSeconds: Seconds,
	startedAt: Model.DateTimeInsertFromNumber,
	completedAt: OptionalInstant,
	completed: Model.BooleanSqlite,
	createdAt: Model.DateTimeInsertFromNumber,
};

/**
 * A focus session belonging to a pomodoro.
 *
 * @since 0.2.0
 * @category Models
 */
export class FocusSession extends Model.Class<FocusSession>("FocusSession")({
	id: Model.UuidV4Insert(FocusSessionId),
	...sessionFields,
}) {}

/**
 * A break session belonging to a pomodoro.
 *
 * @since 0.2.0
 * @category Models
 */
export class BreakSession extends Model.Class<BreakSession>("BreakSession")({
	id: Model.UuidV4Insert(BreakSessionId),
	...sessionFields,
}) {}

/**
 * Request body for starting a focus or break session.
 *
 * @since 0.2.0
 * @category Schemas
 */
export const StartSession = Schema.Struct({
	pomodoroId: PomodoroId,
	configuredSeconds: Seconds,
});

/**
 * @since 0.2.0
 * @category Schemas
 */
export type StartSession = typeof StartSession.Type;

/**
 * Request body for completing a focus or break session.
 *
 * @since 0.2.0
 * @category Schemas
 */
export const CompleteSession = Schema.Struct({
	elapsedSeconds: Seconds,
});

/**
 * @since 0.2.0
 * @category Schemas
 */
export type CompleteSession = typeof CompleteSession.Type;

/**
 * The requested pomodoro does not exist.
 *
 * @since 0.2.0
 * @category Errors
 */
export class PomodoroNotFound extends Schema.TaggedError<PomodoroNotFound>()(
	"PomodoroNotFound",
	{ id: PomodoroId },
	{ httpApiStatus: 404 },
) {}

/**
 * The requested focus session does not exist.
 *
 * @since 0.2.0
 * @category Errors
 */
export class FocusSessionNotFound extends Schema.TaggedError<FocusSessionNotFound>()(
	"FocusSessionNotFound",
	{ id: FocusSessionId },
	{ httpApiStatus: 404 },
) {}

/**
 * The requested break session does not exist.
 *
 * @since 0.2.0
 * @category Errors
 */
export class BreakSessionNotFound extends Schema.TaggedError<BreakSessionNotFound>()(
	"BreakSessionNotFound",
	{ id: BreakSessionId },
	{ httpApiStatus: 404 },
) {}
