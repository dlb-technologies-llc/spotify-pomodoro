/**
 * Statistics computation.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Option, Schema } from "effect";
import {
	calendarDay,
	computeStats,
	currentRun,
	longestRun,
} from "@/server/Stats";
import {
	BreakSession,
	FocusSession,
	Pomodoro,
	Seconds,
} from "@/shared/domain/Session";
import { distinct, samples } from "../support/arbitrary";

const at = (iso: string) => DateTime.makeUnsafe(iso);

const zoned = (iso: string, timeZone: string) =>
	DateTime.makeZonedUnsafe(iso, { timeZone });

const sumElapsed = (sessions: ReadonlyArray<FocusSession | BreakSession>) =>
	sessions
		.filter((s) => s.completed)
		.reduce((total, s) => total + s.elapsedSeconds, 0);

const completedPomodoro = (pomodoro: Pomodoro, completedAt: string) =>
	new Pomodoro({ ...pomodoro, completedAt: Option.some(at(completedAt)) });

const focusFor = (
	session: FocusSession,
	pomodoro: Pomodoro,
	elapsedSeconds: number,
	configuredSeconds: number,
) =>
	new FocusSession({
		...session,
		pomodoroId: pomodoro.id,
		elapsedSeconds,
		configuredSeconds,
		completed: true,
		completedAt: pomodoro.completedAt,
	});

const breakFor = (
	session: BreakSession,
	pomodoro: Pomodoro,
	elapsedSeconds: number,
	configuredSeconds: number,
) =>
	new BreakSession({
		...session,
		pomodoroId: pomodoro.id,
		elapsedSeconds,
		configuredSeconds,
		completed: true,
		completedAt: pomodoro.completedAt,
	});

const NOW = zoned("2025-06-18T12:00:00Z", "UTC");

describe("computeStats", () => {
	it("is all zeros with no data", () => {
		const stats = computeStats({
			pomodoros: [],
			focusSessions: [],
			breakSessions: [],
			now: NOW,
		});
		assert.strictEqual(stats.totalPomodoros, 0);
		assert.strictEqual(stats.currentStreak, 0);
		assert.strictEqual(stats.longestStreak, 0);
		assert.deepStrictEqual(stats.dailyActivity, []);
		for (const period of [
			stats.today,
			stats.week,
			stats.month,
			stats.year,
			stats.all,
		]) {
			assert.strictEqual(period.pomodoros, 0);
			assert.strictEqual(period.focusSeconds, 0);
		}
	});

	it.effect.prop(
		"totals count only completed sessions",
		[
			Schema.Array(Pomodoro),
			Schema.Array(FocusSession),
			Schema.Array(BreakSession),
		],
		([pomodoros, focusSessions, breakSessions]) =>
			Effect.sync(() => {
				const stats = computeStats({
					pomodoros,
					focusSessions,
					breakSessions,
					now: NOW,
				});
				assert.strictEqual(stats.totalPomodoros, pomodoros.length);
				assert.strictEqual(
					stats.completedPomodoros,
					pomodoros.filter((p) => Option.isSome(p.completedAt)).length,
				);
				assert.strictEqual(stats.totalFocusSeconds, sumElapsed(focusSessions));
				assert.strictEqual(stats.totalBreakSeconds, sumElapsed(breakSessions));
				assert.strictEqual(
					stats.completedFocusSessions,
					focusSessions.filter((s) => s.completed).length,
				);
				assert.isAtMost(stats.currentStreak, stats.longestStreak);
				assert.strictEqual(
					stats.dailyActivity.reduce((n, day) => n + day.count, 0),
					stats.completedPomodoros,
				);
			}),
	);

	it.effect("splits time into periods and overtime", () =>
		Effect.gen(function* () {
			const [p1, p2, p3] = yield* distinct(
				Pomodoro,
				3,
				(pomodoro) => pomodoro.id,
			);
			const [f1, f2, f3] = yield* samples(FocusSession, 3);
			const [b1] = yield* samples(BreakSession, 1);
			if (!p1 || !p2 || !p3 || !f1 || !f2 || !f3 || !b1)
				return assert.fail("samples");
			const today = completedPomodoro(p1, "2025-06-18T09:00:00Z");
			const lastWeek = completedPomodoro(p2, "2025-06-10T09:00:00Z");
			const lastYear = completedPomodoro(p3, "2024-12-31T09:00:00Z");
			const stats = computeStats({
				pomodoros: [today, lastWeek, lastYear],
				focusSessions: [
					focusFor(f1, today, 1800, 1500),
					focusFor(f2, lastWeek, 1200, 1500),
					focusFor(f3, lastYear, 1500, 1500),
				],
				breakSessions: [breakFor(b1, today, 400, 300)],
				now: NOW,
			});
			assert.deepStrictEqual(
				{ ...stats.today },
				{
					pomodoros: 1,
					focusSeconds: 1800,
					breakSeconds: 400,
					focusOvertimeSeconds: 300,
					breakOvertimeSeconds: 100,
				},
			);
			assert.strictEqual(stats.week.pomodoros, 1);
			assert.strictEqual(stats.month.pomodoros, 2);
			assert.strictEqual(stats.year.pomodoros, 2);
			assert.strictEqual(stats.all.pomodoros, 3);
			assert.strictEqual(stats.all.focusSeconds, 4500);
			assert.strictEqual(stats.totalFocusOvertimeSeconds, 300);
		}),
	);

	it.effect("uses the viewer's time zone for days", () =>
		Effect.gen(function* () {
			const [p] = yield* distinct(Pomodoro, 1, (pomodoro) => pomodoro.id);
			const [f] = yield* samples(FocusSession, 1);
			if (!p || !f) return assert.fail("samples");
			const lateEvening = completedPomodoro(p, "2025-06-18T03:00:00Z");
			const input = {
				pomodoros: [lateEvening],
				focusSessions: [focusFor(f, lateEvening, 1500, 1500)],
				breakSessions: [],
			};

			const utc = computeStats({ ...input, now: NOW });
			assert.strictEqual(utc.today.pomodoros, 1);
			assert.deepStrictEqual(
				utc.dailyActivity.map((d) => d.date),
				["2025-06-18"],
			);

			const chicago = computeStats({
				...input,
				now: zoned("2025-06-18T12:00:00Z", "America/Chicago"),
			});
			assert.strictEqual(chicago.today.pomodoros, 0);
			assert.strictEqual(chicago.week.pomodoros, 1);
			assert.deepStrictEqual(
				chicago.dailyActivity.map((d) => d.date),
				["2025-06-17"],
			);
			assert.strictEqual(chicago.currentStreak, 0);
		}),
	);

	it.effect("counts streaks across month boundaries", () =>
		Effect.gen(function* () {
			const days = [
				"2025-09-29T12:00:00Z",
				"2025-09-30T12:00:00Z",
				"2025-10-01T12:00:00Z",
				"2025-10-05T12:00:00Z",
				"2025-10-06T12:00:00Z",
			];
			const pomodoros = (yield* distinct(
				Pomodoro,
				days.length,
				(p) => p.id,
			)).map((p, i) => completedPomodoro(p, days[i] ?? ""));
			const stats = computeStats({
				pomodoros,
				focusSessions: [],
				breakSessions: [],
				now: zoned("2025-10-06T20:00:00Z", "UTC"),
			});
			assert.strictEqual(stats.longestStreak, 3);
			assert.strictEqual(stats.currentStreak, 2);
		}),
	);
});

const dayOf = (iso: string) => calendarDay(zoned(`${iso}T12:00:00Z`, "UTC"));

describe("calendar days", () => {
	it("formats ISO dates, including extended years", () => {
		assert.strictEqual(dayOf("2024-02-29").iso, "2024-02-29");
		assert.strictEqual(
			calendarDay(DateTime.makeUnsafe(Date.UTC(10000, 0, 1))).iso,
			"+010000-01-01",
		);
		assert.strictEqual(
			dayOf("2024-03-01").index - dayOf("2024-02-28").index,
			2,
		);
	});

	it("longestRun counts consecutive days", () => {
		const index = (iso: string) => dayOf(iso).index;
		assert.strictEqual(longestRun(new Set()), 0);
		assert.strictEqual(
			longestRun(
				new Set(["2024-03-01", "2024-02-28", "2024-02-29"].map(index)),
			),
			3,
		);
		assert.strictEqual(
			longestRun(
				new Set(["2024-12-31", "2025-01-01", "2025-01-03"].map(index)),
			),
			2,
		);
	});

	it("currentRun stops at the first missing day", () => {
		const days = new Set([10, 11, 12]);
		assert.strictEqual(currentRun(days, 12), 3);
		assert.strictEqual(currentRun(days, 13), 0);
	});

	it.prop(
		"any single day is a run of one",
		[Seconds],
		([day]) =>
			longestRun(new Set([day])) === 1 && currentRun(new Set([day]), day) === 1,
	);
});
