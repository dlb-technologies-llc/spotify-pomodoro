/**
 * Authentication error types.
 *
 * @module
 */
import { Schema } from "effect";

/**
 * Error when auth is enabled but configuration is missing.
 *
 * @since 1.1.0
 * @category Errors
 */
export class AuthConfigError extends Schema.TaggedErrorClass<AuthConfigError>()(
	"AuthConfigError",
	{
		message: Schema.String,
	},
) {}

/**
 * Error when credentials are invalid.
 *
 * @since 1.1.0
 * @category Errors
 */
export class InvalidCredentialsError extends Schema.TaggedErrorClass<InvalidCredentialsError>()(
	"InvalidCredentialsError",
	{},
) {}

/**
 * Error when auth cookie is invalid or expired.
 *
 * @since 1.1.0
 * @category Errors
 */
export class InvalidAuthCookieError extends Schema.TaggedErrorClass<InvalidAuthCookieError>()(
	"InvalidAuthCookieError",
	{
		reason: Schema.String,
	},
) {}
