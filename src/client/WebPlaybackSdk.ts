/**
 * Spotify Web Playback SDK lifecycle: turns this browser tab into a Spotify
 * device on demand.
 *
 * @module
 */
import { Context, Effect, Layer, Option, Ref, Semaphore } from "effect";
import {
	BROWSER_DEVICE_NAME,
	PremiumRequired,
	SdkUnavailable,
} from "@/shared/domain/Spotify";
import { SpotifyAuth } from "./SpotifyAuth";

const SDK_SCRIPT_URL = "https://sdk.scdn.co/spotify-player.js";

const loadScript = Effect.callback<void, SdkUnavailable>((resume) => {
	if (window.Spotify) {
		resume(Effect.void);
		return;
	}
	window.onSpotifyWebPlaybackSDKReady = () => resume(Effect.void);
	const script = document.createElement("script");
	script.src = SDK_SCRIPT_URL;
	script.async = true;
	script.addEventListener("error", () =>
		resume(
			Effect.fail(
				new SdkUnavailable({
					reason: "ScriptLoadFailed",
					message: "Failed to load the Spotify SDK script",
				}),
			),
		),
	);
	document.body.appendChild(script);
});

const connect = (player: SpotifyPlayer) =>
	Effect.callback<string, SdkUnavailable | PremiumRequired>((resume) => {
		const settle = (
			effect: Effect.Effect<string, SdkUnavailable | PremiumRequired>,
		) => {
			player.removeListener("ready");
			player.removeListener("initialization_error");
			player.removeListener("authentication_error");
			player.removeListener("account_error");
			resume(effect);
		};
		const failWith =
			(reason: "InitFailed" | "AuthFailed") =>
			({ message }: { message: string }) =>
				settle(Effect.fail(new SdkUnavailable({ reason, message })));
		player.addListener("ready", ({ device_id }) =>
			settle(Effect.succeed(device_id)),
		);
		player.addListener("initialization_error", failWith("InitFailed"));
		player.addListener("authentication_error", failWith("AuthFailed"));
		player.addListener("account_error", ({ message }) =>
			settle(Effect.fail(new PremiumRequired({ message }))),
		);
		void player.connect();
	});

/**
 * Creates the in-browser Spotify player when playback has no active device.
 *
 * Calls are serialized so only one player exists. When Spotify reports the
 * device not ready (for example after another tab claims playback), the old
 * player is disconnected and replaced on the next call. Spotify needs a moment
 * after `ready` before the Web API accepts the new device, so creation waits
 * briefly; a player that never becomes ready fails after 15 seconds.
 *
 * @since 1.3.0
 * @category Services
 */
export class WebPlaybackSdk extends Context.Service<WebPlaybackSdk>()(
	"spotify-pomodoro/client/WebPlaybackSdk",
	{
		make: Effect.gen(function* () {
			const auth = yield* SpotifyAuth;
			const context = yield* Effect.context();
			const lock = yield* Semaphore.make(1);
			const device = yield* Ref.make(
				Option.none<{
					readonly player: SpotifyPlayer;
					readonly deviceId: string;
					readonly ready: boolean;
				}>(),
			);

			const release = (player: SpotifyPlayer) =>
				Effect.sync(() => {
					player.removeListener("not_ready");
					player.disconnect();
				});

			const create = Effect.gen(function* () {
				yield* loadScript;
				const player = new window.Spotify.Player({
					name: BROWSER_DEVICE_NAME,
					volume: 0.5,
					getOAuthToken: (callback) => {
						void Effect.runPromiseWith(context)(
							auth.accessToken.pipe(Effect.orElseSucceed(() => "")),
						).then(callback);
					},
				});
				const deviceId = yield* connect(player).pipe(
					Effect.timeoutOrElse({
						duration: "15 seconds",
						orElse: () =>
							Effect.fail(
								new SdkUnavailable({
									reason: "InitFailed",
									message: "The Spotify player did not become ready",
								}),
							),
					}),
					Effect.onError(() => release(player)),
				);
				player.addListener("not_ready", () => {
					Effect.runSync(
						Ref.set(device, Option.some({ player, deviceId, ready: false })),
					);
				});
				yield* Ref.set(device, Option.some({ player, deviceId, ready: true }));
				yield* Effect.logInfo("Web Playback SDK ready", { deviceId });
				yield* Effect.sleep("500 millis");
				return deviceId;
			});

			const ensureDevice = lock
				.withPermits(1)(
					Effect.gen(function* () {
						const current = yield* Ref.get(device);
						if (Option.isSome(current)) {
							if (current.value.ready) return current.value.deviceId;
							yield* release(current.value.player);
							yield* Ref.set(device, Option.none());
						}
						return yield* create;
					}),
				)
				.pipe(Effect.withSpan("WebPlaybackSdk.ensureDevice"));

			yield* Effect.addFinalizer(() =>
				Ref.get(device).pipe(
					Effect.flatMap(
						Option.match({
							onNone: () => Effect.void,
							onSome: ({ player }) => release(player),
						}),
					),
				),
			);

			return { ensureDevice };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
