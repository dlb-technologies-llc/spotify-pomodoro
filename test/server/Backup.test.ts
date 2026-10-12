/**
 * Backups, retention, and the readiness probe.
 *
 * @module
 */
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";
import { SqlClient } from "effect/sql";
import { ApiClient } from "@/client/ApiClient";
import { backupFileName, defaultBackupDir } from "@/server/Backup";
import { sqlClient } from "@/server/Database";
import { apiClientFor, send, startServer } from "../support/server";

const tempDir = Effect.acquireRelease(
	Effect.promise(() => mkdtemp(join(tmpdir(), "pomodoro-backup-"))),
	(dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
);

describe("backups", () => {
	it.effect("copies the database into the backup directory", () =>
		Effect.gen(function* () {
			const dir = yield* tempDir;
			const handler = yield* startServer({ env: { BACKUP_DIR: dir } });
			const api = yield* Effect.provide(ApiClient, apiClientFor(handler));
			const pomodoro = yield* api.sessions.createPomodoro({ query: {} });

			const backup = yield* api.backups.create();
			assert.isAbove(backup.bytes, 0);
			assert.deepStrictEqual(yield* Effect.promise(() => readdir(dir)), [
				backup.file,
			]);
			const listed = yield* api.backups.list();
			assert.deepStrictEqual(
				listed.map((entry) => entry.file),
				[backup.file],
			);

			const ids = yield* Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				return yield* sql<{ readonly id: string }>`SELECT id FROM pomodoros`;
			}).pipe(Effect.provide(sqlClient(`file:${join(dir, backup.file)}`)));
			assert.deepStrictEqual(
				ids.map((row) => row.id),
				[pomodoro.id],
			);
		}),
	);

	it.live("removes backups older than the retention period", () =>
		Effect.gen(function* () {
			const dir = yield* tempDir;
			const now = yield* DateTime.now;
			const old = backupFileName(DateTime.subtract(now, { days: 3 }));
			const recent = backupFileName(DateTime.subtract(now, { days: 1 }));
			const unrelated = "notes.txt";
			for (const [file, daysAgo] of [
				[old, 3],
				[recent, 1],
				[unrelated, 30],
			] satisfies ReadonlyArray<readonly [string, number]>) {
				const path = join(dir, file);
				const at = DateTime.toEpochMillis(
					DateTime.subtract(now, { days: daysAgo }),
				);
				yield* Effect.promise(async () => {
					await writeFile(path, "");
					await utimes(path, at / 1000, at / 1000);
				});
			}
			const handler = yield* startServer({
				env: { BACKUP_DIR: dir, BACKUP_RETENTION_DAYS: "2" },
			});
			const api = yield* Effect.provide(ApiClient, apiClientFor(handler));
			const backup = yield* api.backups.create();
			const files = yield* Effect.promise(() => readdir(dir));
			assert.deepStrictEqual(
				files.toSorted(),
				[backup.file, unrelated, recent].toSorted(),
			);
		}),
	);

	it("puts backups next to a file database by default", () => {
		assert.strictEqual(
			defaultBackupDir("file:/app/data/pomodoro.db"),
			"/app/data/backups",
		);
		assert.strictEqual(defaultBackupDir(":memory:"), join("data", "backups"));
	});
});

describe("readiness", () => {
	it.effect("reports ready once the database answers", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const response = yield* send(handler, "/api/ready");
			assert.strictEqual(response.status, 200);
			assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
				status: "ok",
			});
		}),
	);
});
