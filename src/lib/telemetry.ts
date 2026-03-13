/**
 * Browser-side telemetry layer using OtlpTracer.
 *
 * @module
 */

import { Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { OtlpSerialization, OtlpTracer } from "effect/unstable/observability";

if (typeof globalThis.crypto?.randomUUID !== "function") {
	globalThis.crypto = globalThis.crypto || ({} as Crypto);
	globalThis.crypto.randomUUID = () => {
		const b = crypto.getRandomValues(new Uint8Array(16));
		b[6] = (b[6] & 0x0f) | 0x40;
		b[8] = (b[8] & 0x3f) | 0x80;
		const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
		return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as ReturnType<
			Crypto["randomUUID"]
		>;
	};
}

/**
 * Frontend telemetry layer for browser span export.
 *
 * @since 1.5.0
 * @category Layers
 */
export const FrontendTelemetryLayer = OtlpTracer.layer({
	url: "/api/telemetry/traces",
	resource: {
		serviceName: "spotify-pomodoro-frontend",
		serviceVersion: "1.5.0",
		attributes: {
			"deployment.environment": import.meta.env.DEV
				? "development"
				: "production",
		},
	},
	exportInterval: "10 seconds",
}).pipe(
	Layer.provide(OtlpSerialization.layerJson),
	Layer.provide(FetchHttpClient.layer),
);

/**
 * Combined frontend layer with OTLP tracing and HTTP client.
 *
 * @since 1.5.0
 * @category Layers
 */
export const FrontendLayer = Layer.provideMerge(
	FetchHttpClient.layer,
	FrontendTelemetryLayer,
);

/**
 * Shared managed runtime for non-atom browser usage.
 *
 * @since 1.5.0
 * @category Runtime
 */
export const frontendRuntime = ManagedRuntime.make(FrontendLayer);

/**
 * Empty telemetry layer for tests.
 *
 * @since 1.5.0
 * @category Layers
 */
export const FrontendTelemetryTest = Layer.empty;
