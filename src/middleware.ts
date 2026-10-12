/**
 * Adds security headers to every response, and redirects unauthenticated
 * page requests to the login page when `AUTH_ENABLED=true`. API routes
 * enforce auth themselves.
 *
 * @module
 */
import { defineMiddleware } from "astro:middleware";
import { isPageAllowed } from "@/server/PageAuth";
import { withSecurityHeaders } from "@/server/SecurityHeaders";
import { AUTH_COOKIE } from "@/shared/domain/Auth";

/**
 * @since 1.1.0
 * @category Middleware
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname, search } = context.url;
	const allowed = await isPageAllowed(
		pathname,
		context.cookies.get(AUTH_COOKIE)?.value,
	);
	const response = allowed
		? await next()
		: context.redirect(
				`/login?return=${encodeURIComponent(pathname + search)}`,
			);
	return withSecurityHeaders(context.request, response);
});
