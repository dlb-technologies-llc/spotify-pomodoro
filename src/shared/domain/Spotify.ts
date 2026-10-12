/**
 * Spotify tokens, playlists, playback state, and the Spotify Web API wire
 * formats they are decoded from.
 *
 * @module
 */
import { Schema } from "effect";

/**
 * OAuth scopes requested from Spotify.
 *
 * @since 2.0.0
 * @category Config
 */
export const SPOTIFY_SCOPES = [
	"user-read-playback-state",
	"user-modify-playback-state",
	"user-read-currently-playing",
	"playlist-read-private",
	"streaming",
] as const;

/**
 * Name the Web Playback SDK registers this app's browser device under.
 *
 * @since 2.0.0
 * @category Config
 */
export const BROWSER_DEVICE_NAME = "Spotify Pomodoro";

/**
 * URL hash parameter the OAuth callback uses to hand the token to the app.
 *
 * @since 2.0.0
 * @category Config
 */
export const TOKEN_FRAGMENT = "spotify_token";

/**
 * An OAuth token string: printable ASCII (RFC 6749 `VSCHAR`).
 *
 * @since 2.0.0
 * @category Schemas
 */
export const OAuthTokenString = Schema.String.check(
	Schema.isPattern(/^[\x20-\x7e]+$/),
);

/**
 * Milliseconds since the Unix epoch, within the range of a JavaScript `Date`.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const EpochMillis = Schema.Int.check(
	Schema.isBetween({ minimum: 0, maximum: 8_640_000_000_000_000 }),
);

/**
 * Spotify OAuth token held by the browser.
 *
 * @since 0.0.1
 * @category Schemas
 */
export class SpotifyToken extends Schema.Class<SpotifyToken>("SpotifyToken")({
	accessToken: OAuthTokenString,
	refreshToken: OAuthTokenString,
	expiresAt: EpochMillis,
	scope: Schema.String,
}) {
	/**
	 * Whether the token expires within a minute of `now` (epoch ms).
	 *
	 * @since 2.0.0
	 */
	isExpiredAt(now: number): boolean {
		return now >= this.expiresAt - 60_000;
	}
}

/**
 * Body of `POST https://accounts.spotify.com/api/token`.
 *
 * @since 2.0.0
 * @category Wire
 */
export const SpotifyTokenResponse = Schema.Struct({
	access_token: OAuthTokenString,
	refresh_token: Schema.optional(OAuthTokenString),
	expires_in: Schema.Number,
	scope: Schema.String,
});

/**
 * Request body for refreshing a token through the server.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const RefreshTokenRequest = Schema.Struct({
	refreshToken: OAuthTokenString,
});

/**
 * @since 2.0.0
 * @category Schemas
 */
export type RefreshTokenRequest = typeof RefreshTokenRequest.Type;

/**
 * A playlist the user can start.
 *
 * @since 0.0.1
 * @category Schemas
 */
export class Playlist extends Schema.Class<Playlist>("Playlist")({
	id: Schema.String,
	name: Schema.String,
	uri: Schema.String,
	imageUrl: Schema.NullOr(Schema.String),
}) {}

/**
 * Where playback is happening, relative to this app.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const DeviceSource = Schema.Literals(["browser", "remote"]);

/**
 * @since 2.0.0
 * @category Schemas
 */
export type DeviceSource = typeof DeviceSource.Type;

/**
 * The track or episode playing.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class NowPlaying extends Schema.Class<NowPlaying>("NowPlaying")({
	title: Schema.String,
	artist: Schema.NullOr(Schema.String),
	imageUrl: Schema.NullOr(Schema.String),
}) {}

/**
 * Current Spotify playback.
 *
 * @since 0.0.1
 * @category Schemas
 */
export class PlaybackState extends Schema.Class<PlaybackState>("PlaybackState")(
	{
		isPlaying: Schema.Boolean,
		deviceId: Schema.NullOr(Schema.String),
		deviceName: Schema.NullOr(Schema.String),
		contextUri: Schema.NullOr(Schema.String),
		volumePercent: Schema.NullOr(Schema.Number),
		track: Schema.NullOr(NowPlaying),
	},
) {
	/**
	 * Whether playback is on this app's browser device or another device.
	 *
	 * @since 2.0.0
	 */
	get deviceSource(): DeviceSource | null {
		if (this.deviceName === null) return null;
		return this.deviceName === BROWSER_DEVICE_NAME ? "browser" : "remote";
	}
}

/**
 * Spotify repeat modes.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const RepeatMode = Schema.Literals(["off", "context", "track"]);

/**
 * @since 2.0.0
 * @category Schemas
 */
export type RepeatMode = typeof RepeatMode.Type;

/**
 * What to start playing.
 *
 * @since 2.0.0
 * @category Schemas
 */
export class PlayRequest extends Schema.Class<PlayRequest>("PlayRequest")({
	contextUri: Schema.String,
	deviceId: Schema.optional(Schema.String),
}) {}

/**
 * Body of `GET /v1/me/playlists`.
 *
 * @since 2.0.0
 * @category Wire
 */
export const SpotifyPlaylistsPage = Schema.Struct({
	next: Schema.optional(Schema.NullOr(Schema.String)),
	items: Schema.Array(
		Schema.NullOr(
			Schema.Struct({
				id: Schema.String,
				name: Schema.String,
				uri: Schema.String,
				images: Schema.NullOr(
					Schema.Array(Schema.Struct({ url: Schema.String })),
				),
			}),
		),
	),
});

/**
 * Body of `GET /v1/me/player`.
 *
 * @since 2.0.0
 * @category Wire
 */
export const SpotifyPlaybackResponse = Schema.Struct({
	is_playing: Schema.Boolean,
	device: Schema.optional(
		Schema.NullOr(
			Schema.Struct({
				id: Schema.NullOr(Schema.String),
				name: Schema.String,
				volume_percent: Schema.optional(Schema.NullOr(Schema.Number)),
			}),
		),
	),
	context: Schema.optional(
		Schema.NullOr(Schema.Struct({ uri: Schema.String })),
	),
	item: Schema.optional(
		Schema.NullOr(
			Schema.Struct({
				name: Schema.String,
				artists: Schema.optional(
					Schema.Array(Schema.Struct({ name: Schema.String })),
				),
				album: Schema.optional(
					Schema.Struct({
						images: Schema.optional(
							Schema.Array(Schema.Struct({ url: Schema.String })),
						),
					}),
				),
				show: Schema.optional(
					Schema.Struct({
						name: Schema.String,
						images: Schema.optional(
							Schema.Array(Schema.Struct({ url: Schema.String })),
						),
					}),
				),
			}),
		),
	),
});

/**
 * A device Spotify can play on.
 *
 * @since 2.0.0
 * @category Schemas
 */
export class SpotifyDevice extends Schema.Class<SpotifyDevice>("SpotifyDevice")(
	{
		id: Schema.String,
		name: Schema.String,
		type: Schema.String,
		isActive: Schema.Boolean,
	},
) {}

/**
 * Body of `GET /v1/me/player/devices`.
 *
 * @since 2.0.0
 * @category Wire
 */
export const SpotifyDevicesResponse = Schema.Struct({
	devices: Schema.Array(
		Schema.Struct({
			id: Schema.NullOr(Schema.String),
			name: Schema.String,
			type: Schema.String,
			is_active: Schema.Boolean,
			is_restricted: Schema.optional(Schema.Boolean),
		}),
	),
});

/**
 * Body of `GET /v1/me`.
 *
 * @since 2.0.0
 * @category Wire
 */
export const SpotifyProfile = Schema.Struct({
	id: Schema.String,
	product: Schema.optional(Schema.String),
});

/**
 * Spotify error envelope, e.g. `{ "error": { "status": 404, "reason": "NO_ACTIVE_DEVICE" } }`.
 *
 * @since 2.0.0
 * @category Wire
 */
export const SpotifyErrorBody = Schema.Struct({
	error: Schema.Struct({
		status: Schema.Number,
		message: Schema.optional(Schema.String),
		reason: Schema.optional(Schema.String),
	}),
});

/**
 * There is no Spotify token, or it could not be refreshed.
 *
 * @since 0.0.1
 * @category Errors
 */
export class SpotifyNotConnected extends Schema.TaggedError<SpotifyNotConnected>()(
	"SpotifyNotConnected",
	{ message: Schema.String },
	{ httpApiStatus: 401 },
) {}

/**
 * Spotify could not be reached or answered with a server error; retry later.
 *
 * @since 2.0.0
 * @category Errors
 */
export class SpotifyUnavailable extends Schema.TaggedError<SpotifyUnavailable>()(
	"SpotifyUnavailable",
	{ message: Schema.String },
	{ httpApiStatus: 503 },
) {}

/**
 * A Spotify Web API call failed.
 *
 * @since 0.0.1
 * @category Errors
 */
export class SpotifyApiError extends Schema.TaggedError<SpotifyApiError>()(
	"SpotifyApiError",
	{ status: Schema.Number, message: Schema.String },
) {}

/**
 * Playback needs a device and none is active.
 *
 * @since 1.3.0
 * @category Errors
 */
export class NoActiveDevice extends Schema.TaggedError<NoActiveDevice>()(
	"NoActiveDevice",
	{ message: Schema.String },
) {}

/**
 * Playback control needs Spotify Premium.
 *
 * @since 1.3.0
 * @category Errors
 */
export class PremiumRequired extends Schema.TaggedError<PremiumRequired>()(
	"PremiumRequired",
	{ message: Schema.String },
) {}

/**
 * The Web Playback SDK could not provide a browser device.
 *
 * @since 1.3.0
 * @category Errors
 */
export class SdkUnavailable extends Schema.TaggedError<SdkUnavailable>()(
	"SdkUnavailable",
	{
		reason: Schema.Literals([
			"ScriptLoadFailed",
			"InitFailed",
			"AuthFailed",
			"Disconnected",
		]),
		message: Schema.String,
	},
) {}
