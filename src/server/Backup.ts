/**
 * SQLite backups with retention.
 *
 * @module
 */
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	Context,
	DateTime,
	Duration,
	Effect,
	Layer,
	Option,
	Schedule,
} from "effect";
import { SqlClient } from "effect/sql";
import { BackupInfo } from "@/shared/domain/Backup";
import { ServerConfig } from "./ServerConfig";

const BACKUP_FILE = /^pomodoro-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/;

/**
 * Where backups go when `BACKUP_DIR` is unset: a `backups` folder next to a
 * file database, otherwise `./data/backups`.
 *
 * @since 2.1.0
 * @category Helpers
 */
export const defaultBackupDir = (databaseUrl: string) =>
	databaseUrl.startsWith("file:")
		? join(dirname(databaseUrl.slice("file:".length)), "backups")
		: join("data", "backups");

/**
 * File name for a backup taken at `at`, sortable by time.
 *
 * @since 2.1.0
 * @category Helpers
 */
export const backupFileName = (at: DateTime.Utc) =>
	`pomodoro-${DateTime.formatIso(at).replace(/[:.]/g, "-")}.db`;

/**
 * Consistent copies of the database made with `VACUUM INTO`, which is safe
 * while the app is running. Backups older than `BACKUP_RETENTION_DAYS` are
 * removed after each new one (0 keeps them all).
 *
 * @since 2.1.0
 * @category Services
 */
export class Backup extends Context.Service<Backup>()(
	"spotify-pomodoro/server/Backup",
	{
		make: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const config = yield* ServerConfig;
			const dir = Option.getOrElse(config.backupDir, () =>
				defaultBackupDir(config.databaseUrl),
			);

			const list = Effect.fn("Backup.list")(function* () {
				const names = yield* Effect.tryPromise(() => readdir(dir)).pipe(
					Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])),
				);
				const backups = yield* Effect.forEach(
					names.filter((name) => BACKUP_FILE.test(name)),
					(file) =>
						Effect.tryPromise(() => stat(join(dir, file))).pipe(
							Effect.map(
								(info) =>
									new BackupInfo({
										file,
										bytes: info.size,
										createdAt: DateTime.makeUnsafe(info.mtimeMs),
									}),
							),
						),
				);
				return backups.toSorted(
					(a, b) =>
						DateTime.toEpochMillis(b.createdAt) -
						DateTime.toEpochMillis(a.createdAt),
				);
			}, Effect.orDie);

			const prune = Effect.fn("Backup.prune")(function* (now: DateTime.Utc) {
				if (config.backupRetentionDays <= 0) return;
				const cutoff = DateTime.subtract(now, {
					days: config.backupRetentionDays,
				});
				for (const backup of yield* list()) {
					if (DateTime.isLessThan(backup.createdAt, cutoff)) {
						yield* Effect.tryPromise(() => unlink(join(dir, backup.file)));
						yield* Effect.logInfo("Removed old backup", { file: backup.file });
					}
				}
			}, Effect.orDie);

			const create = Effect.fn("Backup.create")(function* () {
				const now = yield* DateTime.now;
				const file = backupFileName(now);
				const path = join(dir, file);
				yield* Effect.tryPromise(() => mkdir(dir, { recursive: true }));
				yield* sql`VACUUM INTO ${path}`;
				const info = yield* Effect.tryPromise(() => stat(path));
				yield* prune(now);
				yield* Effect.logInfo("Backed up the database", { file });
				return new BackupInfo({
					file,
					bytes: info.size,
					createdAt: DateTime.makeUnsafe(info.mtimeMs),
				});
			}, Effect.orDie);

			return { dir, list, create };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}

/**
 * Backs up at startup and then every `BACKUP_INTERVAL_HOURS` (0 turns
 * automatic backups off). Failures are logged and retried next time.
 *
 * @since 2.1.0
 * @category Layers
 */
export const BackupScheduleLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const backup = yield* Backup;
		const { backupIntervalHours } = yield* ServerConfig;
		if (backupIntervalHours <= 0) return;
		yield* backup.create().pipe(
			Effect.catchCause((cause) => Effect.logWarning("Backup failed", cause)),
			Effect.repeat(Schedule.spaced(Duration.hours(backupIntervalHours))),
			Effect.forkScoped,
		);
	}),
);
