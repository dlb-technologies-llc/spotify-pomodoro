/**
 * Complete break session API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Cause, Effect, Exit, Schema } from "effect";
import { ServerLayer } from "@/effect/layers";
import { BreakSession, CompleteSessionInput } from "@/effect/schema/Session";
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

	const program = Effect.gen(function* () {
		const body = yield* Effect.tryPromise({
			try: () => request.json(),
			catch: () => new Error("Invalid JSON body"),
		});
		const input = yield* Schema.decodeUnknownEffect(CompleteSessionInput)(body);

		yield* Effect.logDebug("POST /api/break-sessions/:id/complete").pipe(
			Effect.annotateLogs("sessionId", id),
			Effect.annotateLogs("elapsedSeconds", input.elapsedSeconds),
		);
		const repo = yield* SessionRepository;
		const result = yield* repo.completeBreakSession(id, input);

		return Schema.encodeSync(BreakSession)(result);
	}).pipe(
		Effect.withSpan("POST /api/break-sessions/:id/complete"),
		Effect.provide(ServerLayer),
	);

	const exit = await Effect.runPromiseExit(program);

	if (Exit.isFailure(exit)) {
		const error = Cause.squash(exit.cause);
		if (Schema.isSchemaError(error)) {
			return new Response(JSON.stringify({ error: String(error) }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
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
