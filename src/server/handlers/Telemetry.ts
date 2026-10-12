/**
 * Browser trace relay.
 *
 * @module
 */
import { Effect, Option } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Api } from "@/shared/api/Api";
import { ServerConfig } from "../ServerConfig";

/**
 * Forwards browser spans to `OTEL_COLLECTOR_URL` without waiting, and drops
 * them when no collector is configured.
 *
 * @since 2.0.0
 * @category Handlers
 */
export const TelemetryHandlers = HttpApiBuilder.group(
	Api,
	"telemetry",
	Effect.fn(function* (handlers) {
		const { otelCollectorUrl } = yield* ServerConfig;
		const client = yield* HttpClient.HttpClient;
		return handlers.handle("traces", ({ payload }) =>
			Option.match(otelCollectorUrl, {
				onNone: () => Effect.void,
				onSome: (url) =>
					HttpClientRequest.post(`${url}/v1/traces`).pipe(
						HttpClientRequest.bodyJsonUnsafe(payload),
						client.execute,
						Effect.ignore,
						Effect.forkDetach,
						Effect.asVoid,
					),
			}),
		);
	}),
);
