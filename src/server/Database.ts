/**
 * SQLite access through libSQL, with migrations applied on startup.
 *
 * @module
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql";
import { Effect, Layer, String as Str } from "effect";
import initial from "./migrations/0001_initial";
import sessionIndexes from "./migrations/0002_session_indexes";
import pomodoroLabel from "./migrations/0003_pomodoro_label";
import { ServerConfig } from "./ServerConfig";

/**
 * Every migration, keyed `<id>_<name>`.
 *
 * @since 2.0.0
 * @category Migrations
 */
export const migrations = LibsqlMigrator.fromRecord({
	"0001_initial": initial,
	"0002_session_indexes": sessionIndexes,
	"0003_pomodoro_label": pomodoroLabel,
});

/**
 * libSQL client for a URL, mapping snake_case columns to camelCase fields.
 *
 * @since 2.0.0
 * @category Layers
 */
export const sqlClient = (url: string) =>
	LibsqlClient.layer({
		url,
		transformQueryNames: Str.camelToSnake,
		transformResultNames: Str.snakeToCamel,
	});

/**
 * Migrated database for a URL.
 *
 * @since 2.0.0
 * @category Layers
 */
export const database = (url: string) =>
	LibsqlMigrator.layer({ loader: migrations }).pipe(
		Layer.provideMerge(sqlClient(url)),
	);

/**
 * In-memory database for tests.
 *
 * @since 2.0.0
 * @category Layers
 */
export const DatabaseTest = database(":memory:");

/**
 * Database at `DATABASE_URL`, creating the parent directory of a `file:` URL.
 *
 * @since 2.0.0
 * @category Layers
 */
export const DatabaseLive = Layer.unwrap(
	Effect.gen(function* () {
		const { databaseUrl } = yield* ServerConfig;
		if (databaseUrl.startsWith("file:")) {
			const path = databaseUrl.slice("file:".length);
			yield* Effect.sync(() => mkdirSync(dirname(path), { recursive: true }));
		}
		return database(databaseUrl);
	}),
);
