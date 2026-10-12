/**
 * Session history, export, and import.
 *
 * @module
 */
import { Schema } from "effect";
import {
	BreakSession,
	Count,
	FocusSession,
	OptionalInstant,
	Pomodoro,
	PomodoroId,
	PomodoroLabel,
	Seconds,
} from "./Session";

/**
 * One pomodoro as listed in the history.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class HistoryEntry extends Schema.Class<HistoryEntry>("HistoryEntry")({
	id: PomodoroId,
	label: Schema.OptionFromNullOr(PomodoroLabel),
	createdAt: Schema.DateTimeUtcFromMillis,
	completedAt: OptionalInstant,
	focusSeconds: Seconds,
	breakSeconds: Seconds,
	overtimeSeconds: Seconds,
	focusSessions: Count,
	breakSessions: Count,
}) {}

/**
 * Most recent pomodoros first; `nextBefore` continues the list.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class HistoryPage extends Schema.Class<HistoryPage>("HistoryPage")({
	items: Schema.Array(HistoryEntry),
	nextBefore: Schema.OptionFromNullOr(Schema.Number),
}) {}

/**
 * Paging for the history: entries created before `before` (epoch ms).
 *
 * @since 2.1.0
 * @category Schemas
 */
export const HistoryQuery = Schema.Struct({
	before: Schema.optional(Schema.FiniteFromString),
	limit: Schema.optional(
		Schema.FiniteFromString.pipe(
			Schema.decodeTo(
				Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
			),
		),
	),
});

/**
 * Every recorded pomodoro and session, as exported and imported.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const ExportFile = Schema.Struct({
	format: Schema.Literal("spotify-pomodoro"),
	version: Schema.Literal(1),
	exportedAt: Schema.DateTimeUtcFromMillis,
	pomodoros: Schema.Array(Pomodoro.json),
	focusSessions: Schema.Array(FocusSession.json),
	breakSessions: Schema.Array(BreakSession.json),
});

/**
 * @since 2.1.0
 * @category Schemas
 */
export type ExportFile = typeof ExportFile.Type;

/**
 * How many records an import added; existing ids and sessions whose
 * pomodoro is missing are skipped.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class ImportResult extends Schema.Class<ImportResult>("ImportResult")({
	pomodoros: Count,
	focusSessions: Count,
	breakSessions: Count,
	skipped: Count,
}) {}
