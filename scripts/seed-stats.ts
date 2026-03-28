/**
 * Database seed script for stats testing.
 *
 * Seeds the database with test pomodoros distributed across 2023-2025
 * for comprehensive stats feature testing.
 *
 * @module
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, Random } from "effect";
import { breakSessions, focusSessions, pomodoros } from "../src/db/schema";

/**
 * Configuration for yearly pomodoro distribution.
 *
 * @since 0.2.0
 * @category Config
 */
const YEAR_CONFIG = [
	{ year: 2023, count: 200 },
	{ year: 2024, count: 400 },
	{ year: 2025, count: 800 },
] as const;

/**
 * Focus session configuration (25 minutes configured, 20-30 minutes elapsed).
 *
 * @since 0.2.0
 * @category Config
 */
const FOCUS_CONFIG = {
	configuredSeconds: 25 * 60,
	minElapsedSeconds: 20 * 60,
	maxElapsedSeconds: 30 * 60,
} as const;

/**
 * Break session configuration (5 minutes configured, 3-8 minutes elapsed).
 *
 * @since 0.2.0
 * @category Config
 */
const BREAK_CONFIG = {
	configuredSeconds: 5 * 60,
	minElapsedSeconds: 3 * 60,
	maxElapsedSeconds: 8 * 60,
} as const;

/**
 * Generates a random timestamp within a given year.
 *
 * @since 0.2.0
 * @category Helpers
 */
const randomTimestampInYear = (year: number) =>
	Effect.gen(function* () {
		const startOfYear = new Date(year, 0, 1).getTime();
		const endOfYear = new Date(year, 11, 31, 23, 59, 59).getTime();
		const randomOffset = yield* Random.nextIntBetween(
			0,
			endOfYear - startOfYear,
		);
		return new Date(startOfYear + randomOffset);
	});

/**
 * Generates a random elapsed time within the specified bounds.
 *
 * @since 0.2.0
 * @category Helpers
 */
const randomElapsedSeconds = (min: number, max: number) =>
	Random.nextIntBetween(min, max + 1);

/**
 * Creates a single pomodoro with associated focus and break sessions.
 *
 * @since 0.2.0
 * @category Helpers
 */
const createPomodoro = (db: ReturnType<typeof drizzle>, completedAt: Date) =>
	Effect.gen(function* () {
		const pomodoroId = crypto.randomUUID();

		const focusElapsed = yield* randomElapsedSeconds(
			FOCUS_CONFIG.minElapsedSeconds,
			FOCUS_CONFIG.maxElapsedSeconds,
		);
		const breakElapsed = yield* randomElapsedSeconds(
			BREAK_CONFIG.minElapsedSeconds,
			BREAK_CONFIG.maxElapsedSeconds,
		);

		const totalDuration = (focusElapsed + breakElapsed) * 1000;
		const focusDuration = focusElapsed * 1000;

		const createdAtMs = completedAt.getTime() - totalDuration;
		const focusStartedAtMs = createdAtMs;
		const focusCompletedAtMs = createdAtMs + focusDuration;
		const breakStartedAtMs = focusCompletedAtMs;
		const breakCompletedAtMs = completedAt.getTime();

		yield* Effect.try({
			try: () =>
				db
					.insert(pomodoros)
					.values({
						id: pomodoroId,
						createdAt: createdAtMs,
						completedAt: breakCompletedAtMs,
					})
					.run(),
			catch: (e) => e,
		});

		yield* Effect.try({
			try: () =>
				db
					.insert(focusSessions)
					.values({
						id: crypto.randomUUID(),
						pomodoroId,
						configuredSeconds: FOCUS_CONFIG.configuredSeconds,
						elapsedSeconds: focusElapsed,
						startedAt: focusStartedAtMs,
						completedAt: focusCompletedAtMs,
						completed: true,
						createdAt: focusStartedAtMs,
					})
					.run(),
			catch: (e) => e,
		});

		yield* Effect.try({
			try: () =>
				db
					.insert(breakSessions)
					.values({
						id: crypto.randomUUID(),
						pomodoroId,
						configuredSeconds: BREAK_CONFIG.configuredSeconds,
						elapsedSeconds: breakElapsed,
						startedAt: breakStartedAtMs,
						completedAt: breakCompletedAtMs,
						completed: true,
						createdAt: breakStartedAtMs,
					})
					.run(),
			catch: (e) => e,
		});
	});

/**
 * Seeds pomodoros for a specific year.
 *
 * @since 0.2.0
 * @category Helpers
 */
const seedYear = (
	db: ReturnType<typeof drizzle>,
	year: number,
	count: number,
) =>
	Effect.gen(function* () {
		yield* Effect.log(`Seeding ${count} pomodoros for ${year}...`);

		const timestamps = yield* Effect.all(
			Array.from({ length: count }, () => randomTimestampInYear(year)),
		);

		const sortedTimestamps = timestamps.sort(
			(a, b) => a.getTime() - b.getTime(),
		);

		let created = 0;
		for (const timestamp of sortedTimestamps) {
			yield* createPomodoro(db, timestamp);
			created++;

			if (created % 100 === 0) {
				yield* Effect.log(`  ${created}/${count} pomodoros created...`);
			}
		}

		yield* Effect.log(`  Completed ${count} pomodoros for ${year}`);
	});

/**
 * Main seed program.
 *
 * @since 0.2.0
 * @category Program
 */
const program = Effect.gen(function* () {
	const sqlite = new Database("./data/pomodoro.db");
	const db = drizzle(sqlite);

	yield* Effect.log("Starting database seed for stats testing...");
	yield* Effect.log("");

	const totalCount = YEAR_CONFIG.reduce((sum, { count }) => sum + count, 0);
	yield* Effect.log(`Total pomodoros to create: ${totalCount}`);
	yield* Effect.log("");

	for (const { year, count } of YEAR_CONFIG) {
		yield* seedYear(db, year, count);
		yield* Effect.log("");
	}

	yield* Effect.log("Verifying seed data...");
	const pomodoroCount = db.select().from(pomodoros).all().length;
	const focusCount = db.select().from(focusSessions).all().length;
	const breakCount = db.select().from(breakSessions).all().length;

	yield* Effect.log(`  Pomodoros: ${pomodoroCount}`);
	yield* Effect.log(`  Focus sessions: ${focusCount}`);
	yield* Effect.log(`  Break sessions: ${breakCount}`);
	yield* Effect.log("");

	sqlite.close();
	yield* Effect.log("Database seeded successfully!");
});

Effect.runPromise(program).catch(console.error);
