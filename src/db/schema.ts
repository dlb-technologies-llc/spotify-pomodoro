/**
 * Database schema definitions for Drizzle ORM.
 *
 * @module
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Pomodoros table - the central entity grouping focus + break.
 *
 * @since 0.2.0
 * @category Schemas
 */
export const pomodoros = sqliteTable("pomodoros", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.$defaultFn(() => Date.now()),
	/** When the full pomodoro cycle (focus + break) was completed */
	completedAt: integer("completed_at", { mode: "number" }),
});

/**
 * Focus sessions table.
 *
 * @since 0.2.0
 * @category Schemas
 */
export const focusSessions = sqliteTable("focus_sessions", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	pomodoroId: text("pomodoro_id")
		.notNull()
		.references(() => pomodoros.id),
	/** What they configured (e.g., 25 min = 1500 seconds) */
	configuredSeconds: integer("configured_seconds").notNull(),
	/** Actual time spent (could be less, equal, or more than configured) */
	elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
	startedAt: integer("started_at", { mode: "number" }).notNull(),
	completedAt: integer("completed_at", { mode: "number" }),
	/** Whether user completed the session (vs abandoned/skipped) */
	completed: integer("completed", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.$defaultFn(() => Date.now()),
});

/**
 * Break sessions table.
 *
 * @since 0.2.0
 * @category Schemas
 */
export const breakSessions = sqliteTable("break_sessions", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	pomodoroId: text("pomodoro_id")
		.notNull()
		.references(() => pomodoros.id),
	/** What they configured (e.g., 5 min = 300 seconds) */
	configuredSeconds: integer("configured_seconds").notNull(),
	/** Actual time spent (could be less, equal, or more than configured) */
	elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
	startedAt: integer("started_at", { mode: "number" }).notNull(),
	completedAt: integer("completed_at", { mode: "number" }),
	/** Whether user completed the session (vs abandoned/skipped) */
	completed: integer("completed", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.$defaultFn(() => Date.now()),
});
