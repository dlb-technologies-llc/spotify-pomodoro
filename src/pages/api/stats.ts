/**
 * Stats API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Cause, Effect, Exit, Schema } from "effect";
import { ServerLayer } from "@/effect/layers";
import { SessionStats } from "@/effect/schema/Session";
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
		const result = yield* repo.getStats();

		return Schema.encodeSync(SessionStats)(result);
	}).pipe(Effect.withSpan("GET /api/stats"), Effect.provide(ServerLayer));

	const exit = await Effect.runPromiseExit(program);

	if (Exit.isFailure(exit)) {
		const error = Cause.squash(exit.cause);
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify(exit.value), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
