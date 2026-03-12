/**
 * Spotify Web API client for playback control and playlist access.
 *
 * @module
 */

import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect } from "effect";
import { PremiumRequiredError, SpotifyApiError } from "../errors/SpotifyError";
import {
	PlaybackState,
	Playlist,
	PlaylistOwner,
	SpotifyImage,
} from "../schema/Playlist";
import { SpotifyAuth } from "./SpotifyAuth";
import { WebPlaybackSdk } from "./WebPlaybackSdk";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/**
 * Spotify API client service.
 *
 * Provides methods to control playback and fetch user playlists.
 *
 * @since 0.0.1
 * @category Services
 */
export class SpotifyClient extends Effect.Service<SpotifyClient>()(
	"SpotifyClient",
	{
		effect: Effect.gen(function* () {
			yield* Effect.logDebug("SpotifyClient initializing");
			const httpClient = (yield* HttpClient.HttpClient).pipe(
				HttpClient.withTracerPropagation(false),
			);
			const auth = yield* SpotifyAuth;
			const sdk = yield* WebPlaybackSdk;
			yield* Effect.logDebug("SpotifyClient initialized");

			const authorizedFetch = <A, E = SpotifyApiError>(
				makeRequest: (
					token: string,
				) => Effect.Effect<A, E | SpotifyApiError, never>,
			) =>
				Effect.gen(function* () {
					const token = yield* auth.getToken.pipe(
						Effect.mapError(
							(e) =>
								new SpotifyApiError({
									status: 401,
									message: e.message,
								}),
						),
					);
					return yield* makeRequest(token.accessToken);
				});

			const getPlaylists = authorizedFetch((accessToken) =>
				Effect.gen(function* () {
					yield* Effect.logDebug("Fetching playlists");
					const request = HttpClientRequest.get(
						`${SPOTIFY_API_BASE}/me/playlists`,
					).pipe(
						HttpClientRequest.setHeader(
							"Authorization",
							`Bearer ${accessToken}`,
						),
						HttpClientRequest.setUrlParams({ limit: "50" }),
					);

					const response = yield* httpClient.execute(request).pipe(
						Effect.flatMap((res) => res.json),
						Effect.mapError(
							() =>
								new SpotifyApiError({
									status: 500,
									message: "Failed to fetch playlists",
								}),
						),
					);

					const data = response as {
						items: Array<{
							id: string;
							name: string;
							description: string | null;
							images: Array<{
								url: string;
								height: number | null;
								width: number | null;
							}>;
							owner: { id: string; display_name: string | null };
							tracks: { total: number };
							uri: string;
						}>;
					};

					yield* Effect.logDebug("Playlists fetched").pipe(
						Effect.annotateLogs("count", String(data.items.length)),
					);

					return data.items.map(
						(item) =>
							new Playlist({
								id: item.id,
								name: item.name,
								description: item.description,
								images: item.images.map(
									(img) =>
										new SpotifyImage({
											url: img.url,
											height: img.height,
											width: img.width,
										}),
								),
								owner: new PlaylistOwner({
									id: item.owner.id,
									displayName: item.owner.display_name,
								}),
								tracksTotal: item.tracks.total,
								uri: item.uri,
							}),
					);
				}),
			).pipe(Effect.withLogSpan("SpotifyClient.getPlaylists"));

			const getPlaybackState = authorizedFetch((accessToken) =>
				Effect.gen(function* () {
					yield* Effect.logDebug("Fetching playback state");
					const request = HttpClientRequest.get(
						`${SPOTIFY_API_BASE}/me/player`,
					).pipe(
						HttpClientRequest.setHeader(
							"Authorization",
							`Bearer ${accessToken}`,
						),
					);

					const res = yield* httpClient.execute(request).pipe(
						Effect.mapError(
							() =>
								new SpotifyApiError({
									status: 500,
									message: "Failed to fetch playback state",
								}),
						),
					);

					if (res.status === 204) {
						yield* Effect.logDebug("No active playback device");
						return null;
					}

					const response = yield* res.json.pipe(
						Effect.mapError(
							() =>
								new SpotifyApiError({
									status: 500,
									message: "Failed to parse playback state",
								}),
						),
					);

					const data = response as {
						is_playing: boolean;
						progress_ms: number | null;
						device?: { id: string };
						context?: { uri: string };
					};

					yield* Effect.logDebug("Playback state fetched").pipe(
						Effect.annotateLogs("isPlaying", String(data.is_playing)),
					);

					return new PlaybackState({
						isPlaying: data.is_playing,
						progressMs: data.progress_ms,
						deviceId: data.device?.id ?? null,
						contextUri: data.context?.uri ?? null,
					});
				}),
			).pipe(Effect.withLogSpan("SpotifyClient.getPlaybackState"));

			const play = (options?: {
				contextUri?: string;
				uris?: string[];
				deviceId?: string;
			}) =>
				authorizedFetch((accessToken) =>
					Effect.gen(function* () {
						yield* Effect.logInfo("Starting playback").pipe(
							Effect.annotateLogs({
								hasContext: String(!!options?.contextUri),
								hasUris: String(!!options?.uris),
							}),
						);
						const body = options?.contextUri
							? { context_uri: options.contextUri }
							: options?.uris
								? { uris: options.uris }
								: {};

						const url = options?.deviceId
							? `${SPOTIFY_API_BASE}/me/player/play?device_id=${options.deviceId}`
							: `${SPOTIFY_API_BASE}/me/player/play`;

						const request = HttpClientRequest.put(url).pipe(
							HttpClientRequest.setHeader(
								"Authorization",
								`Bearer ${accessToken}`,
							),
							HttpClientRequest.bodyUnsafeJson(body),
						);

						const res = yield* httpClient.execute(request).pipe(
							Effect.mapError(
								() =>
									new SpotifyApiError({
										status: 500,
										message: "Failed to start playback",
									}),
							),
						);

						if (res.status >= 200 && res.status <= 204) {
							return;
						}

						const responseText = yield* res.text.pipe(
							Effect.mapError(
								() =>
									new SpotifyApiError({
										status: res.status,
										message: "Failed to read response body",
									}),
							),
						);

						if (
							res.status === 404 &&
							(responseText.includes("NO_ACTIVE_DEVICE") ||
								responseText.includes("No active device"))
						) {
							yield* Effect.logInfo(
								"No active device detected, attempting SDK fallback",
							);

							const sdkDeviceId = yield* sdk.ensureDevice;

							yield* Effect.logInfo("SDK device ready, retrying playback").pipe(
								Effect.annotateLogs("sdkDeviceId", sdkDeviceId),
							);

							const retryUrl = `${SPOTIFY_API_BASE}/me/player/play?device_id=${sdkDeviceId}`;
							const retryRequest = HttpClientRequest.put(retryUrl).pipe(
								HttpClientRequest.setHeader(
									"Authorization",
									`Bearer ${accessToken}`,
								),
								HttpClientRequest.bodyUnsafeJson(body),
							);

							yield* httpClient.execute(retryRequest).pipe(
								Effect.mapError(
									() =>
										new SpotifyApiError({
											status: 500,
											message: "Failed to start playback after SDK fallback",
										}),
								),
							);

							return;
						}

						if (
							res.status === 403 &&
							responseText.includes("PREMIUM_REQUIRED")
						) {
							yield* Effect.fail(
								new PremiumRequiredError({
									message: "Spotify Premium is required for playback control",
								}),
							);
						}

						yield* Effect.fail(
							new SpotifyApiError({
								status: res.status,
								message: `Playback request failed: ${responseText}`,
							}),
						);
					}),
				).pipe(Effect.withLogSpan("SpotifyClient.play"));

			const pause = authorizedFetch((accessToken) =>
				Effect.gen(function* () {
					yield* Effect.logInfo("Pausing playback");
					const request = HttpClientRequest.put(
						`${SPOTIFY_API_BASE}/me/player/pause`,
					).pipe(
						HttpClientRequest.setHeader(
							"Authorization",
							`Bearer ${accessToken}`,
						),
					);

					yield* httpClient.execute(request).pipe(
						Effect.mapError(
							() =>
								new SpotifyApiError({
									status: 500,
									message: "Failed to pause playback",
								}),
						),
					);
				}),
			).pipe(Effect.withLogSpan("SpotifyClient.pause"));

			const setShuffle = (state: boolean) =>
				authorizedFetch((accessToken) =>
					Effect.gen(function* () {
						yield* Effect.logDebug("Setting shuffle mode").pipe(
							Effect.annotateLogs("shuffle", String(state)),
						);
						const request = HttpClientRequest.put(
							`${SPOTIFY_API_BASE}/me/player/shuffle`,
						).pipe(
							HttpClientRequest.setHeader(
								"Authorization",
								`Bearer ${accessToken}`,
							),
							HttpClientRequest.setUrlParams({ state: String(state) }),
						);

						yield* httpClient.execute(request).pipe(
							Effect.mapError(
								() =>
									new SpotifyApiError({
										status: 500,
										message: "Failed to set shuffle mode",
									}),
							),
						);
					}),
				).pipe(Effect.withLogSpan("SpotifyClient.setShuffle"));

			const setRepeat = (state: "off" | "context" | "track") =>
				authorizedFetch((accessToken) =>
					Effect.gen(function* () {
						yield* Effect.logDebug("Setting repeat mode").pipe(
							Effect.annotateLogs("repeat", state),
						);
						const request = HttpClientRequest.put(
							`${SPOTIFY_API_BASE}/me/player/repeat`,
						).pipe(
							HttpClientRequest.setHeader(
								"Authorization",
								`Bearer ${accessToken}`,
							),
							HttpClientRequest.setUrlParams({ state }),
						);

						yield* httpClient.execute(request).pipe(
							Effect.mapError(
								() =>
									new SpotifyApiError({
										status: 500,
										message: "Failed to set repeat mode",
									}),
							),
						);
					}),
				).pipe(Effect.withLogSpan("SpotifyClient.setRepeat"));

			return {
				getPlaylists,
				getPlaybackState,
				play,
				pause,
				setShuffle,
				setRepeat,
			};
		}),
		accessors: true,
	},
) {}
