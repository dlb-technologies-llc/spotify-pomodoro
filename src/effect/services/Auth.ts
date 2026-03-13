/**
 * Authentication service for stateless signed cookie auth.
 *
 * @module
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Effect, Layer, ServiceMap } from "effect";
import {
	AuthConfigError,
	InvalidAuthCookieError,
	InvalidCredentialsError,
} from "../errors/AuthError";

/**
 * Auth cookie payload structure.
 *
 * @since 1.1.0
 * @category Auth
 */
export interface AuthPayload {
	username: string;
	exp: number;
}

/**
 * Cookie name for auth token.
 *
 * @since 1.1.0
 * @category Auth
 */
export const COOKIE_NAME = "auth_token";

/**
 * Default cookie max age (7 days in seconds).
 *
 * @since 1.1.0
 * @category Auth
 */
const DEFAULT_MAX_AGE = 604800;

/**
 * Hardcoded username for simplicity.
 *
 * @since 1.1.0
 * @category Auth
 */
const AUTH_USERNAME = "admin";

/**
 * Authentication service for managing auth state.
 *
 * @since 1.1.0
 * @category Services
 */
export class Auth extends ServiceMap.Service<Auth>()("Auth", {
	make: Effect.gen(function* () {
		yield* Effect.logDebug("Auth service initializing");

		/**
		 * Check if auth is enabled via environment variable.
		 */
		const isEnabled = Effect.fn("Auth.isEnabled")(function* () {
			return yield* Effect.sync(() => process.env.AUTH_ENABLED === "true");
		});

		yield* Effect.logDebug("Auth service initialized");

		/**
		 * Get auth configuration from environment.
		 * Fails if auth is enabled but config is missing.
		 */
		const getConfig = Effect.fn("Auth.getConfig")(function* () {
			const enabled = yield* isEnabled();
			const password = process.env.AUTH_PASSWORD;
			const secret = process.env.AUTH_SECRET;
			const maxAge = Number(process.env.AUTH_COOKIE_MAX_AGE) || DEFAULT_MAX_AGE;

			if (enabled && (!password || !secret)) {
				return yield* Effect.fail(
					new AuthConfigError({
						message:
							"AUTH_ENABLED=true but AUTH_PASSWORD or AUTH_SECRET is missing",
					}),
				);
			}

			return { password, secret, maxAge, enabled };
		});

		/**
		 * Create a signed auth cookie value.
		 */
		const createCookie = Effect.fn("Auth.createCookie")(function* (
			username: string,
		) {
			yield* Effect.logDebug("Creating auth cookie").pipe(
				Effect.annotateLogs("username", username),
			);
			const config = yield* getConfig();
			const exp = Math.floor(Date.now() / 1000) + config.maxAge;

			const payload = JSON.stringify({ username, exp });
			const payloadB64 = Buffer.from(payload).toString("base64url");

			const signature = createHmac("sha256", config.secret as string)
				.update(payload)
				.digest("base64url");

			return `${payloadB64}.${signature}`;
		});

		/**
		 * Verify and decode an auth cookie.
		 * Returns the payload if valid, fails if invalid/expired.
		 */
		const verifyCookie = Effect.fn("Auth.verifyCookie")(function* (
			cookie: string,
		) {
			yield* Effect.logDebug("Verifying auth cookie");
			const config = yield* getConfig();
			const parts = cookie.split(".");

			if (parts.length !== 2) {
				return yield* Effect.fail(
					new InvalidAuthCookieError({ reason: "malformed" }),
				);
			}

			const [payloadB64, signature] = parts;

			if (!payloadB64 || !signature) {
				return yield* Effect.fail(
					new InvalidAuthCookieError({ reason: "malformed" }),
				);
			}

			let payload: string;
			try {
				payload = Buffer.from(payloadB64, "base64url").toString();
			} catch {
				return yield* Effect.fail(
					new InvalidAuthCookieError({ reason: "invalid encoding" }),
				);
			}

			const expectedSig = createHmac("sha256", config.secret as string)
				.update(payload)
				.digest("base64url");

			const sigBuffer = Buffer.from(signature);
			const expectedBuffer = Buffer.from(expectedSig);

			if (
				sigBuffer.length !== expectedBuffer.length ||
				!timingSafeEqual(sigBuffer, expectedBuffer)
			) {
				return yield* Effect.fail(
					new InvalidAuthCookieError({ reason: "invalid signature" }),
				);
			}

			let data: AuthPayload;
			try {
				data = JSON.parse(payload) as AuthPayload;
			} catch {
				return yield* Effect.fail(
					new InvalidAuthCookieError({ reason: "invalid payload" }),
				);
			}

			if (data.exp < Math.floor(Date.now() / 1000)) {
				return yield* Effect.fail(
					new InvalidAuthCookieError({ reason: "expired" }),
				);
			}

			return data;
		});

		/**
		 * Validate username and password against environment config.
		 * Uses timing-safe comparison to prevent timing attacks.
		 */
		const validateCredentials = Effect.fn("Auth.validateCredentials")(
			function* (username: string, password: string) {
				yield* Effect.logDebug("Validating credentials");
				const config = yield* getConfig();

				const userBuffer = Buffer.from(username);
				const expectedUserBuffer = Buffer.from(AUTH_USERNAME);
				const passBuffer = Buffer.from(password);
				const expectedPassBuffer = Buffer.from(config.password || "");

				const userMatch =
					userBuffer.length === expectedUserBuffer.length &&
					timingSafeEqual(userBuffer, expectedUserBuffer);
				const passMatch =
					passBuffer.length === expectedPassBuffer.length &&
					timingSafeEqual(passBuffer, expectedPassBuffer);

				if (!userMatch || !passMatch) {
					yield* Effect.logWarning("Invalid credentials attempt");
					return yield* Effect.fail(new InvalidCredentialsError({}));
				}

				yield* Effect.logInfo("Credentials validated successfully");
				return true;
			},
		);

		return {
			isEnabled,
			getConfig,
			createCookie,
			verifyCookie,
			validateCredentials,
		};
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}
