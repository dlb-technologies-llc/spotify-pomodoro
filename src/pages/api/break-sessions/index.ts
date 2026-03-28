/**
 * Break sessions API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Cause, Effect, Exit, Schema } from "effect";
import { ServerLayer } from "@/effect/layers";
import { BreakSession, CreateBreakSessionInput } from "@/effect/schema/Session";
import { SessionRepository } from "@/effect/services/SessionRepository";

/**
 * POST /api/break-sessions - Create a new break session.
 *
 * Request body: { pomodoroId: string, configuredSeconds: number }
 *
 * @since 0.2.0
 */
export const POST: APIRoute = async ({ request }) => {
	const program = Effect.gen(function* () {
		const body = yield* Effect.tryPromise({
			try: () => request.json(),
			catch: () => new Error("Invalid JSON body"),
		});
		const input = yield* Schema.decodeUnknownEffect(CreateBreakSessionInput)(
			body,
		);

		yield* Effect.logDebug("POST /api/break-sessions").pipe(
			Effect.annotateLogs("pomodoroId", input.pomodoroId),
		);
		const repo = yield* SessionRepository;
		const result = yield* repo.createBreakSession(input);

		return Schema.encodeSync(BreakSession)(result);
	}).pipe(
		Effect.withSpan("POST /api/break-sessions"),
		Effect.provide(ServerLayer),
	);

	const exit = await Effect.runPromiseExit(program);

	if (Exit.isFailure(exit)) {
		const error = Cause.squash(exit.cause);
		const isClientError =
			Schema.isSchemaError(error) ||
			(error instanceof Error && error.message === "Invalid JSON body");
		return new Response(JSON.stringify({ error: String(error) }), {
			status: isClientError ? 400 : 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify(exit.value), {
		status: 201,
		headers: { "Content-Type": "application/json" },
	});
};
