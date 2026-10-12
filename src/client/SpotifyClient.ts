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
	PlaybackState,
	Playlist,
	type PlayRequest,
	PremiumRequired,
	type RepeatMode,
	SpotifyApiError,
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

			const playlists = send(
				HttpClientRequest.get(`${SPOTIFY_API_URL}/me/playlists`).pipe(
					HttpClientRequest.setUrlParam("limit", "50"),
				),
			).pipe(
				Effect.flatMap(decode(SpotifyPlaylistsPage)),
				Effect.map((page) =>
					page.items.flatMap((item) =>
						item === null
							? []
							: [
									new Playlist({
										id: item.id,
										name: item.name,
										uri: item.uri,
										imageUrl: item.images?.[0]?.url ?? null,
									}),
								],
					),
				),
				Effect.withSpan("SpotifyClient.playlists"),
			);

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
				play,
				pause: command("pause", "pause", {}),
				setShuffle: (state: boolean) =>
					command("setShuffle", "shuffle", { state: String(state) }),
				setRepeat: (state: RepeatMode) =>
					command("setRepeat", "repeat", { state }),
				transfer: (deviceId: string) =>
					send(
						HttpClientRequest.put(`${SPOTIFY_API_URL}/me/player`).pipe(
							HttpClientRequest.bodyJsonUnsafe({ device_ids: [deviceId] }),
						),
					).pipe(Effect.asVoid, Effect.withSpan("SpotifyClient.transfer")),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
