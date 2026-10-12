/**
 * Spotify token handling and Web API calls against a fake Spotify.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Clock, Effect, Layer, Option, Schema } from "effect";
import { KeyValueStore } from "effect/persistence";
import { SpotifyAuth, TOKEN_STORAGE_KEY } from "@/client/SpotifyAuth";
import { SpotifyClient } from "@/client/SpotifyClient";
import {
	PlayRequest,
	SpotifyPlaybackResponse,
	SpotifyPlaylistsPage,
	SpotifyToken,
} from "@/shared/domain/Spotify";
import { sample } from "../support/arbitrary";
import { json, recording } from "../support/http";
import { apiClientFor, startServer } from "../support/server";

const freshToken = Effect.gen(function* () {
	const token = yield* sample(SpotifyToken);
	return new SpotifyToken({
		...token,
		expiresAt: (yield* Clock.currentTimeMillis) + 3_600_000,
	});
});

const storeWith = (token: Option.Option<SpotifyToken>) =>
	Layer.effect(
		KeyValueStore.KeyValueStore,
		Effect.gen(function* () {
			const store = yield* KeyValueStore.KeyValueStore;
			if (Option.isSome(token)) {
				yield* KeyValueStore.toSchemaStore(store, SpotifyToken)
					.set(TOKEN_STORAGE_KEY, token.value)
					.pipe(Effect.orDie);
			}
			return store;
		}),
	).pipe(Layer.provide(KeyValueStore.layerMemory));

const spotifyLayers = (options: {
	readonly token: Option.Option<SpotifyToken>;
	readonly spotify: (request: Request) => Response | Promise<Response>;
	readonly accounts?: (request: Request) => Response | Promise<Response>;
}) =>
	Effect.gen(function* () {
		const server = yield* startServer({ upstream: options.accounts });
		const spotify = recording(options.spotify);
		const layer = SpotifyClient.layer.pipe(
			Layer.provideMerge(SpotifyAuth.layer),
			Layer.provide(spotify.layer),
			Layer.provide(apiClientFor(server)),
			Layer.provideMerge(storeWith(options.token)),
		);
		return { layer, requests: spotify.requests };
	});

const noSpotify = () => new Response("unexpected", { status: 599 });

describe("SpotifyClient", () => {
	it.effect("lists playlists, skipping unavailable entries", () =>
		Effect.gen(function* () {
			const token = yield* freshToken;
			const { layer, requests } = yield* spotifyLayers({
				token: Option.some(token),
				spotify: () =>
					json({
						items: [
							{
								id: "a",
								name: "Lofi",
								uri: "spotify:playlist:a",
								images: [{ url: "https://i/a" }],
							},
							null,
							{
								id: "b",
								name: "Jazz",
								uri: "spotify:playlist:b",
								images: null,
							},
						],
					}),
			});
			const playlists = yield* SpotifyClient.use((c) => c.playlists).pipe(
				Effect.provide(layer),
			);
			assert.deepStrictEqual(
				playlists.map((p) => [p.name, p.imageUrl]),
				[
					["Lofi", "https://i/a"],
					["Jazz", null],
				],
			);
			assert.strictEqual(requests[0]?.url.pathname, "/v1/me/playlists");
			assert.strictEqual(requests[0]?.url.searchParams.get("limit"), "50");
		}),
	);

	it.effect.prop(
		"decodes any well-formed playlists page",
		[SpotifyPlaylistsPage],
		([page]) =>
			Effect.gen(function* () {
				const { layer } = yield* spotifyLayers({
					token: Option.some(yield* freshToken),
					spotify: () =>
						json(
							Schema.encodeSync(SpotifyPlaylistsPage)({ ...page, next: null }),
						),
				});
				const playlists = yield* SpotifyClient.use((c) => c.playlists).pipe(
					Effect.provide(layer),
				);
				assert.strictEqual(
					playlists.length,
					page.items.filter((item) => item !== null).length,
				);
			}).pipe(Effect.scoped),
		{ arbitrary: { runs: 25 } },
	);

	it.effect(
		"reports no playback as none and live playback with its device",
		() =>
			Effect.gen(function* () {
				const body = yield* sample(SpotifyPlaybackResponse);
				let calls = 0;
				const { layer } = yield* spotifyLayers({
					token: Option.some(yield* freshToken),
					spotify: () =>
						calls++ === 0
							? new Response(null, { status: 204 })
							: json(Schema.encodeSync(SpotifyPlaybackResponse)(body)),
				});
				yield* Effect.gen(function* () {
					const client = yield* SpotifyClient;
					assert.isTrue(Option.isNone(yield* client.playbackState));
					const state = yield* client.playbackState;
					assert.deepStrictEqual(
						Option.map(state, (s) => [s.isPlaying, s.deviceName]),
						Option.some([body.is_playing, body.device?.name ?? null]),
					);
				}).pipe(Effect.provide(layer));
			}),
	);

	it.effect("sends play requests with the bearer token and device", () =>
		Effect.gen(function* () {
			const token = yield* freshToken;
			const authorization: Array<string | null> = [];
			const { layer, requests } = yield* spotifyLayers({
				token: Option.some(token),
				spotify: (request) => {
					authorization.push(request.headers.get("authorization"));
					return new Response(null, { status: 204 });
				},
			});
			yield* SpotifyClient.use((c) =>
				c.play(
					new PlayRequest({
						contextUri: "spotify:playlist:x",
						deviceId: "dev-1",
					}),
				),
			).pipe(Effect.provide(layer));
			assert.strictEqual(authorization[0], `Bearer ${token.accessToken}`);
			assert.strictEqual(requests[0]?.method, "PUT");
			assert.strictEqual(
				requests[0]?.url.searchParams.get("device_id"),
				"dev-1",
			);
			assert.deepStrictEqual(JSON.parse(requests[0]?.body ?? ""), {
				context_uri: "spotify:playlist:x",
			});
		}),
	);

	it.effect("classifies Spotify errors", () =>
		Effect.gen(function* () {
			const cases = [
				{
					response: json(
						{
							error: {
								status: 404,
								message: "Device not found",
								reason: "NO_ACTIVE_DEVICE",
							},
						},
						404,
					),
					tag: "NoActiveDevice",
				},
				{
					response: json(
						{
							error: {
								status: 403,
								message: "Premium required",
								reason: "PREMIUM_REQUIRED",
							},
						},
						403,
					),
					tag: "PremiumRequired",
				},
				{
					response: new Response(null, { status: 404 }),
					tag: "SpotifyApiError",
				},
				{
					response: json({ error: { status: 500, message: "boom" } }, 500),
					tag: "SpotifyApiError",
				},
			];
			for (const { response, tag } of cases) {
				const { layer } = yield* spotifyLayers({
					token: Option.some(yield* freshToken),
					spotify: () => response,
				});
				const error = yield* SpotifyClient.use((c) =>
					c.play(new PlayRequest({ contextUri: "spotify:playlist:x" })),
				).pipe(Effect.provide(layer), Effect.flip);
				assert.strictEqual(error._tag, tag);
			}
		}),
	);
});

describe("SpotifyClient paging and now playing", () => {
	it.effect("follows playlist pages until there is no next link", () =>
		Effect.gen(function* () {
			const item = (n: number) => ({
				id: `p${n}`,
				name: `Playlist ${n}`,
				uri: `spotify:playlist:p${n}`,
				images: [],
			});
			const { layer, requests } = yield* spotifyLayers({
				token: Option.some(yield* freshToken),
				spotify: (request) =>
					new URL(request.url).searchParams.get("offset") === "50"
						? json({ next: null, items: [item(51)] })
						: json({
								next: "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
								items: Array.from({ length: 50 }, (_, n) => item(n + 1)),
							}),
			});
			const playlists = yield* SpotifyClient.use((c) => c.playlists).pipe(
				Effect.provide(layer),
			);
			assert.strictEqual(playlists.length, 51);
			assert.strictEqual(requests.length, 2);
		}),
	);

	it.effect("reads the current track, artist, art, and volume", () =>
		Effect.gen(function* () {
			const { layer } = yield* spotifyLayers({
				token: Option.some(yield* freshToken),
				spotify: () =>
					json({
						is_playing: true,
						device: { id: "d1", name: "Desk", volume_percent: 40 },
						context: { uri: "spotify:playlist:x" },
						item: {
							name: "Snowman",
							artists: [{ name: "WYS" }, { name: "Saib" }],
							album: { images: [{ url: "https://i/art" }] },
						},
					}),
			});
			const state = yield* SpotifyClient.use((c) => c.playbackState).pipe(
				Effect.provide(layer),
			);
			const playback = Option.getOrThrow(state);
			assert.strictEqual(playback.volumePercent, 40);
			assert.deepStrictEqual(
				[
					playback.track?.title,
					playback.track?.artist,
					playback.track?.imageUrl,
				],
				["Snowman", "WYS, Saib", "https://i/art"],
			);
		}),
	);

	it.effect("sends volume, skip, and transfer commands", () =>
		Effect.gen(function* () {
			const { layer, requests } = yield* spotifyLayers({
				token: Option.some(yield* freshToken),
				spotify: () => new Response(null, { status: 204 }),
			});
			yield* Effect.gen(function* () {
				const client = yield* SpotifyClient;
				yield* client.setVolume(120);
				yield* client.next;
				yield* client.previous;
				yield* client.transfer("phone", true);
			}).pipe(Effect.provide(layer));
			assert.deepStrictEqual(
				requests.map((r) => `${r.method} ${r.url.pathname}${r.url.search}`),
				[
					"PUT /v1/me/player/volume?volume_percent=100",
					"POST /v1/me/player/next",
					"POST /v1/me/player/previous",
					"PUT /v1/me/player",
				],
			);
			assert.deepStrictEqual(JSON.parse(requests[3]?.body ?? ""), {
				device_ids: ["phone"],
				play: true,
			});
		}),
	);
});

describe("SpotifyAuth", () => {
	it.effect("fails fast when not connected", () =>
		Effect.gen(function* () {
			const { layer, requests } = yield* spotifyLayers({
				token: Option.none(),
				spotify: noSpotify,
			});
			const error = yield* SpotifyClient.use((c) => c.playlists).pipe(
				Effect.provide(layer),
				Effect.flip,
			);
			assert.strictEqual(error._tag, "SpotifyNotConnected");
			assert.strictEqual(requests.length, 0);
		}),
	);

	it.effect("refreshes an expired token once, then persists it", () =>
		Effect.gen(function* () {
			const stale = new SpotifyToken({ ...(yield* freshToken), expiresAt: 0 });
			const fresh = yield* sample(SpotifyToken);
			let refreshes = 0;
			const { layer } = yield* spotifyLayers({
				token: Option.some(stale),
				accounts: () => {
					refreshes++;
					return json({
						access_token: fresh.accessToken,
						expires_in: 3600,
						scope: fresh.scope,
					});
				},
				spotify: (request) =>
					request.headers.get("authorization") === `Bearer ${fresh.accessToken}`
						? json({ items: [] })
						: new Response(null, { status: 401 }),
			});
			yield* Effect.gen(function* () {
				const client = yield* SpotifyClient;
				yield* Effect.all(
					[client.playlists, client.playlists, client.playlists],
					{
						concurrency: "unbounded",
					},
				);
				assert.strictEqual(refreshes, 1);
				const store = KeyValueStore.toSchemaStore(
					yield* KeyValueStore.KeyValueStore,
					SpotifyToken,
				);
				const saved = yield* store.get(TOKEN_STORAGE_KEY);
				assert.deepStrictEqual(
					Option.map(saved, (t) => [t.accessToken, t.refreshToken]),
					Option.some([fresh.accessToken, stale.refreshToken]),
				);
			}).pipe(Effect.provide(layer));
		}),
	);

	it.effect("disconnects when the refresh token is rejected", () =>
		Effect.gen(function* () {
			const stale = new SpotifyToken({ ...(yield* freshToken), expiresAt: 0 });
			const { layer } = yield* spotifyLayers({
				token: Option.some(stale),
				accounts: () => json({ error: "invalid_grant" }, 400),
				spotify: noSpotify,
			});
			yield* Effect.gen(function* () {
				const auth = yield* SpotifyAuth;
				assert.isTrue(yield* auth.isConnected);
				const error = yield* Effect.flip(SpotifyClient.use((c) => c.playlists));
				assert.strictEqual(error._tag, "SpotifyNotConnected");
				assert.isFalse(yield* auth.isConnected);
			}).pipe(Effect.provide(layer));
		}),
	);

	it.effect("keeps the token through a Spotify outage", () =>
		Effect.gen(function* () {
			const stale = new SpotifyToken({ ...(yield* freshToken), expiresAt: 0 });
			const { layer } = yield* spotifyLayers({
				token: Option.some(stale),
				accounts: () => new Response("down", { status: 503 }),
				spotify: noSpotify,
			});
			yield* Effect.gen(function* () {
				const error = yield* Effect.flip(SpotifyClient.use((c) => c.playlists));
				assert.strictEqual(error._tag, "SpotifyUnavailable");
				assert.isTrue(yield* (yield* SpotifyAuth).isConnected);
				const store = KeyValueStore.toSchemaStore(
					yield* KeyValueStore.KeyValueStore,
					SpotifyToken,
				);
				assert.isTrue(Option.isSome(yield* store.get(TOKEN_STORAGE_KEY)));
			}).pipe(Effect.provide(layer));
		}),
	);

	it.effect(
		"uses a token another tab refreshed instead of refreshing again",
		() =>
			Effect.gen(function* () {
				const stale = new SpotifyToken({
					...(yield* freshToken),
					expiresAt: 0,
				});
				const rotated = yield* freshToken;
				let refreshes = 0;
				const { layer } = yield* spotifyLayers({
					token: Option.some(stale),
					accounts: () => {
						refreshes++;
						return json({ error: "invalid_grant" }, 400);
					},
					spotify: (request) =>
						request.headers.get("authorization") ===
						`Bearer ${rotated.accessToken}`
							? json({ items: [] })
							: new Response(null, { status: 401 }),
				});
				yield* Effect.gen(function* () {
					const auth = yield* SpotifyAuth;
					const store = KeyValueStore.toSchemaStore(
						yield* KeyValueStore.KeyValueStore,
						SpotifyToken,
					);
					yield* store.set(TOKEN_STORAGE_KEY, rotated);
					yield* SpotifyClient.use((c) => c.playlists);
					assert.strictEqual(refreshes, 0);
					assert.isTrue(yield* auth.isConnected);
				}).pipe(Effect.provide(layer));
			}),
	);

	it.effect("does not delete a token another tab stored while refreshing", () =>
		Effect.gen(function* () {
			const stale = new SpotifyToken({ ...(yield* freshToken), expiresAt: 0 });
			const rotated = new SpotifyToken({
				...(yield* freshToken),
				expiresAt: 0,
			});
			const { layer } = yield* spotifyLayers({
				token: Option.some(stale),
				accounts: () => json({ error: "invalid_grant" }, 400),
				spotify: noSpotify,
			});
			yield* Effect.gen(function* () {
				const store = KeyValueStore.toSchemaStore(
					yield* KeyValueStore.KeyValueStore,
					SpotifyToken,
				);
				yield* SpotifyAuth;
				yield* store.set(
					TOKEN_STORAGE_KEY,
					new SpotifyToken({ ...rotated, expiresAt: stale.expiresAt }),
				);
				yield* Effect.flip(SpotifyClient.use((c) => c.playlists));
				const saved = yield* store.get(TOKEN_STORAGE_KEY);
				assert.deepStrictEqual(
					Option.map(saved, (t) => t.refreshToken),
					Option.some(rotated.refreshToken),
				);
			}).pipe(Effect.provide(layer));
		}),
	);
});
