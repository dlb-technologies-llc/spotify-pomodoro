/**
 * OpenTelemetry observability via Effect Otlp.
 *
 * @module
 */

import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Otlp } from "effect/unstable/observability";
import pkg from "../../../package.json" with { type: "json" };

/**
 * Empty telemetry layer for tests.
 *
 * @since 2.0.0
 * @category Layers
 */
export const TelemetryTest = Layer.empty;

/**
 * Live telemetry layer using OTLP JSON protocol.
 *
 * @since 2.0.0
 * @category Layers
 */
export const TelemetryLive = Otlp.layerJson({
	baseUrl:
		import.meta.env.OTEL_COLLECTOR_URL ||
		process.env.OTEL_COLLECTOR_URL ||
		"http://localhost:4318",
	resource: {
		serviceName: "spotify-pomodoro",
		serviceVersion: pkg.version,
		attributes: {
			"deployment.environment": import.meta.env.DEV
				? "development"
				: "production",
		},
	},
}).pipe(Layer.provide(FetchHttpClient.layer));
