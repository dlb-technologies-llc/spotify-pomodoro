/**
 * Creates the pomodoro, focus session, and break session tables.
 *
 * Uses `IF NOT EXISTS` so databases created by the earlier Drizzle migrations
 * adopt this migration without changes.
 *
 * @module
 */
import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * @since 2.0.0
 * @category Migrations
 */
export default Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
		CREATE TABLE IF NOT EXISTS pomodoros (
			id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL,
			completed_at INTEGER
		)
	`;
	yield* sql`
		CREATE TABLE IF NOT EXISTS focus_sessions (
			id TEXT PRIMARY KEY NOT NULL,
			pomodoro_id TEXT NOT NULL REFERENCES pomodoros(id),
			configured_seconds INTEGER NOT NULL,
			elapsed_seconds INTEGER DEFAULT 0 NOT NULL,
			started_at INTEGER NOT NULL,
			completed_at INTEGER,
			completed INTEGER DEFAULT false NOT NULL,
			created_at INTEGER NOT NULL
		)
	`;
	yield* sql`
		CREATE TABLE IF NOT EXISTS break_sessions (
			id TEXT PRIMARY KEY NOT NULL,
			pomodoro_id TEXT NOT NULL REFERENCES pomodoros(id),
			configured_seconds INTEGER NOT NULL,
			elapsed_seconds INTEGER DEFAULT 0 NOT NULL,
			started_at INTEGER NOT NULL,
			completed_at INTEGER,
			completed INTEGER DEFAULT false NOT NULL,
			created_at INTEGER NOT NULL
		)
	`;
});
