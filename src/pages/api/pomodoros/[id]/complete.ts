/**
 * Complete pomodoro API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Effect, Exit, Schema } from "effect";
import { ServerLayer } from "@/effect/layers";
import { Pomodoro } from "@/effect/schema/Session";
import { SessionRepository } from "@/effect/services/SessionRepository";

/**
 * POST /api/pomodoros/:id/complete - Mark a pomodoro as completed.
 *
 * @since 0.2.0
 */
export const POST: APIRoute = async ({ params }) => {
	const { id } = params;

	if (!id) {
		return new Response(JSON.stringify({ error: "Missing pomodoro ID" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const program = Effect.gen(function* () {
		yield* Effect.logDebug("POST /api/pomodoros/:id/complete").pipe(
			Effect.annotateLogs("pomodoroId", id),
		);
		const repo = yield* SessionRepository;
		const result = yield* repo.completePomodoro(id);

		return Schema.encodeSync(Pomodoro)(result);
	}).pipe(
		Effect.withSpan("POST /api/pomodoros/:id/complete"),
		Effect.provide(ServerLayer),
	);

	const exit = await Effect.runPromiseExit(program);

	if (Exit.isFailure(exit)) {
		const reason = exit.cause.reasons?.[0];
		return new Response(
			JSON.stringify({ error: String(reason ?? exit.cause) }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	return new Response(JSON.stringify(exit.value), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
