/**
 * CSV rendering of recorded pomodoros.
 *
 * @module
 */
import { DateTime, Option } from "effect";
import type {
	BreakSession,
	FocusSession,
	Pomodoro,
} from "@/shared/domain/Session";

const quote = (value: string) =>
	/[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

const iso = (value: Option.Option<DateTime.Utc>) =>
	Option.match(value, { onNone: () => "", onSome: DateTime.formatIso });

/**
 * One row per pomodoro with its completed focus and break totals.
 *
 * @since 2.1.0
 * @category Functions
 */
export const toCsv = (data: {
	readonly pomodoros: ReadonlyArray<Pomodoro>;
	readonly focusSessions: ReadonlyArray<FocusSession>;
	readonly breakSessions: ReadonlyArray<BreakSession>;
}): string => {
	const header = [
		"pomodoro_id",
		"label",
		"created_at",
		"completed_at",
		"focus_seconds",
		"focus_overtime_seconds",
		"break_seconds",
		"break_overtime_seconds",
	];
	const totals = (
		sessions: ReadonlyArray<FocusSession | BreakSession>,
		id: string,
	) => {
		const own = sessions.filter((s) => s.pomodoroId === id && s.completed);
		return [
			own.reduce((sum, s) => sum + s.elapsedSeconds, 0),
			own.reduce(
				(sum, s) => sum + Math.max(0, s.elapsedSeconds - s.configuredSeconds),
				0,
			),
		];
	};
	const rows = data.pomodoros
		.toSorted(
			(a, b) =>
				DateTime.toEpochMillis(a.createdAt) -
				DateTime.toEpochMillis(b.createdAt),
		)
		.map((pomodoro) =>
			[
				pomodoro.id,
				quote(Option.getOrElse(pomodoro.label, () => "")),
				DateTime.formatIso(pomodoro.createdAt),
				iso(pomodoro.completedAt),
				...totals(data.focusSessions, pomodoro.id),
				...totals(data.breakSessions, pomodoro.id),
			].join(","),
		);
	return `${[header.join(","), ...rows].join("\n")}\n`;
};
