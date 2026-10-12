/**
 * Spotify OAuth endpoints against a fake Spotify Accounts service.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { PKCE_COOKIE } from "@/server/SpotifyOAuth";
import {
	OAuthTokenString,
	SpotifyToken,
	TOKEN_FRAGMENT,
} from "@/shared/domain/Spotify";
import { sample } from "../support/arbitrary";
import { json } from "../support/http";
import { baseEnv, send, startServer } from "../support/server";

const TokenBody = Schema.Struct({
	access_token: OAuthTokenString,
	refresh_token: OAuthTokenString,
	expires_in: Schema.Int.check(
		Schema.isBetween({ minimum: 60, maximum: 7200 }),
	),
	scope: Schema.String,
});

const accounts =
	(
		reply: (form: URLSearchParams) => Response,
		seen: Array<URLSearchParams> = [],
	) =>
	async (request: Request) => {
		const url = new URL(request.url);
		if (
			url.origin !== "https://accounts.spotify.com" ||
			url.pathname !== "/api/token"
		) {
			return new Response("unexpected", { status: 599 });
		}
		const form = new URLSearchParams(await request.text());
		seen.push(form);
		return reply(form);
	};

const authorize = (handler: (request: Request) => Promise<Response>) =>
	Effect.gen(function* () {
		const response = yield* send(handler, "/api/spotify/authorize");
		const location = new URL(response.headers.get("location") ?? "");
		const cookie = response.headers
			.getSetCookie()
			.find((c) => c.startsWith(`${PKCE_COOKIE}=`));
		return { response, location, cookie: (cookie ?? "").split(";")[0] ?? "" };
	});

const tokenFromLocation = (location: string) =>
	Schema.decodeUnknownSync(Schema.fromJsonString(SpotifyToken))(
		new URLSearchParams(new URL(location, "http://x").hash.slice(1)).get(
			TOKEN_FRAGMENT,
		),
	);

describe("Spotify OAuth", () => {
	it.effect("authorize redirects to Spotify with a PKCE challenge", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const { response, location, cookie } = yield* authorize(handler);
			assert.strictEqual(response.status, 302);
			assert.strictEqual(
				location.origin + location.pathname,
				"https://accounts.spotify.com/authorize",
			);
			assert.strictEqual(
				location.searchParams.get("client_id"),
				baseEnv.PUBLIC_SPOTIFY_CLIENT_ID,
			);
			assert.strictEqual(
				location.searchParams.get("redirect_uri"),
				baseEnv.PUBLIC_SPOTIFY_REDIRECT_URI,
			);
			assert.strictEqual(
				location.searchParams.get("code_challenge_method"),
				"S256",
			);
			assert.match(location.searchParams.get("scope") ?? "", /streaming/);
			const state = location.searchParams.get("state");
			assert.isTrue(cookie.startsWith(`${PKCE_COOKIE}=${state}.`));
		}),
	);

	it.effect("callback exchanges the code and hands the token to the app", () =>
		Effect.gen(function* () {
			const body = yield* sample(TokenBody);
			const seen: Array<URLSearchParams> = [];
			const handler = yield* startServer({
				upstream: accounts(() => json(body), seen),
			});
			const { location, cookie } = yield* authorize(handler);
			const state = location.searchParams.get("state") ?? "";
			const response = yield* send(
				handler,
				`/callback?code=the-code&state=${state}`,
				{ headers: { cookie } },
			);
			assert.strictEqual(response.status, 302);
			const token = tokenFromLocation(response.headers.get("location") ?? "");
			assert.strictEqual(token.accessToken, body.access_token);
			assert.strictEqual(token.refreshToken, body.refresh_token);

			const form = seen[0];
			assert.strictEqual(form?.get("grant_type"), "authorization_code");
			assert.strictEqual(form?.get("code"), "the-code");
			assert.strictEqual(
				form?.get("client_id"),
				baseEnv.PUBLIC_SPOTIFY_CLIENT_ID,
			);
			assert.strictEqual(form?.get("code_verifier"), cookie.split(".")[1]);
			assert.match(
				response.headers.getSetCookie().join(";"),
				new RegExp(`${PKCE_COOKIE}=;`),
			);
		}),
	);

	it.effect("callback rejects a state mismatch or missing session", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({
				upstream: () => new Response("should not be called", { status: 599 }),
			});
			const { cookie } = yield* authorize(handler);
			const mismatch = yield* send(handler, "/callback?code=c&state=other", {
				headers: { cookie },
			});
			assert.strictEqual(
				mismatch.headers.get("location"),
				"/?error=state_mismatch",
			);
			const expired = yield* send(handler, "/callback?code=c&state=s");
			assert.strictEqual(
				expired.headers.get("location"),
				"/?error=session_expired",
			);
			const missing = yield* send(handler, "/callback");
			assert.strictEqual(
				missing.headers.get("location"),
				"/?error=missing_code_or_state",
			);
			const denied = yield* send(handler, "/callback?error=access_denied");
			assert.strictEqual(
				denied.headers.get("location"),
				"/?error=access_denied",
			);
		}),
	);

	it.effect("callback reports a failed exchange", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({
				upstream: accounts(() => json({ error: "invalid_grant" }, 400)),
			});
			const { location, cookie } = yield* authorize(handler);
			const response = yield* send(
				handler,
				`/callback?code=c&state=${location.searchParams.get("state")}`,
				{ headers: { cookie } },
			);
			assert.strictEqual(
				response.headers.get("location"),
				"/?error=token_exchange_failed",
			);
		}),
	);

	it.effect("refresh keeps the old refresh token when Spotify omits one", () =>
		Effect.gen(function* () {
			const body = yield* sample(TokenBody);
			const seen: Array<URLSearchParams> = [];
			const handler = yield* startServer({
				upstream: accounts(
					() =>
						json({
							access_token: body.access_token,
							expires_in: body.expires_in,
							scope: body.scope,
						}),
					seen,
				),
			});
			const response = yield* send(handler, "/api/spotify/refresh", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ refreshToken: body.refresh_token }),
			});
			assert.strictEqual(response.status, 200);
			const token = Schema.decodeUnknownSync(SpotifyToken)(
				yield* Effect.promise(() => response.json()),
			);
			assert.strictEqual(token.accessToken, body.access_token);
			assert.strictEqual(token.refreshToken, body.refresh_token);
			assert.strictEqual(seen[0]?.get("grant_type"), "refresh_token");
			assert.strictEqual(seen[0]?.get("refresh_token"), body.refresh_token);
		}),
	);

	it.effect("refresh failure means the user must reconnect", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({
				upstream: accounts(() => json({ error: "invalid_grant" }, 400)),
			});
			const response = yield* send(handler, "/api/spotify/refresh", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ refreshToken: "revoked" }),
			});
			assert.strictEqual(response.status, 401);
			const body = yield* Effect.promise(() => response.json());
			assert.strictEqual(body._tag, "SpotifyNotConnected");
		}),
	);
});

describe("telemetry relay", () => {
	it.effect("accepts traces and drops them without a collector", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const response = yield* send(handler, "/api/telemetry/traces", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ resourceSpans: [] }),
			});
			assert.strictEqual(response.status, 202);
		}),
	);

	it.live("forwards traces to the collector", () =>
		Effect.gen(function* () {
			const forwarded: Array<string> = [];
			const handler = yield* startServer({
				env: { OTEL_COLLECTOR_URL: "http://collector.test:4318" },
				upstream: async (request) => {
					forwarded.push(
						`${request.method} ${request.url} ${await request.text()}`,
					);
					return new Response(null, { status: 200 });
				},
			});
			yield* send(handler, "/api/telemetry/traces", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ resourceSpans: [{ scopeSpans: [] }] }),
			});
			yield* Effect.sleep("50 millis");
			assert.deepStrictEqual(forwarded, [
				'POST http://collector.test:4318/v1/traces {"resourceSpans":[{"scopeSpans":[]}]}',
			]);
		}),
	);
});
