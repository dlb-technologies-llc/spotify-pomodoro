/**
 * Database module exports and injectable DbClient service.
 *
 * @module
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Effect, Layer, ServiceMap } from "effect";

export * from "./schema";

/**
 * Injectable database client service wrapping a Drizzle ORM instance.
 *
 * Yield this in an Effect generator to access the Drizzle client.
 *
 * @since 2.0.0
 * @category Services
 */
export const DbClient = ServiceMap.Reference("DbClient", {
	defaultValue: () => {
		const client = createClient({ url: "file:./data/pomodoro.db" });
		return drizzle(client);
	},
});

/**
 * Production layer using file-based SQLite at `data/pomodoro.db`.
 *
 * @since 2.0.0
 * @category Layers
 */
export const DbClientLive = Layer.effect(
	DbClient,
	Effect.sync(() => {
		const client = createClient({ url: "file:./data/pomodoro.db" });
		return drizzle(client);
	}),
);

/**
 * Test layer using an in-memory SQLite database with migrations applied.
 *
 * @since 2.0.0
 * @category Layers
 */
export const DbClientTest = Layer.effect(
	DbClient,
	Effect.gen(function* () {
		const client = createClient({ url: ":memory:" });
		const db = drizzle(client);

		const migrationsDir = resolve(import.meta.dirname, "migrations");
		const migrationFiles = readdirSync(migrationsDir)
			.filter((f) => f.endsWith(".sql"))
			.sort();

		for (const file of migrationFiles) {
			const sql = readFileSync(resolve(migrationsDir, file), "utf-8");
			const statements = sql
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean);
			for (const statement of statements) {
				yield* Effect.promise(() => client.execute(statement));
			}
		}

		return db;
	}),
);
