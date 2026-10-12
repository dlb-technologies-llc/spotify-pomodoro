/**
 * The API server, as a layer and as a Fetch-style web handler.
 *
 * @module
 */
import { Layer } from "effect";
import { FetchHttpClient, HttpServer } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Api } from "@/shared/api/Api";
import { loggingLayer } from "@/shared/Logging";
import { Auth } from "./Auth";
import { DatabaseLive } from "./Database";
import { Backup, BackupScheduleLive } from "./Backup";
import { AuthHandlers } from "./handlers/Auth";
import { BackupHandlers } from "./handlers/Backups";
import { DataHandlers } from "./handlers/Data";
import { AuthorizationLive } from "./handlers/Authorization";
import { SessionsHandlers } from "./handlers/Sessions";
import { SpotifyHandlers } from "./handlers/Spotify";
import { SystemHandlers } from "./handlers/System";
import { TelemetryHandlers } from "./handlers/Telemetry";
import { EnvConfigProvider, ServerConfig } from "./ServerConfig";
import { LoginLimiter } from "./LoginLimiter";
import { MaintenanceLive } from "./Maintenance";
import { SessionRepository } from "./SessionRepository";
import { SpotifyOAuth } from "./SpotifyOAuth";
import { TelemetryLive } from "./Telemetry";

/**
 * API routes, still requiring the services the handlers use.
 *
 * @since 2.0.0
 * @category Layers
 */
export const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
	Layer.provide([
		SystemHandlers,
		AuthHandlers,
		SpotifyHandlers,
		SessionsHandlers,
		DataHandlers,
		BackupHandlers,
		TelemetryHandlers,
	]),
	Layer.provide(AuthorizationLive),
);

/**
 * Services the handlers use. Requires the database, an `HttpClient`, and a
 * `ConfigProvider`.
 *
 * @since 2.0.0
 * @category Layers
 */
export const ApiServices = Layer.mergeAll(
	SessionRepository.layer,
	SpotifyOAuth.layer,
	Auth.layer,
	LoginLimiter.layer,
	Backup.layer,
).pipe(Layer.provideMerge(ServerConfig.layer));

/**
 * The API with its services, given a database, `HttpClient`, and
 * `ConfigProvider`.
 *
 * @since 2.0.0
 * @category Layers
 */
export const ApiApp = Layer.merge(ApiRoutes, MaintenanceLive).pipe(
	Layer.provide(ApiServices),
);

/**
 * The complete production server, including scheduled backups.
 *
 * @since 2.0.0
 * @category Layers
 */
export const ServerLive = Layer.mergeAll(
	ApiRoutes,
	MaintenanceLive,
	BackupScheduleLive,
).pipe(
	Layer.provide(ApiServices),
	Layer.provide(DatabaseLive),
	Layer.provide(FetchHttpClient.layer),
	Layer.provideMerge(TelemetryLive),
	Layer.provide(ServerConfig.layer),
	Layer.provideMerge(
		loggingLayer({
			level: process.env.LOG_LEVEL ?? import.meta.env.PUBLIC_LOG_LEVEL,
			format: process.env.LOG_FORMAT ?? import.meta.env.PUBLIC_LOG_FORMAT,
		}),
	),
	Layer.provide(EnvConfigProvider),
	Layer.provide(HttpServer.layerServices),
);
