/**
 * Telemetry proxy endpoint for forwarding browser OTEL spans to the collector.
 *
 * Accepts OTLP JSON trace payloads from the browser and forwards them
 * to the configured OpenTelemetry collector. Fire-and-forget semantics
 * ensure telemetry never blocks or breaks the application.
 *
 * @module
 */
import type { APIRoute } from "astro";

const COLLECTOR_URL =
	import.meta.env.OTEL_COLLECTOR_URL ||
	process.env.OTEL_COLLECTOR_URL ||
	"http://localhost:4318";

const MAX_PAYLOAD_SIZE = 512 * 1024;

/**
 * POST /api/telemetry/traces - Forward browser spans to OTEL collector.
 *
 * @since 1.5.0
 * @category API
 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const contentLength = request.headers.get("content-length");
		if (
			contentLength &&
			Number.parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE
		) {
			return new Response(JSON.stringify({ error: "Payload too large" }), {
				status: 413,
				headers: { "Content-Type": "application/json" },
			});
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return new Response(JSON.stringify({ error: "Invalid JSON" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (
			typeof body !== "object" ||
			body === null ||
			!("resourceSpans" in body)
		) {
			return new Response(JSON.stringify({ error: "Missing resourceSpans" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const collectorUrl = `${COLLECTOR_URL}/v1/traces`;

		/**
		 * Fire-and-forget: forward to collector without awaiting.
		 * Errors are silently ignored so telemetry never impacts the app.
		 */
		globalThis
			.fetch(collectorUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})
			.catch(() => {});

		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
};
