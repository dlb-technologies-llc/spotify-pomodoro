/**
 * Live checks against the real Spotify Accounts service and Web API.
 *
 * Needs `PUBLIC_SPOTIFY_CLIENT_ID` and `SPOTIFY_REFRESH_TOKEN` (mint one with
 * `bun run spotify:token`). Read-only: nothing here changes playback.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { FetchHttpClient } from "effect/http";
import { KeyValueStore } from "effect/persistence";
import { SpotifyAuth } from "@/client/SpotifyAuth";
import { SpotifyClient } from "@/client/SpotifyClient";
import { SpotifyToken } from "@/shared/domain/Spotify";
import { apiClientFor, send, startServer } from "../support/server";

const clientId = process.env.PUBLIC_SPOTIFY_CLIENT_ID;
const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
const configured = Boolean(clientId && refreshToken);

const liveServer = startServer({
	env: { PUBLIC_SPOTIFY_CLIENT_ID: clientId ?? "" },
	upstream: (request) => fetch(request),
});

const refresh = (handler: (request: Request) => Promise<Response>) =>
	send(handler, "/api/spotify/refresh", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ refreshToken }),
	});

describe.skipIf(!configured)("Spotify (live)", () => {
	it.live("refreshes the token through the server", () =>
		Effect.gen(function* () {
			const handler = yield* liveServer;
			const response = yield* refresh(handler);
			assert.strictEqual(
				response.status,
				200,
				yield* Effect.promise(() => response.clone().text()),
			);
			const body = yield* Effect.promise(() => response.json());
			assert.isString(body.accessToken);
			assert.isAbove(body.expiresAt, Date.now());
			assert.include(body.scope, "playlist-read-private");
		}),
	);

	it.live(
		"reads the profile, playlists, and playback with real responses",
		() =>
			Effect.gen(function* () {
				const handler = yield* liveServer;
				const expired = new SpotifyToken({
					accessToken: "expired",
					refreshToken: refreshToken ?? "",
					expiresAt: 0,
					scope: "",
				});
				const layer = SpotifyClient.layer.pipe(
					Layer.provideMerge(SpotifyAuth.layer),
					Layer.provide(FetchHttpClient.layer),
					Layer.provide(apiClientFor(handler)),
					Layer.provide(KeyValueStore.layerMemory),
				);
				yield* Effect.gen(function* () {
					const auth = yield* SpotifyAuth;
					yield* auth.save(expired);
					const client = yield* SpotifyClient;
					const profile = yield* client.profile;
					assert.isString(profile.id);
					const playlists = yield* client.playlists;
					for (const playlist of playlists) {
						assert.match(playlist.uri, /^spotify:/);
					}
					const devices = yield* client.devices;
					for (const device of devices) {
						assert.isString(device.id);
					}
					const playback = yield* client.playbackState;
					if (Option.isSome(playback)) {
						assert.isBoolean(playback.value.isPlaying);
					}
				}).pipe(Effect.provide(layer));
			}),
	);
});
