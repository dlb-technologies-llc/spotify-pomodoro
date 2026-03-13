/**
 * Break sessions API endpoint.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { ServerLayer } from "@/effect/layers";
import { SessionRepository } from "@/effect/services/SessionRepository";

/**
 * POST /api/break-sessions - Create a new break session.
 *
 * Request body: { pomodoroId: string, configuredSeconds: number }
 *
 * @since 0.2.0
 */
export const POST: APIRoute = async ({ request }) => {
	let body: { pomodoroId?: string; configuredSeconds?: number };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const { pomodoroId, configuredSeconds } = body;

	if (!pomodoroId || typeof configuredSeconds !== "number") {
		return new Response(
			JSON.stringify({
				error: "Missing required fields: pomodoroId, configuredSeconds",
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const program = Effect.gen(function* () {
		yield* Effect.logDebug("POST /api/break-sessions").pipe(
			Effect.annotateLogs("pomodoroId", pomodoroId),
		);
		const repo = yield* SessionRepository;
		return yield* repo.createBreakSession({ pomodoroId, configuredSeconds });
	}).pipe(
		Effect.withSpan("POST /api/break-sessions"),
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
		status: 201,
		headers: { "Content-Type": "application/json" },
	});
};
