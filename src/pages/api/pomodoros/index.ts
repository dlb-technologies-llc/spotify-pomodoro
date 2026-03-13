/**
 * Pomodoros API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { ServerLayer } from "@/effect/layers";
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
		return yield* repo.createPomodoro();
	}).pipe(Effect.withSpan("POST /api/pomodoros"), Effect.provide(ServerLayer));

	const result = await Effect.runPromise(program).catch((error) => ({
		error: String(error),
	}));

	if ("error" in result) {
		return new Response(JSON.stringify({ error: result.error }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify(result), {
		status: 201,
		headers: { "Content-Type": "application/json" },
	});
};
