/**
 * Indexes the pomodoro foreign key on both session tables.
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
	yield* sql`CREATE INDEX IF NOT EXISTS focus_sessions_pomodoro_id ON focus_sessions (pomodoro_id)`;
	yield* sql`CREATE INDEX IF NOT EXISTS break_sessions_pomodoro_id ON break_sessions (pomodoro_id)`;
});
