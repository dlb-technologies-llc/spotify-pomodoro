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
export class SpotifyAuthError extends Schema.TaggedErrorClass<SpotifyAuthError>()(
	"SpotifyAuthError",
	{
		reason: Schema.Literals([
			"InvalidState",
			"TokenExchangeFailed",
			"TokenRefreshFailed",
			"NotAuthenticated",
		]),
		message: Schema.String,
	},
) {}

/**
 * Error from Spotify Web API calls.
 *
 * @since 0.0.1
 * @category Errors
 */
export class SpotifyApiError extends Schema.TaggedErrorClass<SpotifyApiError>()(
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
export class NoActiveDeviceError extends Schema.TaggedErrorClass<NoActiveDeviceError>()(
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
export class PremiumRequiredError extends Schema.TaggedErrorClass<PremiumRequiredError>()(
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
export class SdkUnavailableError extends Schema.TaggedErrorClass<SdkUnavailableError>()(
	"SdkUnavailableError",
	{
		reason: Schema.Literals([
			"InitFailed",
			"AuthFailed",
			"AccountError",
			"ScriptLoadFailed",
			"Disconnected",
		]),
		message: Schema.String,
	},
) {}
