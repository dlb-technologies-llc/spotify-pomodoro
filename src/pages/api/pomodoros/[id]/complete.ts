/**
 * Complete pomodoro API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { ServerLayer } from "@/effect/layers";
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
		return yield* repo.completePomodoro(id);
	}).pipe(
		Effect.withSpan("POST /api/pomodoros/:id/complete"),
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
