/**
 * Session check for page requests, used by the Astro middleware.
 *
 * @module
 */
import { Effect, Layer, ManagedRuntime } from "effect";
import { Auth } from "./Auth";
import { EnvConfigProvider, ServerConfig } from "./ServerConfig";

const runtime = ManagedRuntime.make(
	Auth.layer.pipe(
		Layer.provide(ServerConfig.layer),
		Layer.provide(EnvConfigProvider),
	),
);

/**
 * Paths reachable without a session.
 *
 * @since 1.1.0
 * @category Auth
 */
export const isPublicPath = (pathname: string): boolean =>
	pathname === "/login" ||
	pathname === "/favicon.svg" ||
	pathname === "/robots.txt" ||
	pathname.startsWith("/_astro/") ||
	pathname.startsWith("/api/");

/**
 * Whether a page request may proceed, given its session cookie.
 *
 * @since 2.0.0
 * @category Auth
 */
export const isPageAllowed = (pathname: string, cookie: string | undefined) =>
	runtime.runPromise(
		Effect.gen(function* () {
			const auth = yield* Auth;
			if (!auth.enabled || isPublicPath(pathname)) return true;
			return yield* auth.verify(cookie ?? "").pipe(
				Effect.as(true),
				Effect.catchTag("Unauthorized", () => Effect.succeed(false)),
			);
		}).pipe(Effect.withSpan("PageAuth.isPageAllowed")),
	);
