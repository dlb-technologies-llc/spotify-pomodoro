/**
 * Playlist selection and play/pause, falling back to an in-browser device.
 *
 * @module
 */
import {
	Context,
	Effect,
	FiberSet,
	Layer,
	Option,
	Ref,
	Schema,
	Stream,
	SubscriptionRef,
} from "effect";
import { PlaybackState, Playlist, PlayRequest } from "@/shared/domain/Spotify";
import { SpotifyClient } from "./SpotifyClient";
import { WebPlaybackSdk } from "./WebPlaybackSdk";

/**
 * Channel tabs use to announce that they claimed the browser device.
 *
 * @since 2.0.0
 * @category Config
 */
export const SDK_CHANNEL = "spotify-pomodoro-sdk";

/**
 * Message posted on {@link SDK_CHANNEL} after a tab starts browser playback.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const SdkClaimed = Schema.Struct({
	type: Schema.Literal("sdk-claimed"),
});

const isSdkClaimed = Schema.is(SdkClaimed);

/**
 * Everything the player UI renders.
 *
 * @since 2.0.0
 * @category Schemas
 */
export class PlayerView extends Schema.Class<PlayerView>("PlayerView")({
	playback: Schema.Option(PlaybackState),
	selected: Schema.Option(Playlist),
	playingIntent: Schema.Boolean,
	error: Schema.Option(Schema.String),
	tabTookOver: Schema.Boolean,
}) {
	/**
	 * The initial view.
	 *
	 * @since 2.0.0
	 */
	static readonly empty = new PlayerView({
		playback: Option.none(),
		selected: Option.none(),
		playingIntent: false,
		error: Option.none(),
		tabTookOver: false,
	});

	/**
	 * Whether the vinyl should spin.
	 *
	 * @since 2.0.0
	 */
	get isPlaying(): boolean {
		return (
			this.playingIntent ||
			Option.exists(this.playback, (playback) => playback.isPlaying)
		);
	}
}

const playErrorMessage = (error: { readonly _tag: string }) => {
	switch (error._tag) {
		case "PremiumRequired":
			return "Spotify Premium required for browser playback. Open Spotify on another device instead.";
		case "SdkUnavailable":
			return "Browser player unavailable. Open Spotify on your phone or computer.";
		case "SpotifyNotConnected":
			return "Spotify session expired, reconnect Spotify";
		default:
			return "Open Spotify on your phone or computer first";
	}
};

/**
 * Controls playback for the selected playlist.
 *
 * When Spotify reports no active device, a browser device is created with the
 * Web Playback SDK and playback retried there. Other tabs are told when this
 * tab claims the browser device, and show a notice when theirs is taken.
 *
 * @since 2.0.0
 * @category Services
 */
export class Playback extends Context.Service<Playback>()(
	"spotify-pomodoro/client/Playback",
	{
		make: Effect.gen(function* () {
			const spotify = yield* SpotifyClient;
			const sdk = yield* WebPlaybackSdk;
			const view = yield* SubscriptionRef.make(PlayerView.empty);
			const lastDeviceId = yield* Ref.make(Option.none<string>());
			const scope = yield* Effect.scope;

			const update = (f: (current: PlayerView) => Partial<PlayerView>) =>
				SubscriptionRef.update(
					view,
					(current) => new PlayerView({ ...current, ...f(current) }),
				);

			const channel = yield* Effect.acquireRelease(
				Effect.sync(() => new BroadcastChannel(SDK_CHANNEL)),
				(channel) => Effect.sync(() => channel.close()),
			);

			const runFork = yield* FiberSet.makeRuntime();
			const onClaimed = update((current) =>
				Option.exists(
					current.playback,
					(playback) => playback.deviceSource === "browser",
				)
					? { tabTookOver: true, playback: Option.none(), playingIntent: false }
					: {},
			);
			yield* Effect.acquireRelease(
				Effect.sync(() => {
					const listener = (event: MessageEvent) => {
						if (isSdkClaimed(event.data)) runFork(onClaimed);
					};
					channel.addEventListener("message", listener);
					return listener;
				}),
				(listener) =>
					Effect.sync(() => channel.removeEventListener("message", listener)),
			);

			const refresh = Effect.fn("Playback.refresh")(function* () {
				const playback = yield* spotify.playbackState.pipe(
					Effect.catch(() => Effect.succeedNone),
				);
				yield* Option.match(
					Option.flatMap(playback, (p) => Option.fromNullOr(p.deviceId)),
					{
						onNone: () => Effect.void,
						onSome: (id) => Ref.set(lastDeviceId, Option.some(id)),
					},
				);
				yield* update(() => ({ playback }));
				return playback;
			});

			const playOnAnyDevice = Effect.fn("Playback.playOnAnyDevice")(function* (
				contextUri: string,
			) {
				const deviceId = yield* Ref.get(lastDeviceId);
				yield* spotify
					.play(
						new PlayRequest({
							contextUri,
							deviceId: Option.getOrUndefined(deviceId),
						}),
					)
					.pipe(
						Effect.catchTag("NoActiveDevice", () =>
							sdk.ensureDevice.pipe(
								Effect.flatMap((sdkDeviceId) =>
									spotify.play(
										new PlayRequest({ contextUri, deviceId: sdkDeviceId }),
									),
								),
							),
						),
					);
			});

			const startPlaylist = Effect.fn("Playback.startPlaylist")(
				function* (playlist: Playlist) {
					yield* update(() => ({
						selected: Option.some(playlist),
						playingIntent: true,
						error: Option.none(),
					}));
					yield* playOnAnyDevice(playlist.uri);
					yield* spotify.setShuffle(true).pipe(Effect.ignore);
					yield* spotify.setRepeat("context").pipe(Effect.ignore);
					const playback = yield* refresh();
					if (Option.exists(playback, (p) => p.deviceSource === "browser")) {
						yield* Effect.sync(() =>
							channel.postMessage(SdkClaimed.make({ type: "sdk-claimed" })),
						);
					}
				},
				Effect.catch((error) =>
					update(() => ({
						playingIntent: false,
						error: Option.some(playErrorMessage(error)),
					})),
				),
			);

			const toggle = Effect.fn("Playback.toggle")(function* () {
				const current = yield* SubscriptionRef.get(view);
				if (current.isPlaying) {
					yield* update(() => ({ playingIntent: false }));
					yield* spotify.pause.pipe(Effect.ignore);
					yield* refresh();
				} else if (Option.isSome(current.selected)) {
					yield* startPlaylist(current.selected.value);
				}
			});

			const showError = (message: string) =>
				update(() => ({ error: Option.some(message) }));

			const clearTabTookOver = update(() => ({ tabTookOver: false }));

			yield* SubscriptionRef.changes(view).pipe(
				Stream.map((current) => current.tabTookOver),
				Stream.changes,
				Stream.filter((tookOver) => tookOver),
				Stream.runForEach(() =>
					clearTabTookOver.pipe(
						Effect.delay("10 seconds"),
						Effect.forkIn(scope),
					),
				),
				Effect.forkIn(scope),
			);

			return {
				view,
				refresh,
				startPlaylist,
				toggle,
				showError,
				clearError: update(() => ({ error: Option.none() })),
				clearTabTookOver,
				reset: SubscriptionRef.set(view, PlayerView.empty),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
