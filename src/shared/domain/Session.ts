/**
 * Pomodoro, focus session, and break session domain models.
 *
 * Each model is a `Model.Class`, so the database row shape and the JSON
 * shape served by the API are both derived from one field declaration.
 *
 * @module
 */
import { Option, Schema } from "effect";
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
 * When something happened on the client, in epoch milliseconds. Lets
 * recordings made offline keep their real times.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const Millis = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * {@link Millis} in a query string.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const QueryMillis = Schema.FiniteFromString.pipe(
	Schema.decodeTo(Millis),
);

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
 * What a pomodoro was spent on, e.g. "write report".
 *
 * @since 2.1.0
 * @category Schemas
 */
export const PomodoroLabel = Schema.Trimmed.check(
	Schema.isNonEmpty(),
	Schema.isMaxLength(120),
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
	label: Schema.OptionFromNullOr(PomodoroLabel),
}) {}

/**
 * Query string for creating a pomodoro. A query rather than a body keeps
 * body-less requests from older clients working.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const CreatePomodoro = Schema.Struct({
	label: Schema.optional(PomodoroLabel),
	id: Schema.optional(PomodoroId),
	at: Schema.optional(QueryMillis),
});

/**
 * Query string for completing a pomodoro at a given time.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const CompletePomodoro = Schema.Struct({
	at: Schema.optional(QueryMillis),
});

/**
 * @since 2.1.0
 * @category Schemas
 */
export type CreatePomodoro = typeof CreatePomodoro.Type;

/**
 * Request body for changing a pomodoro's label; `null` clears it.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const LabelPomodoro = Schema.Struct({
	label: Schema.NullOr(PomodoroLabel),
});

/**
 * @since 2.1.0
 * @category Schemas
 */
export type LabelPomodoro = typeof LabelPomodoro.Type;

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
 * Records the browser is filling in, saved so a reload keeps recording.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class RecordingIds extends Schema.Class<RecordingIds>("RecordingIds")({
	pomodoro: Schema.OptionFromNullOr(PomodoroId),
	focus: Schema.OptionFromNullOr(FocusSessionId),
	break: Schema.OptionFromNullOr(BreakSessionId),
	label: Schema.OptionFromNullOr(PomodoroLabel),
}) {
	/**
	 * Nothing being recorded.
	 *
	 * @since 2.1.0
	 */
	static readonly empty = new RecordingIds({
		pomodoro: Option.none(),
		focus: Option.none(),
		break: Option.none(),
		label: Option.none(),
	});
}

/**
 * Request body for starting a focus or break session.
 *
 * @since 0.2.0
 * @category Schemas
 */
export const StartSession = Schema.Struct({
	pomodoroId: PomodoroId,
	configuredSeconds: Seconds,
	id: Schema.optional(Uuid),
	at: Schema.optional(Millis),
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
	at: Schema.optional(Millis),
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
