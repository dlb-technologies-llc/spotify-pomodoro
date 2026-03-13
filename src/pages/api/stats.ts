/**
 * Stats API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { ServerLayer } from "@/effect/layers";
import { SessionRepository } from "@/effect/services/SessionRepository";

/**
 * GET /api/stats - Get session statistics.
 *
 * @since 0.2.0
 */
export const GET: APIRoute = async () => {
	const program = Effect.gen(function* () {
		yield* Effect.logDebug("GET /api/stats");
		const repo = yield* SessionRepository;
		return yield* repo.getStats();
	}).pipe(Effect.withSpan("GET /api/stats"), Effect.provide(ServerLayer));

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
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
