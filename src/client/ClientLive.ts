/**
 * The browser application layer.
 *
 * @module
 */
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { Layer } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { loggingLayer } from "@/shared/Logging";
import { ApiClient } from "./ApiClient";
import { AudioNotification } from "./AudioNotification";
import { Playback } from "./Playback";
import { Notifier } from "./Notifier";
import { Pomodoro } from "./Pomodoro";
import { ScreenWake } from "./ScreenWake";
import { SessionRecorder } from "./SessionRecorder";
import { SettingsStore } from "./SettingsStore";
import { SpotifyAuth } from "./SpotifyAuth";
import { SpotifyClient } from "./SpotifyClient";
import { StartupLive } from "./Startup";
import { BrowserTelemetry } from "./Telemetry";
import { Timer } from "./Timer";
import { WebPlaybackSdk } from "./WebPlaybackSdk";

/**
 * Spotify rejects trace propagation headers in CORS preflight, so outgoing
 * requests carry none.
 *
 * @since 1.5.0
 * @category Layers
 */
const NoTracePropagation = Layer.succeed(
	HttpClient.TracerPropagationEnabled,
	false,
);

const SpotifyLive = Playback.layer.pipe(
	Layer.provideMerge(WebPlaybackSdk.layer),
	Layer.provideMerge(SpotifyClient.layer),
	Layer.provideMerge(SpotifyAuth.layer),
);

const PomodoroLive = Pomodoro.layer.pipe(
	Layer.provideMerge(
		Layer.mergeAll(
			Timer.layer,
			SessionRecorder.layer,
			AudioNotification.layer,
			Notifier.layer,
			ScreenWake.layer,
		),
	),
	Layer.provideMerge(SettingsStore.layer),
);

/**
 * Every browser service, with startup handling applied.
 *
 * @since 2.0.0
 * @category Layers
 */
export const ClientLive = StartupLive.pipe(
	Layer.provideMerge(Layer.mergeAll(SpotifyLive, PomodoroLive)),
	Layer.provideMerge(ApiClient.layer),
	Layer.provide(BrowserKeyValueStore.layerLocalStorage),
	Layer.provide(FetchHttpClient.layer),
	Layer.provideMerge(NoTracePropagation),
	Layer.provideMerge(BrowserTelemetry),
	Layer.provideMerge(
		loggingLayer({
			level: import.meta.env.PUBLIC_LOG_LEVEL,
			format: import.meta.env.PUBLIC_LOG_FORMAT,
		}),
	),
);
