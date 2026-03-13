/**
 * Auth service unit tests.
 *
 * @module
 */
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import {
	AuthConfigError,
	InvalidAuthCookieError,
	InvalidCredentialsError,
} from "@/effect/errors/AuthError";
import { Auth } from "@/effect/services/Auth";

describe("Auth Service", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.AUTH_ENABLED = "false";
		process.env.AUTH_PASSWORD = "";
		process.env.AUTH_SECRET = "";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	describe("isEnabled", () => {
		it.effect("returns false when AUTH_ENABLED is not set", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "";
				const auth = yield* Auth;
				const enabled = yield* auth.isEnabled();
				expect(enabled).toBe(false);
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("returns false when AUTH_ENABLED is 'false'", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "false";
				const auth = yield* Auth;
				const enabled = yield* auth.isEnabled();
				expect(enabled).toBe(false);
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("returns true when AUTH_ENABLED is 'true'", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				const auth = yield* Auth;
				const enabled = yield* auth.isEnabled();
				expect(enabled).toBe(true);
			}).pipe(Effect.provide(Auth.layer)),
		);
	});

	describe("getConfig", () => {
		it.effect("fails when auth enabled but password missing", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "";
				process.env.AUTH_SECRET = "testsecret12345678901234567890";
				const auth = yield* Auth;
				const result = yield* Effect.result(auth.getConfig());
				expect(Result.isFailure(result)).toBe(true);
				if (Result.isFailure(result)) {
					expect(result.failure).toBeInstanceOf(AuthConfigError);
				}
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("fails when auth enabled but secret missing", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "testpass";
				process.env.AUTH_SECRET = "";
				const auth = yield* Auth;
				const result = yield* Effect.result(auth.getConfig());
				expect(Result.isFailure(result)).toBe(true);
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("succeeds when auth enabled with valid config", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "testpass";
				process.env.AUTH_SECRET = "testsecret12345678901234567890";
				const auth = yield* Auth;
				const config = yield* auth.getConfig();
				expect(config.password).toBe("testpass");
				expect(config.enabled).toBe(true);
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("succeeds when auth disabled regardless of config", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "false";
				process.env.AUTH_PASSWORD = "";
				process.env.AUTH_SECRET = "";
				const auth = yield* Auth;
				const config = yield* auth.getConfig();
				expect(config.enabled).toBe(false);
			}).pipe(Effect.provide(Auth.layer)),
		);
	});

	describe("validateCredentials", () => {
		it.effect("succeeds with correct credentials", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "correctpassword";
				process.env.AUTH_SECRET = "testsecret12345678901234567890";
				const auth = yield* Auth;
				const result = yield* auth.validateCredentials(
					"admin",
					"correctpassword",
				);
				expect(result).toBe(true);
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("fails with wrong username", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "correctpassword";
				process.env.AUTH_SECRET = "testsecret12345678901234567890";
				const auth = yield* Auth;
				const result = yield* Effect.result(
					auth.validateCredentials("wronguser", "correctpassword"),
				);
				expect(Result.isFailure(result)).toBe(true);
				if (Result.isFailure(result)) {
					expect(result.failure).toBeInstanceOf(InvalidCredentialsError);
				}
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("fails with wrong password", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "correctpassword";
				process.env.AUTH_SECRET = "testsecret12345678901234567890";
				const auth = yield* Auth;
				const result = yield* Effect.result(
					auth.validateCredentials("admin", "wrongpassword"),
				);
				expect(Result.isFailure(result)).toBe(true);
				if (Result.isFailure(result)) {
					expect(result.failure).toBeInstanceOf(InvalidCredentialsError);
				}
			}).pipe(Effect.provide(Auth.layer)),
		);
	});

	describe("createCookie and verifyCookie", () => {
		it.effect("creates a valid cookie that can be verified", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "testpass";
				process.env.AUTH_SECRET = "testsecret12345678901234567890";
				const auth = yield* Auth;
				const cookie = yield* auth.createCookie("admin");
				const payload = yield* auth.verifyCookie(cookie);
				expect(payload.username).toBe("admin");
				expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("fails to verify tampered cookie", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "testpass";
				process.env.AUTH_SECRET = "testsecret12345678901234567890";
				const auth = yield* Auth;
				const cookie = yield* auth.createCookie("admin");
				const tamperedCookie = `${cookie}tampered`;
				const result = yield* Effect.result(auth.verifyCookie(tamperedCookie));
				expect(Result.isFailure(result)).toBe(true);
				if (Result.isFailure(result)) {
					expect(result.failure).toBeInstanceOf(InvalidAuthCookieError);
				}
			}).pipe(Effect.provide(Auth.layer)),
		);

		it.effect("fails to verify malformed cookie", () =>
			Effect.gen(function* () {
				process.env.AUTH_ENABLED = "true";
				process.env.AUTH_PASSWORD = "testpass";
				process.env.AUTH_SECRET = "testsecret12345678901234567890";
				const auth = yield* Auth;
				const result = yield* Effect.result(auth.verifyCookie("not-a-cookie"));
				expect(Result.isFailure(result)).toBe(true);
			}).pipe(Effect.provide(Auth.layer)),
		);
	});
});
