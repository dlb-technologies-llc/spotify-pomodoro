/**
 * Gives every pomodoro an owner. Existing data belongs to the default user.
 *
 * @module
 */
import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * @since 2.1.0
 * @category Migrations
 */
export default Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`ALTER TABLE pomodoros ADD COLUMN user_id TEXT NOT NULL DEFAULT 'admin'`;
	yield* sql`CREATE INDEX IF NOT EXISTS pomodoros_user_created ON pomodoros (user_id, created_at)`;
});
