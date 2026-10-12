/**
 * Server tracing export over OTLP/JSON.
 *
 * @module
 */
import { Effect, Layer, Option } from "effect";
import { FetchHttpClient } from "effect/http";
import { Otlp } from "effect/observability";
import pkg from "../../package.json" with { type: "json" };
import { ServerConfig } from "./ServerConfig";

/**
 * Exports traces and logs to `OTEL_COLLECTOR_URL`, or does nothing when it is
 * unset.
 *
 * @since 2.0.0
 * @category Layers
 */
export const TelemetryLive = Layer.unwrap(
	Effect.gen(function* () {
		const { otelCollectorUrl } = yield* ServerConfig;
		return Option.match(otelCollectorUrl, {
			onNone: () => Layer.empty,
			onSome: (baseUrl) =>
				Otlp.layerJson({
					baseUrl,
					resource: {
						serviceName: "spotify-pomodoro-backend",
						serviceVersion: pkg.version,
						attributes: {
							"deployment.environment": import.meta.env.DEV
								? "development"
								: "production",
						},
					},
				}).pipe(Layer.provide(FetchHttpClient.layer)),
		});
	}),
);
