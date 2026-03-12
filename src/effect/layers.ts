/**
 * Effect layer composition for application services.
 *
 * @module
 */

import { FetchHttpClient } from "@effect/platform";
import { Layer } from "effect";
import { LoggingLayer } from "./logging";
import { AudioNotification } from "./services/AudioNotification";
import { SessionRepository } from "./services/SessionRepository";
import { SpotifyAuth } from "./services/SpotifyAuth";
import { SpotifyClient } from "./services/SpotifyClient";
import { Timer } from "./services/Timer";
import { WebPlaybackSdk } from "./services/WebPlaybackSdk";

const SpotifyAuthLive = SpotifyAuth.Default.pipe(
	Layer.provide(FetchHttpClient.layer),
);

const WebPlaybackSdkLive = WebPlaybackSdk.Default.pipe(
	Layer.provide(SpotifyAuthLive),
);

const SpotifyClientLive = SpotifyClient.Default.pipe(
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
	Timer.Default,
	AudioNotification.Default,
	LoggingLayer,
);

/**
 * Context type for the main layer.
 *
 * @since 0.0.1
 * @category Layers
 */
export type MainContext = Layer.Layer.Success<typeof MainLayer>;

/**
 * Server-side layer for API routes.
 *
 * Includes SessionRepository and logging configuration.
 *
 * @since 1.4.0
 * @category Layers
 */
export const ServerLayer = Layer.mergeAll(
	SessionRepository.Default,
	LoggingLayer,
);

/**
 * Context type for the server layer.
 *
 * @since 1.4.0
 * @category Layers
 */
export type ServerContext = Layer.Layer.Success<typeof ServerLayer>;
