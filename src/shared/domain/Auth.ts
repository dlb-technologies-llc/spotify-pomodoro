/**
 * Password login for protected deployments.
 *
 * @module
 */
import { Schema } from "effect";

/**
 * The username of the single-user setup, and the owner of data recorded
 * while login is off.
 *
 * @since 1.1.0
 * @category Config
 */
export const AUTH_USERNAME = "admin";

/**
 * A login name: letters, digits, `.`, `_`, or `-`, at most 64 characters.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const UserName = Schema.String.check(
	Schema.isPattern(/^[A-Za-z0-9._-]{1,64}$/),
);

/**
 * @since 2.1.0
 * @category Schemas
 */
export type UserName = typeof UserName.Type;

/**
 * Name of the signed session cookie.
 *
 * @since 1.1.0
 * @category Config
 */
export const AUTH_COOKIE = "auth_token";

/**
 * Login form body.
 *
 * @since 1.1.0
 * @category Schemas
 */
export const LoginRequest = Schema.Struct({
	username: Schema.NonEmptyString,
	password: Schema.NonEmptyString,
});

/**
 * @since 1.1.0
 * @category Schemas
 */
export type LoginRequest = typeof LoginRequest.Type;

/**
 * Contents of the signed session cookie.
 *
 * @since 1.1.0
 * @category Schemas
 */
export class AuthSession extends Schema.Class<AuthSession>("AuthSession")({
	username: UserName,
	exp: Schema.Int,
}) {}

/**
 * The username or password is wrong.
 *
 * @since 1.1.0
 * @category Errors
 */
export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
	"InvalidCredentials",
	{},
	{ httpApiStatus: 401 },
) {}

/**
 * Login was attempted while `AUTH_ENABLED` is off.
 *
 * @since 2.0.0
 * @category Errors
 */
export class AuthDisabled extends Schema.TaggedError<AuthDisabled>()(
	"AuthDisabled",
	{},
	{ httpApiStatus: 400 },
) {}

/**
 * Too many failed logins from this client; try again after `retryAfterSeconds`.
 *
 * @since 2.1.0
 * @category Errors
 */
export class TooManyAttempts extends Schema.TaggedError<TooManyAttempts>()(
	"TooManyAttempts",
	{ retryAfterSeconds: Schema.Int },
	{ httpApiStatus: 429 },
) {}

/**
 * Header the server sets to the client's network address.
 *
 * @since 2.1.0
 * @category Config
 */
export const PEER_HEADER = "x-pomodoro-peer";

/**
 * The request has no valid session cookie.
 *
 * @since 1.1.0
 * @category Errors
 */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{ reason: Schema.String },
	{ httpApiStatus: 401 },
) {}
