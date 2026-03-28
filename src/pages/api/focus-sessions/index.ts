/**
 * Focus sessions API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Cause, Effect, Exit, Schema } from "effect";
import { ServerLayer } from "@/effect/layers";
import { CreateFocusSessionInput, FocusSession } from "@/effect/schema/Session";
import { SessionRepository } from "@/effect/services/SessionRepository";

/**
 * POST /api/focus-sessions - Create a new focus session.
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
		const input = yield* Schema.decodeUnknownEffect(CreateFocusSessionInput)(
			body,
		);

		yield* Effect.logDebug("POST /api/focus-sessions").pipe(
			Effect.annotateLogs("pomodoroId", input.pomodoroId),
		);
		const repo = yield* SessionRepository;
		const result = yield* repo.createFocusSession(input);

		return Schema.encodeSync(FocusSession)(result);
	}).pipe(
		Effect.withSpan("POST /api/focus-sessions"),
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
		status: 201,
		headers: { "Content-Type": "application/json" },
	});
};
