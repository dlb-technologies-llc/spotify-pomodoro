/**
 * Test database layer — in-memory SQLite with migrations.
 *
 * Separated from index.ts to avoid bundling node:fs/node:path
 * into the production Astro build.
 *
 * @module
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Effect, Layer } from "effect";
import { DbClient } from ".";

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
