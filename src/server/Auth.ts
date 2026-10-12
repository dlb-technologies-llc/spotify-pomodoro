/**
 * Stateless password login using an HMAC-signed session cookie.
 *
 * @module
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
	Clock,
	Context,
	Effect,
	Layer,
	Option,
	Redacted,
	Schema,
} from "effect";
import {
	AUTH_USERNAME,
	AuthDisabled,
	AuthSession,
	InvalidCredentials,
	type LoginRequest,
	Unauthorized,
} from "@/shared/domain/Auth";
import { ServerConfig } from "./ServerConfig";

const SessionJson = Schema.fromJsonString(AuthSession);
const encodeSession = Schema.encodeEffect(SessionJson);
const decodeSession = Schema.decodeUnknownEffect(SessionJson);

const sign = (payload: string, secret: Redacted.Redacted) =>
	createHmac("sha256", Redacted.value(secret))
		.update(payload)
		.digest("base64url");

const safeEqual = (a: string, b: string) => {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * A freshly issued session cookie.
 *
 * @since 2.0.0
 * @category Models
 */
export class IssuedSession extends Schema.Class<IssuedSession>("IssuedSession")(
	{
		token: Schema.String,
		maxAgeSeconds: Schema.Int,
	},
) {}

/**
 * Login, cookie issuing, and cookie verification.
 *
 * When `AUTH_ENABLED` is off, every request is authorized and login fails
 * with `AuthDisabled`.
 *
 * @since 1.1.0
 * @category Services
 */
export class Auth extends Context.Service<Auth>()(
	"spotify-pomodoro/server/Auth",
	{
		make: Effect.gen(function* () {
			const { auth } = yield* ServerConfig;

			const verify = Effect.fn("Auth.verify")(function* (cookie: string) {
				if (Option.isNone(auth)) return;
				const [payload, signature] = cookie.split(".");
				if (!payload || !signature) {
					return yield* new Unauthorized({ reason: "malformed" });
				}
				const json = Buffer.from(payload, "base64url").toString();
				if (!safeEqual(signature, sign(json, auth.value.secret))) {
					return yield* new Unauthorized({ reason: "invalid signature" });
				}
				const session = yield* decodeSession(json).pipe(
					Effect.mapError(
						() => new Unauthorized({ reason: "invalid payload" }),
					),
				);
				const nowSeconds = Math.floor((yield* Clock.currentTimeMillis) / 1000);
				if (session.exp < nowSeconds) {
					return yield* new Unauthorized({ reason: "expired" });
				}
			});

			const login = Effect.fn("Auth.login")(function* (request: LoginRequest) {
				if (Option.isNone(auth)) return yield* new AuthDisabled();
				const settings = auth.value;
				const userOk = safeEqual(request.username, AUTH_USERNAME);
				const passOk = safeEqual(
					request.password,
					Redacted.value(settings.password),
				);
				if (!userOk || !passOk) {
					yield* Effect.logWarning("Rejected login attempt");
					return yield* new InvalidCredentials();
				}
				const nowSeconds = Math.floor((yield* Clock.currentTimeMillis) / 1000);
				const json = yield* Effect.orDie(
					encodeSession(
						new AuthSession({
							username: AUTH_USERNAME,
							exp: nowSeconds + settings.maxAgeSeconds,
						}),
					),
				);
				const payload = Buffer.from(json).toString("base64url");
				return new IssuedSession({
					token: `${payload}.${sign(json, settings.secret)}`,
					maxAgeSeconds: settings.maxAgeSeconds,
				});
			});

			return {
				enabled: Option.isSome(auth),
				verify,
				login,
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
