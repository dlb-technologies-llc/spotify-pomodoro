/**
 * Password login and the session cookie.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { AUTH_COOKIE } from "@/shared/domain/Auth";
import { authEnv, send, startServer } from "../support/server";

const login = (
	handler: (request: Request) => Promise<Response>,
	password: string,
	username = "admin",
) =>
	send(handler, "/api/auth/login", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ username, password }),
	});

const sessionCookie = (response: Response) =>
	response.headers
		.getSetCookie()
		.find((cookie) => cookie.startsWith(`${AUTH_COOKIE}=`));

describe("auth disabled", () => {
	it.effect("leaves the API open and refuses logins", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const stats = yield* send(handler, "/api/stats");
			assert.strictEqual(stats.status, 200);
			const response = yield* login(handler, "anything");
			assert.strictEqual(response.status, 400);
		}),
	);
});

describe("auth enabled", () => {
	it.effect("requires a session for protected endpoints", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({ env: authEnv });
			for (const { path, method } of [
				{ path: "/api/stats", method: "GET" },
				{ path: "/api/pomodoros", method: "POST" },
				{ path: "/api/spotify/authorize", method: "GET" },
				{ path: "/api/telemetry/traces", method: "POST" },
			]) {
				const response = yield* send(handler, path, { method });
				assert.strictEqual(response.status, 401, path);
			}
			const health = yield* send(handler, "/api/health");
			assert.strictEqual(health.status, 200);
		}),
	);

	it.effect("rejects wrong credentials", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({ env: authEnv });
			const wrongPassword = yield* login(handler, "wrong");
			assert.strictEqual(wrongPassword.status, 401);
			assert.isUndefined(sessionCookie(wrongPassword));
			const wrongUser = yield* login(handler, authEnv.AUTH_PASSWORD, "root");
			assert.strictEqual(wrongUser.status, 401);
		}),
	);

	it.effect("issues an httpOnly cookie that unlocks the API", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({ env: authEnv });
			const response = yield* login(handler, authEnv.AUTH_PASSWORD);
			assert.strictEqual(response.status, 204);
			const cookie = sessionCookie(response);
			assert.isDefined(cookie);
			assert.match(cookie ?? "", /HttpOnly/i);
			assert.match(cookie ?? "", /SameSite=Lax/i);
			const token = (cookie ?? "").split(";")[0] ?? "";

			const stats = yield* send(handler, "/api/stats", {
				headers: { cookie: token },
			});
			assert.strictEqual(stats.status, 200);

			const [payload, signature] = token
				.slice(AUTH_COOKIE.length + 1)
				.split(".");
			const forged = `${AUTH_COOKIE}=${payload}.${signature?.replace(/^./, (c) => (c === "A" ? "B" : "A"))}`;
			const rejected = yield* send(handler, "/api/stats", {
				headers: { cookie: forged },
			});
			assert.strictEqual(rejected.status, 401);
		}),
	);

	it.effect("rejects an expired cookie", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({
				env: { ...authEnv, AUTH_COOKIE_MAX_AGE: "-1" },
			});
			const response = yield* login(handler, authEnv.AUTH_PASSWORD);
			const token = (sessionCookie(response) ?? "").split(";")[0] ?? "";
			const stats = yield* send(handler, "/api/stats", {
				headers: { cookie: token },
			});
			assert.strictEqual(stats.status, 401);
		}),
	);

	it.effect("logout expires the cookie", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({ env: authEnv });
			const response = yield* send(handler, "/api/auth/logout", {
				method: "POST",
			});
			assert.strictEqual(response.status, 204);
			assert.match(sessionCookie(response) ?? "", /Max-Age=0/i);
		}),
	);

	it.effect("refuses to start without a password or secret", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({ env: { AUTH_ENABLED: "true" } });
			const error = yield* Effect.flip(
				Effect.tryPromise(() => handler(new Request("http://x/api/health"))),
			);
			assert.match(String(error.cause), /AUTH_PASSWORD/);
		}),
	);
});
