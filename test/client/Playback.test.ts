/**
 * Playlist playback, device fallback, and cross-tab coordination.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Ref, Schedule, SubscriptionRef } from "effect";
import { KeyValueStore } from "effect/persistence";
import { Playback, SDK_CHANNEL } from "@/client/Playback";
import { SettingsStore } from "@/client/SettingsStore";
import { Toasts } from "@/client/Toasts";
import { SpotifyClient } from "@/client/SpotifyClient";
import { WebPlaybackSdk } from "@/client/WebPlaybackSdk";
import {
	BROWSER_DEVICE_NAME,
	NoActiveDevice,
	PlaybackState,
	Playlist,
	type PlayRequest,
	PremiumRequired,
	SdkUnavailable,
	SpotifyApiError,
	SpotifyDevice,
} from "@/shared/domain/Spotify";
import { sample } from "../support/arbitrary";

type Call = { readonly name: string; readonly request?: PlayRequest };

const fakeSpotify = (options: {
	readonly calls: Ref.Ref<ReadonlyArray<Call>>;
	readonly play: (
		request: PlayRequest,
	) => Effect.Effect<void, NoActiveDevice | PremiumRequired | SpotifyApiError>;
	readonly playback: Option.Option<PlaybackState>;
	readonly devices: ReadonlyArray<SpotifyDevice>;
}) => {
	const record = (call: Call) =>
		Ref.update(options.calls, (calls) => [...calls, call]);
	return Layer.succeed(SpotifyClient, {
		profile: Effect.die("unused"),
		playlists: Effect.succeed([]),
		playbackState: Effect.succeed(options.playback),
		devices: Effect.succeed([...options.devices]),
		play: (request: PlayRequest) =>
			record({ name: "play", request }).pipe(
				Effect.andThen(options.play(request)),
			),
		pause: record({ name: "pause" }),
		resume: record({ name: "resume" }),
		setShuffle: () => record({ name: "shuffle" }),
		setRepeat: () => record({ name: "repeat" }),
		setVolume: (percent: number) =>
			record({ name: `volume:${Math.round(percent)}` }),
		next: record({ name: "next" }),
		previous: record({ name: "previous" }),
		transfer: (deviceId: string) => record({ name: `transfer:${deviceId}` }),
	});
};

const fakeSdk = (
	ensureDevice: Effect.Effect<string, SdkUnavailable | PremiumRequired>,
) => Layer.succeed(WebPlaybackSdk, { ensureDevice });

const run = <A, E>(
	effect: Effect.Effect<A, E, Playback | Toasts>,
	options: {
		readonly play?: (
			request: PlayRequest,
		) => Effect.Effect<
			void,
			NoActiveDevice | PremiumRequired | SpotifyApiError
		>;
		readonly sdk?: Effect.Effect<string, SdkUnavailable | PremiumRequired>;
		readonly playback?: Option.Option<PlaybackState>;
		readonly devices?: ReadonlyArray<SpotifyDevice>;
	} = {},
) =>
	Effect.gen(function* () {
		const calls = yield* Ref.make<ReadonlyArray<Call>>([]);
		const result = yield* effect.pipe(
			Effect.provide(
				Playback.layer.pipe(
					Layer.provide(
						fakeSpotify({
							calls,
							play: options.play ?? (() => Effect.void),
							playback: options.playback ?? Option.none(),
							devices: options.devices ?? [],
						}),
					),
					Layer.provide(fakeSdk(options.sdk ?? Effect.succeed("sdk-device"))),
					Layer.provideMerge(SettingsStore.layer),
					Layer.provideMerge(Toasts.layer),
					Layer.provide(KeyValueStore.layerMemory),
				),
			),
		);
		return { result, calls: yield* Ref.get(calls) };
	});

const view = Playback.use((playback) => SubscriptionRef.get(playback.view));

const messages = Toasts.use((toasts) =>
	SubscriptionRef.get(toasts.toasts).pipe(
		Effect.map((all) => all.map((t) => t.message)),
	),
);

describe("Playback", () => {
	it.effect("starts a playlist with shuffle and repeat", () =>
		Effect.gen(function* () {
			const playlist = yield* sample(Playlist);
			const { result, calls } = yield* run(
				Effect.gen(function* () {
					yield* Playback.use((p) => p.startPlaylist(playlist));
					return yield* view;
				}),
			);
			assert.deepStrictEqual(
				calls.map((c) => c.name),
				["play", "shuffle", "repeat"],
			);
			assert.strictEqual(calls[0]?.request?.contextUri, playlist.uri);
			assert.deepStrictEqual(result.selected, Option.some(playlist));
		}),
	);

	it.effect("falls back to a browser device when none is active", () =>
		Effect.gen(function* () {
			const playlist = yield* sample(Playlist);
			const { calls } = yield* run(
				Playback.use((p) => p.startPlaylist(playlist)),
				{
					play: (request) =>
						request.deviceId === "sdk-device"
							? Effect.void
							: Effect.fail(new NoActiveDevice({ message: "none" })),
				},
			);
			assert.deepStrictEqual(
				calls.filter((c) => c.name === "play").map((c) => c.request?.deviceId),
				[undefined, "sdk-device"],
			);
		}),
	);

	it.effect("wakes an idle device before trying the browser player", () =>
		Effect.gen(function* () {
			const playlist = yield* sample(Playlist);
			const desktop = new SpotifyDevice({
				id: "desktop-app",
				name: "DLBDESKTOP",
				type: "Computer",
				isActive: false,
			});
			const browser = new SpotifyDevice({
				id: "old-browser",
				name: BROWSER_DEVICE_NAME,
				type: "Computer",
				isActive: false,
			});
			const { calls } = yield* run(
				Playback.use((p) => p.startPlaylist(playlist)),
				{
					devices: [browser, desktop],
					play: (request) =>
						request.deviceId === undefined
							? Effect.fail(new NoActiveDevice({ message: "none" }))
							: Effect.void,
					sdk: Effect.die("the browser player should not be needed"),
				},
			);
			assert.deepStrictEqual(
				calls.filter((c) => c.name === "play").map((c) => c.request?.deviceId),
				[undefined, "desktop-app"],
			);
		}),
	);

	it.effect("retries without a stale device before giving up on it", () =>
		Effect.gen(function* () {
			const playlist = yield* sample(Playlist);
			const remote = new PlaybackState({
				isPlaying: false,
				deviceId: "gone-phone",
				deviceName: "Phone",
				contextUri: null,
				volumePercent: null,
				track: null,
			});
			const { calls } = yield* run(
				Effect.gen(function* () {
					const playback = yield* Playback;
					yield* playback.refresh();
					yield* playback.startPlaylist(playlist);
					return yield* view;
				}),
				{
					playback: Option.some(remote),
					play: (request) =>
						request.deviceId === "gone-phone"
							? Effect.fail(
									new SpotifyApiError({
										status: 404,
										message: "Device not found",
									}),
								)
							: request.deviceId === undefined
								? Effect.fail(new NoActiveDevice({ message: "none" }))
								: Effect.void,
				},
			);
			assert.deepStrictEqual(
				calls.filter((c) => c.name === "play").map((c) => c.request?.deviceId),
				["gone-phone", undefined, "sdk-device"],
			);
		}),
	);

	it.effect("explains why playback could not start", () =>
		Effect.gen(function* () {
			const playlist = yield* sample(Playlist);
			const cases = [
				{
					play: () =>
						Effect.fail(new SpotifyApiError({ status: 404, message: "x" })),
					sdk: Effect.succeed("sdk-device"),
					message: "Open Spotify on your phone or computer first",
				},
				{
					play: () => Effect.fail(new NoActiveDevice({ message: "none" })),
					sdk: Effect.fail(new PremiumRequired({ message: "free" })),
					message:
						"Spotify Premium required for browser playback. Open Spotify on another device instead.",
				},
				{
					play: () => Effect.fail(new NoActiveDevice({ message: "none" })),
					sdk: Effect.fail(
						new SdkUnavailable({ reason: "ScriptLoadFailed", message: "x" }),
					),
					message:
						"Browser player unavailable (ScriptLoadFailed: x). Open Spotify on your phone or computer.",
				},
			];
			for (const { play, sdk, message } of cases) {
				const { result } = yield* run(
					Effect.gen(function* () {
						yield* Playback.use((p) => p.startPlaylist(playlist));
						return { current: yield* view, shown: yield* messages };
					}),
					{ play, sdk },
				);
				assert.deepStrictEqual(result.shown, [message]);
				assert.isFalse(result.current.playingIntent);
			}
		}),
	);

	it.effect("toggle pauses while playing and resumes the selection", () =>
		Effect.gen(function* () {
			const playlist = yield* sample(Playlist);
			const { calls } = yield* run(
				Effect.gen(function* () {
					const playback = yield* Playback;
					yield* playback.toggle();
					yield* playback.startPlaylist(playlist);
					yield* playback.toggle();
					yield* playback.toggle();
				}),
			);
			assert.deepStrictEqual(
				calls.map((c) => c.name),
				["play", "shuffle", "repeat", "pause", "play", "shuffle", "repeat"],
			);
		}),
	);

	it.live("notices when another tab claims the browser device", () =>
		Effect.gen(function* () {
			const browserPlayback = new PlaybackState({
				isPlaying: true,
				deviceId: "browser-device",
				deviceName: BROWSER_DEVICE_NAME,
				contextUri: null,
				volumePercent: null,
				track: null,
			});
			const { result } = yield* run(
				Effect.gen(function* () {
					const playback = yield* Playback;
					yield* playback.refresh();
					const otherTab = new BroadcastChannel(SDK_CHANNEL);
					otherTab.postMessage({ type: "sdk-claimed" });
					otherTab.close();
					yield* messages.pipe(
						Effect.filterOrFail(
							(shown) => shown.includes("Playback moved to another tab"),
							() => "not yet",
						),
						Effect.retry({
							schedule: Schedule.spaced("10 millis"),
							times: 100,
						}),
					);
					return yield* view;
				}),
				{ playback: Option.some(browserPlayback) },
			);
			assert.isFalse(result.isPlaying);
		}),
	);
});
