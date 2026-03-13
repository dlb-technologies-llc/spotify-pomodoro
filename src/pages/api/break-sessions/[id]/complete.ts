/**
 * Complete break session API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { ServerLayer } from "@/effect/layers";
import { SessionRepository } from "@/effect/services/SessionRepository";

/**
 * POST /api/break-sessions/:id/complete - Complete a break session.
 *
 * Request body: { elapsedSeconds: number }
 *
 * @since 0.2.0
 */
export const POST: APIRoute = async ({ params, request }) => {
	const { id } = params;

	if (!id) {
		return new Response(JSON.stringify({ error: "Missing session ID" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: { elapsedSeconds?: number };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const { elapsedSeconds } = body;

	if (typeof elapsedSeconds !== "number") {
		return new Response(
			JSON.stringify({ error: "Missing required field: elapsedSeconds" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const program = Effect.gen(function* () {
		yield* Effect.logDebug("POST /api/break-sessions/:id/complete").pipe(
			Effect.annotateLogs("sessionId", id),
			Effect.annotateLogs("elapsedSeconds", elapsedSeconds),
		);
		const repo = yield* SessionRepository;
		return yield* repo.completeBreakSession(id, { elapsedSeconds });
	}).pipe(
		Effect.withSpan("POST /api/break-sessions/:id/complete"),
		Effect.provide(ServerLayer),
	);

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
