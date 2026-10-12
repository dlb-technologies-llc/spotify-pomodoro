/**
 * Repository behaviour against an in-memory database.
 *
 * @module
 */
import { assert, describe, it as test, layer } from "@effect/vitest";
import { DateTime, Effect, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { DatabaseTest } from "@/server/Database";
import { SessionRepository } from "@/server/SessionRepository";
import { FocusSession, Pomodoro, Seconds } from "@/shared/domain/Session";
import { sample } from "../support/arbitrary";

const TestLayer = SessionRepository.layer.pipe(Layer.provide(DatabaseTest));

layer(TestLayer)("SessionRepository", (it) => {
	it.effect("stamps creation and completion with the clock", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			yield* TestClock.setTime(Date.parse("2025-03-01T10:00:00Z"));
			const pomodoro = yield* repo.createPomodoro({});
			assert.strictEqual(
				DateTime.formatIso(pomodoro.createdAt),
				"2025-03-01T10:00:00.000Z",
			);
			yield* TestClock.adjust("25 minutes");
			const completed = yield* repo.completePomodoro(pomodoro.id);
			assert.deepStrictEqual(
				Option.map(completed.completedAt, DateTime.formatIso),
				Option.some("2025-03-01T10:25:00.000Z"),
			);
		}),
	);

	it.effect("round-trips sessions through SQLite", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const configuredSeconds = yield* sample(Seconds);
			const elapsedSeconds = yield* sample(Seconds);
			const pomodoro = yield* repo.createPomodoro({});
			const focus = yield* repo.startFocus({
				pomodoroId: pomodoro.id,
				configuredSeconds,
			});
			assert.strictEqual(focus.configuredSeconds, configuredSeconds);
			assert.isFalse(focus.completed);
			const done = yield* repo.completeFocus(focus.id, { elapsedSeconds });
			assert.isTrue(done.completed);
			assert.strictEqual(done.elapsedSeconds, elapsedSeconds);
			assert.isTrue(Option.isSome(done.completedAt));
			const breakSession = yield* repo.startBreak({
				pomodoroId: pomodoro.id,
				configuredSeconds,
			});
			const doneBreak = yield* repo.completeBreak(breakSession.id, {
				elapsedSeconds,
			});
			assert.strictEqual(doneBreak.pomodoroId, pomodoro.id);
		}),
	);

	it.effect("fails with not-found errors for unknown ids", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const { id } = yield* sample(Pomodoro);
			const focus = yield* sample(FocusSession);
			assert.strictEqual(
				(yield* Effect.flip(repo.completePomodoro(id)))._tag,
				"PomodoroNotFound",
			);
			assert.strictEqual(
				(yield* Effect.flip(
					repo.startBreak({ pomodoroId: id, configuredSeconds: 1 }),
				))._tag,
				"PomodoroNotFound",
			);
			assert.strictEqual(
				(yield* Effect.flip(
					repo.completeFocus(focus.id, { elapsedSeconds: 1 }),
				))._tag,
				"FocusSessionNotFound",
			);
		}),
	);

	it.effect("stats see recorded data in the requested zone", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			yield* TestClock.setTime(Date.parse("2025-07-04T23:30:00Z"));
			const before = yield* repo.stats(
				DateTime.zoneMakeNamedUnsafe("Asia/Tokyo"),
			);
			const pomodoro = yield* repo.createPomodoro({});
			yield* repo.completePomodoro(pomodoro.id);
			const after = yield* repo.stats(
				DateTime.zoneMakeNamedUnsafe("Asia/Tokyo"),
			);
			assert.strictEqual(
				after.completedPomodoros,
				before.completedPomodoros + 1,
			);
			assert.isTrue(after.dailyActivity.some((d) => d.date === "2025-07-05"));
		}),
	);
});

layer(TestLayer)("abandoned sessions", (it) => {
	it.effect("completes or removes pomodoros left unfinished for a day", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			yield* TestClock.setTime(Date.parse("2025-05-01T09:00:00Z"));
			const finishedFocus = yield* repo.createPomodoro({});
			const focus = yield* repo.startFocus({
				pomodoroId: finishedFocus.id,
				configuredSeconds: 60,
			});
			yield* repo.completeFocus(focus.id, { elapsedSeconds: 60 });
			yield* repo.startBreak({
				pomodoroId: finishedFocus.id,
				configuredSeconds: 60,
			});
			const nothingDone = yield* repo.createPomodoro({});
			yield* repo.startFocus({
				pomodoroId: nothingDone.id,
				configuredSeconds: 60,
			});

			yield* TestClock.adjust("25 hours");
			const fresh = yield* repo.createPomodoro({});
			const removed = yield* repo.cleanupAbandoned(
				DateTime.subtract(yield* DateTime.now, { hours: 24 }),
			);
			assert.strictEqual(removed, 1);

			const { items } = yield* repo.history({
				before: Number.MAX_SAFE_INTEGER,
				limit: 10,
			});
			assert.deepStrictEqual(
				items.map((e) => e.id).toSorted(),
				[finishedFocus.id, fresh.id].toSorted(),
			);
			const kept = items.find((e) => e.id === finishedFocus.id);
			assert.isTrue(Option.isSome(kept?.completedAt ?? Option.none()));
			const stats = yield* repo.stats(DateTime.zoneMakeOffset(0));
			assert.strictEqual(stats.totalPomodoros, 2);
		}),
	);
});

describe("migrations", () => {
	test.effect("adopt a database created by the old Drizzle migrations", () =>
		Effect.gen(function* () {
			const { sqlClient, migrations } = yield* Effect.promise(
				() => import("@/server/Database"),
			);
			const { LibsqlMigrator } = yield* Effect.promise(
				() => import("@effect/sql-libsql"),
			);
			const { SqlClient } = yield* Effect.promise(() => import("effect/sql"));
			const legacyId = "6f1c1a44-0b5e-4d6e-9d1a-0a8f1b2c3d4e";
			const program = Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				yield* sql`CREATE TABLE \`pomodoros\` (\`id\` text PRIMARY KEY NOT NULL, \`created_at\` integer NOT NULL, \`completed_at\` integer)`;
				yield* sql`CREATE TABLE \`focus_sessions\` (\`id\` text PRIMARY KEY NOT NULL, \`pomodoro_id\` text NOT NULL, \`configured_seconds\` integer NOT NULL, \`elapsed_seconds\` integer DEFAULT 0 NOT NULL, \`started_at\` integer NOT NULL, \`completed_at\` integer, \`completed\` integer DEFAULT false NOT NULL, \`created_at\` integer NOT NULL, FOREIGN KEY (\`pomodoro_id\`) REFERENCES \`pomodoros\`(\`id\`) ON UPDATE no action ON DELETE no action)`;
				yield* sql`CREATE TABLE \`break_sessions\` (\`id\` text PRIMARY KEY NOT NULL, \`pomodoro_id\` text NOT NULL, \`configured_seconds\` integer NOT NULL, \`elapsed_seconds\` integer DEFAULT 0 NOT NULL, \`started_at\` integer NOT NULL, \`completed_at\` integer, \`completed\` integer DEFAULT false NOT NULL, \`created_at\` integer NOT NULL, FOREIGN KEY (\`pomodoro_id\`) REFERENCES \`pomodoros\`(\`id\`) ON UPDATE no action ON DELETE no action)`;
				yield* sql`CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`;
				yield* sql`INSERT INTO pomodoros (id, created_at, completed_at) VALUES (${legacyId}, 1735689600000, 1735691400000)`;
				yield* sql`INSERT INTO focus_sessions (id, pomodoro_id, configured_seconds, elapsed_seconds, started_at, completed_at, completed, created_at) VALUES ('7a2d3e4f-1b2c-4d5e-8f90-a1b2c3d4e5f6', ${legacyId}, 1500, 1560, 1735689600000, 1735691160000, 1, 1735689600000)`;

				const applied = yield* LibsqlMigrator.run({ loader: migrations });
				assert.deepStrictEqual(
					applied.map(([, name]) => name),
					["initial", "session_indexes", "pomodoro_label"],
				);
				const repo = yield* SessionRepository.make;
				const stats = yield* repo.stats(DateTime.zoneMakeOffset(0));
				assert.strictEqual(stats.completedPomodoros, 1);
				assert.strictEqual(stats.totalFocusSeconds, 1560);
				assert.strictEqual(stats.totalFocusOvertimeSeconds, 60);
			});
			yield* program.pipe(Effect.provide(sqlClient(":memory:")));
		}),
	);
});
