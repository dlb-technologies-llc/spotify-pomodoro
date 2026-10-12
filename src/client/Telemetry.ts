/**
 * Browser tracing, exported through the server's trace relay.
 *
 * @module
 */
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { OtlpSerialization, OtlpTracer } from "effect/observability";
import pkg from "../../package.json" with { type: "json" };

/**
 * Exports browser spans to `/api/telemetry/traces` every 10 seconds.
 *
 * @since 1.5.0
 * @category Layers
 */
export const BrowserTelemetry = OtlpTracer.layer({
	url: "/api/telemetry/traces",
	resource: {
		serviceName: "spotify-pomodoro-frontend",
		serviceVersion: pkg.version,
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
