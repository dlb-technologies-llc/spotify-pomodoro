/**
 * Login endpoint - validates credentials and sets auth cookie.
 *
 * @module
 */

import type { APIRoute } from "astro";
import { Effect } from "effect";
import { InvalidCredentialsError } from "@/effect/errors/AuthError";
import { Auth, COOKIE_NAME } from "@/effect/services/Auth";

/**
 * Login result types.
 *
 * @since 1.1.0
 * @category Auth
 */
type LoginResult =
	| { success: true; cookieValue: string; maxAge: number }
	| { success: false; error: string; status: number };

/**
 * POST /api/auth/login - Authenticate user and set cookie.
 *
 * @since 1.1.0
 * @category API
 */
export const POST: APIRoute = async ({ request, cookies }) => {
	let body: { username?: string; password?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const { username, password } = body;

	if (!username || !password) {
		return new Response(
			JSON.stringify({ error: "Username and password required" }),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const program = Effect.gen(function* () {
		const auth = yield* Auth;
		const enabled = yield* auth.isEnabled();
		if (!enabled) {
			return {
				success: false,
				error: "Auth not enabled",
				status: 400,
			} as const;
		}

		yield* auth.validateCredentials(username, password);

		const config = yield* auth.getConfig();
		const cookieValue = yield* auth.createCookie(username);

		return {
			success: true,
			cookieValue,
			maxAge: config.maxAge,
		} as const;
	}).pipe(Effect.withSpan("POST /api/auth/login"), Effect.provide(Auth.layer));

	const result: LoginResult = await Effect.runPromise(program).catch(
		(error) => {
			if (error instanceof InvalidCredentialsError) {
				return { success: false, error: "Invalid credentials", status: 401 };
			}
			return { success: false, error: String(error), status: 500 };
		},
	);

	if (!result.success) {
		return new Response(JSON.stringify({ error: result.error }), {
			status: result.status,
			headers: { "Content-Type": "application/json" },
		});
	}

	cookies.set(COOKIE_NAME, result.cookieValue, {
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: "lax",
		maxAge: result.maxAge,
		path: "/",
	});

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};
