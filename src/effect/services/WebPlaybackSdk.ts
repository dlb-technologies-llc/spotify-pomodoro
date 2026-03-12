/**
 * Spotify Web Playback SDK lifecycle management service.
 *
 * @module
 */

import { Effect, Option, Ref } from "effect";
import {
	PremiumRequiredError,
	SdkUnavailableError,
} from "../errors/SpotifyError";
import { SdkDeviceState } from "../schema/WebPlaybackSdk";
import { SpotifyAuth } from "./SpotifyAuth";

/**
 * Internal state holding the player instance and device ID.
 *
 * @since 1.3.0
 * @category Models
 */
interface PlayerState {
	readonly player: SpotifyPlayer;
	readonly deviceId: string;
}

/**
 * Web Playback SDK service for managing the Spotify player lifecycle.
 *
 * Handles script loading, player initialization, device registration,
 * and cleanup. Browser-only — used from React hooks via `client:load`.
 *
 * @since 1.3.0
 * @category Services
 */
export class WebPlaybackSdk extends Effect.Service<WebPlaybackSdk>()(
	"WebPlaybackSdk",
	{
		effect: Effect.gen(function* () {
			yield* Effect.logDebug("WebPlaybackSdk initializing");
			const auth = yield* SpotifyAuth;
			const stateRef = yield* Ref.make<Option.Option<PlayerState>>(
				Option.none(),
			);

			const destroy = Effect.gen(function* () {
				const state = yield* Ref.get(stateRef);
				yield* Option.match(state, {
					onNone: () => Effect.void,
					onSome: ({ player }) =>
						Effect.gen(function* () {
							yield* Effect.logInfo("Destroying Web Playback SDK player");
							yield* Effect.sync(() => player.disconnect());
							yield* Ref.set(stateRef, Option.none());
						}),
				});
			}).pipe(Effect.withLogSpan("WebPlaybackSdk.destroy"));

			yield* Effect.addFinalizer(() => destroy);

			const initialize: Effect.Effect<
				void,
				SdkUnavailableError | PremiumRequiredError
			> = Effect.gen(function* () {
				const current = yield* Ref.get(stateRef);
				if (Option.isSome(current)) {
					yield* Effect.logDebug(
						"Web Playback SDK already initialized, skipping",
					);
					return;
				}

				yield* Effect.logInfo("Loading Spotify Web Playback SDK script");

				yield* Effect.async<void, SdkUnavailableError>((resume) => {
					if (window.Spotify) {
						resume(Effect.void);
						return;
					}

					window.onSpotifyWebPlaybackSDKReady = () => {
						resume(Effect.void);
					};

					const script = document.createElement("script");
					script.src = "https://sdk.scdn.co/spotify-player.js";
					script.async = true;
					script.onerror = () => {
						resume(
							Effect.fail(
								new SdkUnavailableError({
									reason: "ScriptLoadFailed",
									message: "Failed to load Spotify SDK script",
								}),
							),
						);
					};
					document.body.appendChild(script);
				});

				yield* Effect.logDebug("Spotify SDK script loaded, creating player");

				const player = new window.Spotify.Player({
					name: "Spotify Pomodoro",
					getOAuthToken: (cb) => {
						Effect.runPromise(
							auth.getToken.pipe(Effect.map((t) => t.accessToken)),
						)
							.then(cb)
							.catch(() => cb(""));
					},
					volume: 0.5,
				});

				const deviceId = yield* Effect.async<
					string,
					SdkUnavailableError | PremiumRequiredError
				>((resume) => {
					player.addListener("ready", ({ device_id }) =>
						resume(Effect.succeed(device_id)),
					);
					player.addListener("not_ready", () =>
						resume(
							Effect.fail(
								new SdkUnavailableError({
									reason: "Disconnected",
									message: "Player device became not ready",
								}),
							),
						),
					);
					player.addListener("initialization_error", ({ message }) =>
						resume(
							Effect.fail(
								new SdkUnavailableError({
									reason: "InitFailed",
									message,
								}),
							),
						),
					);
					player.addListener("authentication_error", ({ message }) =>
						resume(
							Effect.fail(
								new SdkUnavailableError({
									reason: "AuthFailed",
									message,
								}),
							),
						),
					);
					player.addListener("account_error", ({ message }) =>
						resume(Effect.fail(new PremiumRequiredError({ message }))),
					);
					player.connect();
				});

				yield* Effect.logInfo("Web Playback SDK player ready").pipe(
					Effect.annotateLogs("deviceId", deviceId),
				);

				yield* Ref.set(stateRef, Option.some({ player, deviceId }));

				yield* Effect.sleep("500 millis");
			}).pipe(Effect.withLogSpan("WebPlaybackSdk.initialize"));

			const ensureDevice: Effect.Effect<
				string,
				SdkUnavailableError | PremiumRequiredError
			> = Effect.gen(function* () {
				const current = yield* Ref.get(stateRef);
				if (Option.isSome(current)) {
					return current.value.deviceId;
				}

				yield* initialize;

				const updated = yield* Ref.get(stateRef);
				return yield* Option.match(updated, {
					onNone: () =>
						Effect.fail(
							new SdkUnavailableError({
								reason: "InitFailed",
								message: "Player state unavailable after initialization",
							}),
						),
					onSome: ({ deviceId }) => Effect.succeed(deviceId),
				});
			}).pipe(Effect.withLogSpan("WebPlaybackSdk.ensureDevice"));

			const getDeviceState: Effect.Effect<Option.Option<SdkDeviceState>> =
				Effect.gen(function* () {
					const state = yield* Ref.get(stateRef);
					return Option.map(
						state,
						({ deviceId }) =>
							new SdkDeviceState({
								deviceId,
								isReady: true,
								playerName: "Spotify Pomodoro",
							}),
					);
				}).pipe(Effect.withLogSpan("WebPlaybackSdk.getDeviceState"));

			yield* Effect.logDebug("WebPlaybackSdk initialized");

			return {
				initialize,
				ensureDevice,
				getDeviceState,
				destroy,
			};
		}),
		accessors: true,
	},
) {}
