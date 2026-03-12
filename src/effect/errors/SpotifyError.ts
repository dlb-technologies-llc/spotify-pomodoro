/**
 * Spotify API, authentication, and Web Playback SDK errors.
 *
 * @module
 */

import { Schema } from "effect";

/**
 * Authentication error during OAuth flow.
 *
 * @since 0.0.1
 * @category Errors
 */
export class SpotifyAuthError extends Schema.TaggedError<SpotifyAuthError>()(
	"SpotifyAuthError",
	{
		reason: Schema.Literal(
			"InvalidState",
			"TokenExchangeFailed",
			"TokenRefreshFailed",
			"NotAuthenticated",
		),
		message: Schema.String,
	},
) {}

/**
 * Error from Spotify Web API calls.
 *
 * @since 0.0.1
 * @category Errors
 */
export class SpotifyApiError extends Schema.TaggedError<SpotifyApiError>()(
	"SpotifyApiError",
	{
		status: Schema.Number,
		message: Schema.String,
	},
) {}

/**
 * No active Spotify device available for playback.
 *
 * @since 1.3.0
 * @category Errors
 */
export class NoActiveDeviceError extends Schema.TaggedError<NoActiveDeviceError>()(
	"NoActiveDeviceError",
	{
		message: Schema.String,
	},
) {}

/**
 * Spotify Premium subscription required for Web Playback SDK.
 *
 * @since 1.3.0
 * @category Errors
 */
export class PremiumRequiredError extends Schema.TaggedError<PremiumRequiredError>()(
	"PremiumRequiredError",
	{
		message: Schema.String,
	},
) {}

/**
 * Web Playback SDK is unavailable or failed to initialize.
 *
 * @since 1.3.0
 * @category Errors
 */
export class SdkUnavailableError extends Schema.TaggedError<SdkUnavailableError>()(
	"SdkUnavailableError",
	{
		reason: Schema.Literal(
			"InitFailed",
			"AuthFailed",
			"AccountError",
			"ScriptLoadFailed",
			"Disconnected",
		),
		message: Schema.String,
	},
) {}
