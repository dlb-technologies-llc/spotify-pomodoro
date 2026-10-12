/**
 * Password login for protected deployments.
 *
 * @module
 */
import { Schema } from "effect";

/**
 * The only accepted username.
 *
 * @since 1.1.0
 * @category Config
 */
export const AUTH_USERNAME = "admin";

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
	username: Schema.String,
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
