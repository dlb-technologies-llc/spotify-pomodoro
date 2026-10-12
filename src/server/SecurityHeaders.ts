/**
 * Security headers added to every response.
 *
 * @module
 */

/**
 * Headers for every response besides the CSP, which starts from the policy
 * Astro generates with script hashes.
 *
 * @since 2.1.0
 * @category Security
 */
export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
	["X-Frame-Options", "DENY"],
	["X-Robots-Tag", "noindex, nofollow"],
	["X-Content-Type-Options", "nosniff"],
	["Referrer-Policy", "strict-origin-when-cross-origin"],
	["Cross-Origin-Opener-Policy", "same-origin"],
	[
		"Permissions-Policy",
		"camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
	],
];

/**
 * Styles may be inline: the dialog scroll lock injects a `<style>` whose
 * contents depend on the scrollbar width, so it cannot be hashed. Scripts
 * stay restricted to Astro's hashes and the listed origins.
 *
 * @since 2.1.0
 * @category Security
 */
export const STYLE_SRC =
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com";

/**
 * Astro's policy with `style-src` replaced by {@link STYLE_SRC} and
 * framing forbidden.
 *
 * @since 2.1.0
 * @category Security
 */
export const contentSecurityPolicy = (astroPolicy: string | null) =>
	[
		...(astroPolicy ?? "")
			.split(";")
			.map((directive) => directive.trim())
			.filter(
				(directive) =>
					directive !== "" &&
					!/^(style-src|frame-ancestors)(\s|$)/.test(directive),
			),
		STYLE_SRC,
		"frame-ancestors 'none'",
	].join("; ");

/**
 * Strict-Transport-Security for responses served over HTTPS, including
 * behind a proxy that sets `X-Forwarded-Proto`.
 *
 * @since 2.1.0
 * @category Security
 */
export const isHttps = (request: Request) =>
	new URL(request.url).protocol === "https:" ||
	request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";

/**
 * Copies a response with the security headers set.
 *
 * @since 2.1.0
 * @category Security
 */
export const withSecurityHeaders = (request: Request, response: Response) => {
	const headers = new Headers(response.headers);
	for (const [name, value] of SECURITY_HEADERS) {
		if (!headers.has(name)) headers.set(name, value);
	}
	headers.set(
		"Content-Security-Policy",
		contentSecurityPolicy(headers.get("Content-Security-Policy")),
	);
	if (isHttps(request)) {
		headers.set(
			"Strict-Transport-Security",
			"max-age=31536000; includeSubDomains",
		);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};
