/**
 * Spotify OAuth authentication service.
 *
 * @module
 */

import { Effect, Layer, Option, Ref, ServiceMap } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { SpotifyAuthError } from "../errors/SpotifyError";
import { SpotifyToken } from "../schema/SpotifyToken";

const SPOTIFY_CLIENT_ID = import.meta.env.PUBLIC_SPOTIFY_CLIENT_ID;

/**
 * Spotify authentication service.
 *
 * Handles token management and session persistence.
 * PKCE flow is handled server-side via /api/auth/init and /callback endpoints.
 *
 * @since 0.0.1
 * @category Services
 */
export class SpotifyAuth extends ServiceMap.Service<SpotifyAuth>()(
	"SpotifyAuth",
	{
		make: Effect.gen(function* () {
			yield* Effect.logDebug("SpotifyAuth initializing");
			const httpClient = yield* HttpClient.HttpClient;
			const tokenRef = yield* Ref.make<Option.Option<SpotifyToken>>(
				Option.none(),
			);
			yield* Effect.logDebug("SpotifyAuth initialized");

			const getToken = Effect.fn("SpotifyAuth.getToken")(function* () {
				yield* Effect.logDebug("Getting Spotify token");
				const maybeToken = yield* Ref.get(tokenRef);
				return yield* Option.match(maybeToken, {
					onNone: () =>
						Effect.fail(
							new SpotifyAuthError({
								reason: "NotAuthenticated",
								message: "No token available",
							}),
						),
					onSome: (token) => {
						if (token.isExpired) {
							return refreshToken();
						}
						return Effect.succeed(token);
					},
				});
			});

			const refreshToken = Effect.fn("SpotifyAuth.refreshToken")(function* () {
				yield* Effect.logInfo("Refreshing Spotify token");
				const maybeToken = yield* Ref.get(tokenRef);
				const currentToken = yield* Option.match(maybeToken, {
					onNone: () =>
						Effect.fail(
							new SpotifyAuthError({
								reason: "NotAuthenticated",
								message: "No token to refresh",
							}),
						),
					onSome: Effect.succeed,
				});

				const request = HttpClientRequest.post(
					"https://accounts.spotify.com/api/token",
				).pipe(
					HttpClientRequest.setHeader(
						"Content-Type",
						"application/x-www-form-urlencoded",
					),
					HttpClientRequest.bodyUrlParams({
						grant_type: "refresh_token",
						refresh_token: currentToken.refreshToken,
						client_id: SPOTIFY_CLIENT_ID,
					}),
				);

				const response = yield* httpClient.execute(request).pipe(
					Effect.flatMap((res) => res.json),
					Effect.mapError(
						() =>
							new SpotifyAuthError({
								reason: "TokenRefreshFailed",
								message: "Failed to refresh token",
							}),
					),
				);

				const tokenData = response as {
					access_token: string;
					refresh_token?: string;
					expires_in: number;
					scope: string;
				};

				const newToken = new SpotifyToken({
					accessToken: tokenData.access_token,
					refreshToken: tokenData.refresh_token ?? currentToken.refreshToken,
					expiresAt: Date.now() + tokenData.expires_in * 1000,
					scope: tokenData.scope,
				});

				yield* Ref.set(tokenRef, Option.some(newToken));
				yield* Effect.sync(() => {
					localStorage.setItem("spotify_token", JSON.stringify(newToken));
				});

				yield* Effect.logInfo("Spotify token refreshed successfully");
				return newToken;
			});

			const restoreToken = Effect.fn("SpotifyAuth.restoreToken")(function* () {
				yield* Effect.logDebug("Restoring Spotify token from storage");
				const stored = yield* Effect.sync(() =>
					localStorage.getItem("spotify_token"),
				);
				if (stored) {
					const parsed = JSON.parse(stored);
					const token = new SpotifyToken(parsed);
					yield* Ref.set(tokenRef, Option.some(token));
					yield* Effect.logInfo("Spotify token restored from storage");
					return Option.some(token);
				}
				yield* Effect.logDebug("No stored Spotify token found");
				return Option.none();
			});

			const logout = Effect.fn("SpotifyAuth.logout")(function* () {
				yield* Effect.logInfo("Logging out of Spotify");
				yield* Ref.set(tokenRef, Option.none());
				yield* Effect.sync(() => localStorage.removeItem("spotify_token"));
			});

			return {
				getToken,
				refreshToken,
				restoreToken,
				logout,
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
