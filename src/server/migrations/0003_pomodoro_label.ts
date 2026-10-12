/**
 * Adds an optional label to pomodoros.
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
	yield* sql`ALTER TABLE pomodoros ADD COLUMN label TEXT`;
});
