/**
 * Spotify Web API client for playlists and playback control.
 *
 * @module
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import {
	HttpClient,
	HttpClientRequest,
	type HttpClientResponse,
} from "effect/http";
import {
	NoActiveDevice,
	NowPlaying,
	PlaybackState,
	Playlist,
	type PlayRequest,
	PremiumRequired,
	type RepeatMode,
	SpotifyApiError,
	SpotifyDevice,
	SpotifyDevicesResponse,
	SpotifyErrorBody,
	SpotifyPlaybackResponse,
	SpotifyPlaylistsPage,
	SpotifyProfile,
} from "@/shared/domain/Spotify";
import { SpotifyAuth } from "./SpotifyAuth";

/**
 * Spotify Web API base URL.
 *
 * @since 2.0.0
 * @category Config
 */
export const SPOTIFY_API_URL = "https://api.spotify.com/v1";

/**
 * Upper bound on playlist pages fetched (50 per page).
 *
 * @since 2.1.0
 * @category Config
 */
export const MAX_PLAYLIST_PAGES = 20;

const decodeErrorBody = Schema.decodeUnknownOption(
	Schema.fromJsonString(SpotifyErrorBody),
);

/**
 * Spotify Web API calls authorized with the current token.
 *
 * Failures are classified: `NoActiveDevice` when Spotify has nowhere to play,
 * `PremiumRequired` for free accounts, otherwise `SpotifyApiError`.
 *
 * @since 0.0.1
 * @category Services
 */
export class SpotifyClient extends Context.Service<SpotifyClient>()(
	"spotify-pomodoro/client/SpotifyClient",
	{
		make: Effect.gen(function* () {
			const auth = yield* SpotifyAuth;
			const http = yield* HttpClient.HttpClient;

			const classify = Effect.fn("SpotifyClient.classify")(function* (
				response: HttpClientResponse.HttpClientResponse,
			) {
				const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
				const body = decodeErrorBody(text);
				const reason = Option.flatMap(body, (b) =>
					Option.fromUndefinedOr(b.error.reason),
				);
				const message = Option.match(body, {
					onNone: () => text || `HTTP ${response.status}`,
					onSome: (b) => b.error.message ?? `HTTP ${response.status}`,
				});
				if (
					Option.contains(reason, "NO_ACTIVE_DEVICE") ||
					(response.status === 404 && message.includes("No active device"))
				) {
					return yield* new NoActiveDevice({ message });
				}
				if (Option.contains(reason, "PREMIUM_REQUIRED")) {
					return yield* new PremiumRequired({ message });
				}
				return yield* new SpotifyApiError({ status: response.status, message });
			});

			const send = Effect.fn("SpotifyClient.send")(function* (
				request: HttpClientRequest.HttpClientRequest,
			) {
				const accessToken = yield* auth.accessToken;
				const response = yield* http
					.execute(HttpClientRequest.bearerToken(request, accessToken))
					.pipe(
						Effect.mapError(
							(error) =>
								new SpotifyApiError({ status: 0, message: error.message }),
						),
					);
				if (response.status >= 400) return yield* classify(response);
				return response;
			});

			const decode = <S extends Schema.Top>(schema: S) =>
				Effect.fn(function* (response: HttpClientResponse.HttpClientResponse) {
					const json = yield* response.json.pipe(
						Effect.mapError(
							(error) =>
								new SpotifyApiError({
									status: response.status,
									message: error.message,
								}),
						),
					);
					return yield* Schema.decodeUnknownEffect(schema)(json).pipe(
						Effect.mapError(
							(error) =>
								new SpotifyApiError({
									status: response.status,
									message: error.message,
								}),
						),
					);
				});

			const profile = send(HttpClientRequest.get(`${SPOTIFY_API_URL}/me`)).pipe(
				Effect.flatMap(decode(SpotifyProfile)),
				Effect.withSpan("SpotifyClient.profile"),
			);

			const playlistPage = (url: string) =>
				send(HttpClientRequest.get(url)).pipe(
					Effect.flatMap(decode(SpotifyPlaylistsPage)),
				);

			const playlists = Effect.gen(function* () {
				const all: Array<Playlist> = [];
				let url: string | null | undefined =
					`${SPOTIFY_API_URL}/me/playlists?limit=50`;
				for (let page = 0; url && page < MAX_PLAYLIST_PAGES; page++) {
					const body: typeof SpotifyPlaylistsPage.Type =
						yield* playlistPage(url);
					for (const item of body.items) {
						if (item === null) continue;
						all.push(
							new Playlist({
								id: item.id,
								name: item.name,
								uri: item.uri,
								imageUrl: item.images?.[0]?.url ?? null,
							}),
						);
					}
					url = body.next;
				}
				return all;
			}).pipe(Effect.withSpan("SpotifyClient.playlists"));

			const playbackState = send(
				HttpClientRequest.get(`${SPOTIFY_API_URL}/me/player`),
			).pipe(
				Effect.flatMap((response) =>
					response.status === 204
						? Effect.succeedNone
						: decode(SpotifyPlaybackResponse)(response).pipe(
								Effect.map((body) =>
									Option.some(
										new PlaybackState({
											isPlaying: body.is_playing,
											deviceId: body.device?.id ?? null,
											deviceName: body.device?.name ?? null,
											contextUri: body.context?.uri ?? null,
											volumePercent: body.device?.volume_percent ?? null,
											track: body.item
												? new NowPlaying({
														title: body.item.name,
														artist:
															body.item.artists
																?.map((a) => a.name)
																.join(", ") ||
															body.item.show?.name ||
															null,
														imageUrl:
															body.item.album?.images?.[0]?.url ??
															body.item.show?.images?.[0]?.url ??
															null,
													})
												: null,
										}),
									),
								),
							),
				),
				Effect.withSpan("SpotifyClient.playbackState"),
			);

			const play = Effect.fn("SpotifyClient.play")(function* (
				request: PlayRequest,
			) {
				yield* send(
					HttpClientRequest.put(`${SPOTIFY_API_URL}/me/player/play`).pipe(
						request.deviceId
							? HttpClientRequest.setUrlParam("device_id", request.deviceId)
							: (r) => r,
						HttpClientRequest.bodyJsonUnsafe({
							context_uri: request.contextUri,
						}),
					),
				);
			});

			const devices = send(
				HttpClientRequest.get(`${SPOTIFY_API_URL}/me/player/devices`),
			).pipe(
				Effect.flatMap(decode(SpotifyDevicesResponse)),
				Effect.map((body) =>
					body.devices.flatMap((device) =>
						device.id === null || device.is_restricted
							? []
							: [
									new SpotifyDevice({
										id: device.id,
										name: device.name,
										type: device.type,
										isActive: device.is_active,
									}),
								],
					),
				),
				Effect.withSpan("SpotifyClient.devices"),
			);

			const command = (
				name: string,
				path: string,
				params: Record<string, string>,
			) =>
				send(
					HttpClientRequest.put(`${SPOTIFY_API_URL}/me/player/${path}`).pipe(
						HttpClientRequest.setUrlParams(params),
					),
				).pipe(Effect.asVoid, Effect.withSpan(`SpotifyClient.${name}`));

			return {
				profile,
				playlists,
				playbackState,
				devices,
				play,
				pause: command("pause", "pause", {}),
				setShuffle: (state: boolean) =>
					command("setShuffle", "shuffle", { state: String(state) }),
				setRepeat: (state: RepeatMode) =>
					command("setRepeat", "repeat", { state }),
				resume: send(
					HttpClientRequest.put(`${SPOTIFY_API_URL}/me/player/play`),
				).pipe(Effect.asVoid, Effect.withSpan("SpotifyClient.resume")),
				setVolume: (percent: number) =>
					command("setVolume", "volume", {
						volume_percent: String(
							Math.round(Math.min(100, Math.max(0, percent))),
						),
					}),
				next: send(
					HttpClientRequest.post(`${SPOTIFY_API_URL}/me/player/next`),
				).pipe(Effect.asVoid, Effect.withSpan("SpotifyClient.next")),
				previous: send(
					HttpClientRequest.post(`${SPOTIFY_API_URL}/me/player/previous`),
				).pipe(Effect.asVoid, Effect.withSpan("SpotifyClient.previous")),
				transfer: (deviceId: string, startPlaying: boolean) =>
					send(
						HttpClientRequest.put(`${SPOTIFY_API_URL}/me/player`).pipe(
							HttpClientRequest.bodyJsonUnsafe({
								device_ids: [deviceId],
								play: startPlaying,
							}),
						),
					).pipe(Effect.asVoid, Effect.withSpan("SpotifyClient.transfer")),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
