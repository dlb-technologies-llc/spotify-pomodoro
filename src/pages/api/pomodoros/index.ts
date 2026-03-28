/**
 * Pomodoros API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Cause, Effect, Exit, Schema } from "effect";
import { ServerLayer } from "@/effect/layers";
import { Pomodoro } from "@/effect/schema/Session";
import { SessionRepository } from "@/effect/services/SessionRepository";

/**
 * POST /api/pomodoros - Create a new pomodoro.
 *
 * @since 0.2.0
 */
export const POST: APIRoute = async () => {
	const program = Effect.gen(function* () {
		yield* Effect.logDebug("POST /api/pomodoros");
		const repo = yield* SessionRepository;
		const result = yield* repo.createPomodoro();

		return Schema.encodeSync(Pomodoro)(result);
	}).pipe(Effect.withSpan("POST /api/pomodoros"), Effect.provide(ServerLayer));

	const exit = await Effect.runPromiseExit(program);

	if (Exit.isFailure(exit)) {
		const error = Cause.squash(exit.cause);
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify(exit.value), {
		status: 201,
		headers: { "Content-Type": "application/json" },
	});
};
