/**
 * Spotify OAuth endpoints.
 *
 * @module
 */
import { Effect } from "effect";
import {
	type Cookies,
	HttpServerRequest,
	HttpServerResponse,
} from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Api } from "@/shared/api/Api";
import { TOKEN_FRAGMENT } from "@/shared/domain/Spotify";
import { ServerConfig } from "../ServerConfig";
import { PKCE_COOKIE, SpotifyOAuth } from "../SpotifyOAuth";

/**
 * @since 2.0.0
 * @category Handlers
 */
export const SpotifyHandlers = HttpApiBuilder.group(
	Api,
	"spotify",
	Effect.fn(function* (handlers) {
		const oauth = yield* SpotifyOAuth;
		const { secureCookies } = yield* ServerConfig;
		const pkceCookie: Cookies.Cookie["options"] = {
			httpOnly: true,
			secure: secureCookies,
			sameSite: "lax",
			path: "/",
		};

		return handlers
			.handle(
				"authorize",
				Effect.fn(function* () {
					const challenge = yield* oauth.authorize;
					return yield* HttpServerResponse.redirect(
						challenge.authorizeUrl,
					).pipe(
						HttpServerResponse.setCookie(PKCE_COOKIE, challenge.cookieValue, {
							...pkceCookie,
							maxAge: "10 minutes",
						}),
						Effect.orDie,
					);
				}),
			)
			.handle(
				"callback",
				Effect.fn(function* ({ query }) {
					const request = yield* HttpServerRequest.HttpServerRequest;
					const location = query.error
						? `/?error=${encodeURIComponent(query.error)}`
						: yield* oauth
								.exchange({
									code: query.code,
									state: query.state,
									cookie: request.cookies[PKCE_COOKIE],
								})
								.pipe(
									Effect.map(
										(token) =>
											`/#${TOKEN_FRAGMENT}=${encodeURIComponent(JSON.stringify(token))}`,
									),
									Effect.catchTag("CallbackFailed", (failure) =>
										Effect.succeed(`/?error=${failure.reason}`),
									),
								);
					return yield* HttpServerResponse.redirect(location).pipe(
						HttpServerResponse.expireCookie(PKCE_COOKIE, pkceCookie),
						Effect.orDie,
					);
				}),
			)
			.handle("refresh", ({ payload }) => oauth.refresh(payload.refreshToken));
	}),
);
