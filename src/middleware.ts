/**
 * Redirects unauthenticated page requests to the login page when
 * `AUTH_ENABLED=true`. API routes enforce auth themselves.
 *
 * @module
 */
import { defineMiddleware } from "astro:middleware";
import { isPageAllowed } from "@/server/PageAuth";
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
	if (allowed) return next();
	return context.redirect(
		`/login?return=${encodeURIComponent(pathname + search)}`,
	);
});
