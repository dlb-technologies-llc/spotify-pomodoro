/**
 * Password login and the session cookie.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { ApiClient } from "@/client/ApiClient";
import { AUTH_COOKIE, PEER_HEADER, UserName } from "@/shared/domain/Auth";
import { PomodoroLabel, Seconds } from "@/shared/domain/Session";
import { distinct, sample } from "../support/arbitrary";
import { apiClientFor, authEnv, send, startServer } from "../support/server";

const login = (
	handler: (request: Request) => Promise<Response>,
	password: string,
	username = "admin",
	headers: Record<string, string> = {},
) =>
	send(handler, "/api/auth/login", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify({ username, password }),
	});

const tokenOf = (response: Response) =>
	(sessionCookie(response) ?? "").split(";")[0] ?? "";

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

describe("login lockout", () => {
	const env = { ...authEnv, AUTH_MAX_ATTEMPTS: "3" };
	const from = (peer: string) => ({ [PEER_HEADER]: peer });

	it.effect("locks a client out after repeated failures", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({ env });
			const [attacker, other] = yield* distinct(UserName, 2, (name) => name);
			for (let i = 0; i < 3; i++) {
				const response = yield* login(
					handler,
					"wrong",
					"admin",
					from(attacker),
				);
				assert.strictEqual(response.status, 401);
			}
			const locked = yield* login(
				handler,
				authEnv.AUTH_PASSWORD,
				"admin",
				from(attacker),
			);
			assert.strictEqual(locked.status, 429);
			const body = yield* Effect.promise(() => locked.json());
			assert.strictEqual(body._tag, "TooManyAttempts");
			assert.isAbove(body.retryAfterSeconds, 0);
			assert.isUndefined(sessionCookie(locked));

			const elsewhere = yield* login(
				handler,
				authEnv.AUTH_PASSWORD,
				"admin",
				from(other),
			);
			assert.strictEqual(elsewhere.status, 204);
		}),
	);

	it.effect("a successful login clears earlier failures", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({ env });
			for (const password of [
				"wrong",
				"wrong",
				authEnv.AUTH_PASSWORD,
				"wrong",
				"wrong",
			]) {
				yield* login(handler, password);
			}
			const response = yield* login(handler, authEnv.AUTH_PASSWORD);
			assert.strictEqual(response.status, 204);
		}),
	);

	it.live("lets the client try again after the lockout", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({
				env: { ...env, AUTH_MAX_ATTEMPTS: "1", AUTH_LOCKOUT_SECONDS: "1" },
			});
			yield* login(handler, "wrong");
			const locked = yield* login(handler, authEnv.AUTH_PASSWORD);
			assert.strictEqual(locked.status, 429);
			yield* Effect.sleep("1100 millis");
			const response = yield* login(handler, authEnv.AUTH_PASSWORD);
			assert.strictEqual(response.status, 204);
		}),
	);

	it.effect("uses X-Forwarded-For only behind a trusted proxy", () =>
		Effect.gen(function* () {
			const [first, second] = yield* distinct(UserName, 2, (name) => name);
			const forwarded = (address: string) => ({ "x-forwarded-for": address });

			const direct = yield* startServer({ env });
			for (let i = 0; i < 3; i++) {
				yield* login(direct, "wrong", "admin", forwarded(first));
			}
			const spoofed = yield* login(
				direct,
				authEnv.AUTH_PASSWORD,
				"admin",
				forwarded(second),
			);
			assert.strictEqual(spoofed.status, 429);

			const proxied = yield* startServer({
				env: { ...env, TRUST_PROXY: "true" },
			});
			for (let i = 0; i < 3; i++) {
				yield* login(proxied, "wrong", "admin", forwarded(first));
			}
			const other = yield* login(
				proxied,
				authEnv.AUTH_PASSWORD,
				"admin",
				forwarded(`${second}, ${first}`),
			);
			assert.strictEqual(other.status, 204);
		}),
	);
});

describe("multiple users", () => {
	const usersEnv = (users: ReadonlyArray<string>) => ({
		AUTH_ENABLED: "true",
		AUTH_SECRET: authEnv.AUTH_SECRET,
		AUTH_USERS: users.join(","),
	});

	it.effect("each user only sees their own data", () =>
		Effect.gen(function* () {
			const [alice, bob, alicePassword, bobPassword] = yield* distinct(
				UserName,
				4,
				(name) => name,
			);
			const handler = yield* startServer({
				env: usersEnv([
					`${alice}:${alicePassword}`,
					`${bob}:${bobPassword}:with-colon`,
				]),
			});
			const asAlice = yield* login(handler, alicePassword, alice);
			assert.strictEqual(asAlice.status, 204);
			const asBob = yield* login(handler, `${bobPassword}:with-colon`, bob);
			assert.strictEqual(asBob.status, 204);
			const wrongPair = yield* login(handler, alicePassword, bob);
			assert.strictEqual(wrongPair.status, 401);

			const aliceApi = yield* Effect.provide(
				ApiClient,
				apiClientFor(handler, { cookie: tokenOf(asAlice) }),
			);
			const bobApi = yield* Effect.provide(
				ApiClient,
				apiClientFor(handler, { cookie: tokenOf(asBob) }),
			);

			const seconds = yield* sample(Seconds);
			const label = yield* sample(PomodoroLabel);
			const pomodoro = yield* aliceApi.sessions.createPomodoro({ query: {} });
			const focus = yield* aliceApi.sessions.startFocus({
				payload: { pomodoroId: pomodoro.id, configuredSeconds: seconds },
			});

			const bobStats = yield* bobApi.sessions.stats({ query: {} });
			assert.strictEqual(bobStats.totalPomodoros, 0);
			const bobHistory = yield* bobApi.data.history({ query: {} });
			assert.strictEqual(bobHistory.items.length, 0);
			const bobExport = yield* bobApi.data.exportJson();
			assert.strictEqual(bobExport.pomodoros.length, 0);

			const tagOf = <E extends { readonly _tag: string }>(
				attempt: Effect.Effect<unknown, E>,
			) => Effect.map(Effect.flip(attempt), (error) => error._tag);
			const rejected = yield* Effect.all([
				tagOf(
					bobApi.sessions.completePomodoro({
						params: { id: pomodoro.id },
						query: {},
					}),
				),
				tagOf(bobApi.sessions.deletePomodoro({ params: { id: pomodoro.id } })),
				tagOf(
					bobApi.sessions.labelPomodoro({
						params: { id: pomodoro.id },
						payload: { label },
					}),
				),
				tagOf(
					bobApi.sessions.startBreak({
						payload: { pomodoroId: pomodoro.id, configuredSeconds: seconds },
					}),
				),
				tagOf(
					bobApi.sessions.completeFocus({
						params: { id: focus.id },
						payload: { elapsedSeconds: seconds },
					}),
				),
			]);
			assert.deepStrictEqual(rejected, [
				"PomodoroNotFound",
				"PomodoroNotFound",
				"PomodoroNotFound",
				"PomodoroNotFound",
				"FocusSessionNotFound",
			]);

			const aliceStats = yield* aliceApi.sessions.stats({ query: {} });
			assert.strictEqual(aliceStats.totalPomodoros, 1);
			const aliceHistory = yield* aliceApi.data.history({ query: {} });
			assert.deepStrictEqual(
				aliceHistory.items.map((item) => item.id),
				[pomodoro.id],
			);
			const done = yield* aliceApi.sessions.completeFocus({
				params: { id: focus.id },
				payload: { elapsedSeconds: seconds },
			});
			assert.isTrue(Option.isSome(done.completedAt));
		}),
	);

	it.effect("importing another user's export copies nothing over theirs", () =>
		Effect.gen(function* () {
			const [alice, bob, password] = yield* distinct(UserName, 3, (n) => n);
			const handler = yield* startServer({
				env: usersEnv([`${alice}:${password}`, `${bob}:${password}`]),
			});
			const apiFor = (user: string) =>
				Effect.gen(function* () {
					const response = yield* login(handler, password, user);
					return yield* Effect.provide(
						ApiClient,
						apiClientFor(handler, { cookie: tokenOf(response) }),
					);
				});
			const aliceApi = yield* apiFor(alice);
			const bobApi = yield* apiFor(bob);
			yield* aliceApi.sessions.createPomodoro({ query: {} });
			const file = yield* aliceApi.data.exportJson();
			const result = yield* bobApi.data.import({ payload: file });
			assert.strictEqual(result.pomodoros, 0);
			assert.strictEqual(result.skipped, 1);
			const bobStats = yield* bobApi.sessions.stats({ query: {} });
			assert.strictEqual(bobStats.totalPomodoros, 0);
		}),
	);

	it.effect("rejects cookies of users no longer configured", () =>
		Effect.gen(function* () {
			const [alice, bob, password] = yield* distinct(UserName, 3, (n) => n);
			const before = yield* startServer({
				env: usersEnv([`${alice}:${password}`, `${bob}:${password}`]),
			});
			const response = yield* login(before, password, alice);
			const after = yield* startServer({
				env: usersEnv([`${bob}:${password}`]),
			});
			const stats = yield* send(after, "/api/stats", {
				headers: { cookie: tokenOf(response) },
			});
			assert.strictEqual(stats.status, 401);
		}),
	);

	it.effect("refuses to start with a malformed AUTH_USERS", () =>
		Effect.gen(function* () {
			const handler = yield* startServer({
				env: usersEnv(["no-password-here"]),
			});
			const error = yield* Effect.flip(
				Effect.tryPromise(() => handler(new Request("http://x/api/health"))),
			);
			assert.match(String(error.cause), /AUTH_USERS|AUTH_PASSWORD/);
		}),
	);
});
