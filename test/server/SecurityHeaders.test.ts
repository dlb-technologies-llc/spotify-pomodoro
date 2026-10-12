/**
 * Security headers and the Content-Security-Policy rewrite.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import {
	contentSecurityPolicy,
	STYLE_SRC,
	withSecurityHeaders,
} from "@/server/SecurityHeaders";

describe("contentSecurityPolicy", () => {
	it("replaces style-src and forbids framing, keeping the rest", () => {
		const policy = contentSecurityPolicy(
			"default-src 'self'; script-src 'self' 'sha256-abc'; style-src 'self' 'sha256-def'; frame-ancestors *;",
		);
		assert.strictEqual(
			policy,
			`default-src 'self'; script-src 'self' 'sha256-abc'; ${STYLE_SRC}; frame-ancestors 'none'`,
		);
	});

	it("still forbids framing without an Astro policy", () => {
		assert.strictEqual(
			contentSecurityPolicy(null),
			`${STYLE_SRC}; frame-ancestors 'none'`,
		);
	});
});

describe("withSecurityHeaders", () => {
	it("adds the headers and keeps status and body", async () => {
		const response = withSecurityHeaders(
			new Request("http://pomodoro.test/"),
			new Response("hello", { status: 418 }),
		);
		assert.strictEqual(response.status, 418);
		assert.strictEqual(await response.text(), "hello");
		assert.strictEqual(response.headers.get("x-frame-options"), "DENY");
		assert.strictEqual(
			response.headers.get("x-robots-tag"),
			"noindex, nofollow",
		);
		assert.strictEqual(
			response.headers.get("x-content-type-options"),
			"nosniff",
		);
		assert.isNull(response.headers.get("strict-transport-security"));
		assert.strictEqual(
			response.headers.get("content-security-policy"),
			contentSecurityPolicy(null),
		);
	});

	it("sends HSTS over HTTPS and behind an HTTPS proxy", () => {
		for (const request of [
			new Request("https://pomodoro.test/"),
			new Request("http://pomodoro.test/", {
				headers: { "x-forwarded-proto": "https" },
			}),
		]) {
			const response = withSecurityHeaders(request, new Response(null));
			assert.match(
				response.headers.get("strict-transport-security") ?? "",
				/max-age=31536000/,
			);
		}
	});
});
