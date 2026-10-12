/**
 * Login and logout endpoints.
 *
 * @module
 */
import { Effect } from "effect";
import type { Cookies } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Api, sessionCookie } from "@/shared/api/Api";
import { Auth } from "../Auth";
import { ServerConfig } from "../ServerConfig";

/**
 * @since 2.0.0
 * @category Handlers
 */
export const AuthHandlers = HttpApiBuilder.group(
	Api,
	"auth",
	Effect.fn(function* (handlers) {
		const auth = yield* Auth;
		const { secureCookies } = yield* ServerConfig;
		const cookieOptions: Cookies.Cookie["options"] = {
			secure: secureCookies,
			sameSite: "lax",
			path: "/",
		};

		return handlers
			.handle(
				"login",
				Effect.fn(function* ({ payload }) {
					const session = yield* auth.login(payload);
					yield* HttpApiBuilder.securitySetCookie(
						sessionCookie,
						session.token,
						{
							...cookieOptions,
							maxAge: `${session.maxAgeSeconds} seconds`,
						},
					);
				}),
			)
			.handle("logout", () =>
				HttpApiBuilder.securitySetCookie(sessionCookie, "", {
					...cookieOptions,
					maxAge: 0,
					expires: new Date(0),
				}),
			);
	}),
);
