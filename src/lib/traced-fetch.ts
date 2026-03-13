/**
 * Traced fetch utilities with W3C trace propagation.
 *
 * @module
 */

import { Effect } from "effect";
import { HttpTraceContext } from "effect/unstable/http";

import { frontendRuntime } from "@/lib/telemetry";

/**
 * Performs a fetch request wrapped in an Effect span with W3C trace propagation headers.
 * The span captures http.method, http.url, and http.status_code attributes.
 * Falls back to plain fetch if telemetry fails.
 *
 * @since 1.5.0
 * @category Fetch
 */
export async function tracedFetch(
	spanName: string,
	url: string,
	init?: RequestInit,
): Promise<Response> {
	try {
		return await frontendRuntime.runPromise(
			Effect.gen(function* () {
				const span = yield* Effect.currentSpan;
				const traceHeaders = HttpTraceContext.toHeaders(span);

				const mergedHeaders: Record<string, string> = {
					...Object.fromEntries(new Headers(init?.headers).entries()),
				};
				for (const key in traceHeaders) {
					if (key !== "__proto__" && typeof traceHeaders[key] === "string") {
						mergedHeaders[key] = traceHeaders[key];
					}
				}

				const response = yield* Effect.tryPromise(() =>
					globalThis.fetch(url, { ...init, headers: mergedHeaders }),
				);

				yield* Effect.annotateCurrentSpan({
					"http.method": init?.method ?? "GET",
					"http.url": url,
					"http.status_code": response.status,
				});

				return response;
			}).pipe(Effect.withSpan(spanName)),
		);
	} catch {
		return globalThis.fetch(url, init);
	}
}

/**
 * Generates W3C trace propagation headers (traceparent, tracestate) for use
 * with streaming or long-lived requests where wrapping the full fetch in a
 * span would be misleading.
 * Falls back to empty headers if telemetry fails.
 *
 * @since 1.5.0
 * @category Fetch
 */
export async function tracedHeaders(): Promise<Record<string, string>> {
	try {
		return await frontendRuntime.runPromise(
			Effect.gen(function* () {
				const span = yield* Effect.currentSpan;
				const headers = HttpTraceContext.toHeaders(span);
				const result: Record<string, string> = {};
				for (const key in headers) {
					if (key !== "__proto__" && typeof headers[key] === "string") {
						result[key] = headers[key];
					}
				}
				return result;
			}).pipe(Effect.withSpan("tracedHeaders")),
		);
	} catch {
		return {};
	}
}
