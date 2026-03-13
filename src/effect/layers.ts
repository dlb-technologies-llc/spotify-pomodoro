/**
 * Effect layer composition for application services.
 *
 * @module
 */

import { Layer } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { FrontendTelemetryLayer } from "@/lib/telemetry";
import { LoggingLayer } from "./logging";
import { AudioNotification } from "./services/AudioNotification";
import { SessionRepository } from "./services/SessionRepository";
import { SpotifyAuth } from "./services/SpotifyAuth";
import { SpotifyClient } from "./services/SpotifyClient";
import { TelemetryLive } from "./services/Telemetry";
import { Timer } from "./services/Timer";
import { WebPlaybackSdk } from "./services/WebPlaybackSdk";

/**
 * Disables trace propagation headers (b3, traceparent) on outgoing HTTP
 * requests. Spotify's CORS policy rejects the b3 header in preflight,
 * so browser-side Spotify API calls fail when telemetry is active.
 *
 * @since 1.5.0
 * @category Layers
 */
const NoTracePropagation = Layer.succeed(HttpClient.TracerPropagationEnabled)(
	false,
);

const SpotifyAuthLive = SpotifyAuth.layer.pipe(
	Layer.provide(FetchHttpClient.layer),
);

const WebPlaybackSdkLive = WebPlaybackSdk.layer.pipe(
	Layer.provide(SpotifyAuthLive),
);

const SpotifyClientLive = SpotifyClient.layer.pipe(
	Layer.provide(SpotifyAuthLive),
	Layer.provide(WebPlaybackSdkLive),
	Layer.provide(FetchHttpClient.layer),
);

/**
 * Main application layer with all services.
 *
 * @since 0.0.1
 * @category Layers
 */
export const MainLayer = Layer.mergeAll(
	SpotifyAuthLive,
	SpotifyClientLive,
	WebPlaybackSdkLive,
	Timer.layer,
	AudioNotification.layer,
	LoggingLayer,
	FrontendTelemetryLayer,
	NoTracePropagation,
);

/**
 * Context type for the main layer.
 *
 * @since 0.0.1
 * @category Layers
 */
export type MainContext = Layer.Success<typeof MainLayer>;

/**
 * Server-side layer for API routes.
 *
 * Includes SessionRepository and logging configuration.
 *
 * @since 1.4.0
 * @category Layers
 */
export const ServerLayer = Layer.mergeAll(
	SessionRepository.layer,
	LoggingLayer,
	TelemetryLive,
);

/**
 * Context type for the server layer.
 *
 * @since 1.4.0
 * @category Layers
 */
export type ServerContext = Layer.Success<typeof ServerLayer>;
