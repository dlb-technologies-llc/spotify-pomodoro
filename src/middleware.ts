/**
 * Astro middleware for route protection.
 *
 * @module
 */
import { defineMiddleware } from "astro:middleware";
import { Effect, Result } from "effect";
import { Auth, COOKIE_NAME } from "./effect/services/Auth";

/**
 * Paths that don't require authentication.
 *
 * @since 1.1.0
 * @category Auth
 */
const PUBLIC_PATHS = [
	"/login",
	"/api/auth/login",
	"/api/auth/logout",
	"/api/health",
	"/favicon.svg",
];

/**
 * Check if a path is public (doesn't require auth).
 *
 * @since 1.1.0
 * @category Auth
 */
function isPublicPath(pathname: string): boolean {
	if (PUBLIC_PATHS.includes(pathname)) return true;
	if (pathname.startsWith("/_astro/")) return true;
	return false;
}

/**
 * Middleware that protects routes when AUTH_ENABLED=true.
 *
 * @since 1.1.0
 * @category Middleware
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const program = Effect.gen(function* () {
		const auth = yield* Auth;
		const enabled = yield* auth.isEnabled;
		if (!enabled) return { authenticated: true, enabled: false };

		const { pathname } = context.url;
		if (isPublicPath(pathname)) return { authenticated: true, enabled: true };

		const cookie = context.cookies.get(COOKIE_NAME)?.value;
		if (!cookie) return { authenticated: false, enabled: true };

		const result = yield* Effect.result(auth.verifyCookie(cookie));
		if (Result.isFailure(result))
			return { authenticated: false, enabled: true };

		return { authenticated: true, enabled: true };
	}).pipe(Effect.provide(Auth.layer));

	const { authenticated, enabled } = await Effect.runPromise(program);

	if (!enabled || authenticated) {
		return next();
	}

	const { pathname } = context.url;

	if (pathname.startsWith("/api/")) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const returnUrl = encodeURIComponent(pathname);
	return context.redirect(`/login?return=${returnUrl}`);
});
