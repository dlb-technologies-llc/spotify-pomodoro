/**
 * Periodic cleanup of abandoned pomodoros and sessions.
 *
 * @module
 */
import { DateTime, Effect, Layer, Schedule } from "effect";
import { SessionRepository } from "./SessionRepository";

/**
 * Records left unfinished for longer than this are cleaned up.
 *
 * @since 2.1.0
 * @category Config
 */
export const ABANDONED_AFTER_HOURS = 24;

/**
 * Hourly, and once at startup: pomodoros left unfinished for a day are
 * completed at their last finished session, or removed if none finished;
 * unfinished sessions that old are removed. Keeps stats free of abandoned
 * records.
 *
 * @since 2.1.0
 * @category Layers
 */
export const MaintenanceLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const repo = yield* SessionRepository;
		yield* Effect.gen(function* () {
			const cutoff = DateTime.subtract(yield* DateTime.now, {
				hours: ABANDONED_AFTER_HOURS,
			});
			const removed = yield* repo.cleanupAbandoned(cutoff);
			if (removed > 0)
				yield* Effect.logInfo("Removed abandoned pomodoros", { removed });
		}).pipe(
			Effect.catchCause((cause) => Effect.logWarning("Cleanup failed", cause)),
			Effect.repeat(Schedule.spaced("1 hour")),
			Effect.forkScoped,
		);
	}),
);
