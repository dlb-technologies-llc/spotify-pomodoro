/**
 * Spotify authorization code flow with PKCE, run on the server.
 *
 * The browser's `crypto.subtle` needs a secure context, so PKCE is generated
 * here instead. That keeps plain-HTTP `127.0.0.1` development working while
 * production uses HTTPS.
 *
 * @module
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import {
	HttpBody,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "effect/http";
import {
	SPOTIFY_SCOPES,
	SpotifyNotConnected,
	SpotifyToken,
	SpotifyTokenResponse,
} from "@/shared/domain/Spotify";
import { ServerConfig } from "./ServerConfig";

/**
 * Spotify Accounts service base URL.
 *
 * @since 2.0.0
 * @category Config
 */
export const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com";

/**
 * Cookie carrying the PKCE state and verifier between authorize and callback.
 *
 * @since 2.0.0
 * @category Config
 */
export const PKCE_COOKIE = "spotify_pkce";

/**
 * PKCE values for one authorization attempt.
 *
 * @since 2.0.0
 * @category Models
 */
export class PkceChallenge extends Schema.Class<PkceChallenge>("PkceChallenge")(
	{
		state: Schema.String,
		verifier: Schema.String,
		authorizeUrl: Schema.String,
	},
) {
	/**
	 * Cookie value binding the callback to this attempt.
	 *
	 * @since 2.0.0
	 */
	get cookieValue(): string {
		return `${this.state}.${this.verifier}`;
	}
}

/**
 * Why a callback could not produce a token.
 *
 * @since 2.0.0
 * @category Errors
 */
export class CallbackFailed extends Schema.TaggedError<CallbackFailed>()(
	"CallbackFailed",
	{
		reason: Schema.Literals([
			"missing_code_or_state",
			"session_expired",
			"state_mismatch",
			"token_exchange_failed",
		]),
	},
) {}

/**
 * Spotify OAuth: authorize URL, code exchange, and token refresh.
 *
 * @since 1.0.0
 * @category Services
 */
export class SpotifyOAuth extends Context.Service<SpotifyOAuth>()(
	"spotify-pomodoro/server/SpotifyOAuth",
	{
		make: Effect.gen(function* () {
			const config = yield* ServerConfig;
			const client = (yield* HttpClient.HttpClient).pipe(
				HttpClient.filterStatusOk,
			);

			const requestToken = Effect.fn("SpotifyOAuth.requestToken")(function* (
				params: Record<string, string>,
				fallbackRefreshToken: string,
			) {
				const response = yield* client.execute(
					HttpClientRequest.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`).pipe(
						HttpClientRequest.setBody(
							HttpBody.urlParams({
								...params,
								client_id: config.spotifyClientId,
							}),
						),
					),
				);
				const body =
					yield* HttpClientResponse.schemaBodyJson(SpotifyTokenResponse)(
						response,
					);
				const now = yield* Clock.currentTimeMillis;
				return new SpotifyToken({
					accessToken: body.access_token,
					refreshToken: body.refresh_token ?? fallbackRefreshToken,
					expiresAt: now + body.expires_in * 1000,
					scope: body.scope,
				});
			});

			const authorize = Effect.sync(() => {
				const verifier = randomBytes(32).toString("base64url");
				const state = randomUUID();
				const params = new URLSearchParams({
					client_id: config.spotifyClientId,
					response_type: "code",
					redirect_uri: config.spotifyRedirectUri,
					scope: SPOTIFY_SCOPES.join(" "),
					state,
					code_challenge_method: "S256",
					code_challenge: createHash("sha256")
						.update(verifier)
						.digest("base64url"),
				});
				return new PkceChallenge({
					state,
					verifier,
					authorizeUrl: `${SPOTIFY_ACCOUNTS_URL}/authorize?${params}`,
				});
			}).pipe(Effect.withSpan("SpotifyOAuth.authorize"));

			const exchange = Effect.fn("SpotifyOAuth.exchange")(function* (input: {
				readonly code: string | undefined;
				readonly state: string | undefined;
				readonly cookie: string | undefined;
			}) {
				if (!input.code || !input.state) {
					return yield* new CallbackFailed({ reason: "missing_code_or_state" });
				}
				const [state, verifier] = (input.cookie ?? "").split(".");
				if (!state || !verifier) {
					return yield* new CallbackFailed({ reason: "session_expired" });
				}
				if (state !== input.state) {
					return yield* new CallbackFailed({ reason: "state_mismatch" });
				}
				return yield* requestToken(
					{
						grant_type: "authorization_code",
						code: input.code,
						redirect_uri: config.spotifyRedirectUri,
						code_verifier: verifier,
					},
					"",
				).pipe(
					Effect.tapCause(Effect.logError),
					Effect.mapError(
						() => new CallbackFailed({ reason: "token_exchange_failed" }),
					),
				);
			});

			const refresh = Effect.fn("SpotifyOAuth.refresh")(function* (
				refreshToken: string,
			) {
				return yield* requestToken(
					{ grant_type: "refresh_token", refresh_token: refreshToken },
					refreshToken,
				).pipe(
					Effect.tapCause(Effect.logWarning),
					Effect.mapError(
						() =>
							new SpotifyNotConnected({
								message: "Spotify rejected the refresh token",
							}),
					),
				);
			});

			return { authorize, exchange, refresh };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
