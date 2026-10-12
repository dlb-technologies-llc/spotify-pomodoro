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
	Predicate,
	Ref,
	Schedule,
	Schema,
	SubscriptionRef,
} from "effect";
import {
	BROWSER_DEVICE_NAME,
	type NoActiveDevice,
	PlaybackState,
	Playlist,
	PlayRequest,
	type PremiumRequired,
	type SdkUnavailable,
	type SpotifyApiError,
	type SpotifyDevice,
	type SpotifyNotConnected,
	type SpotifyUnavailable,
} from "@/shared/domain/Spotify";
import { MusicSettings, Settings } from "@/shared/domain/Settings";
import { SettingsStore } from "./SettingsStore";
import { Toasts } from "./Toasts";
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

const playErrorMessage = (
	error:
		| NoActiveDevice
		| PremiumRequired
		| SdkUnavailable
		| SpotifyApiError
		| SpotifyNotConnected
		| SpotifyUnavailable,
) => {
	switch (error._tag) {
		case "PremiumRequired":
			return "Spotify Premium required for browser playback. Open Spotify on another device instead.";
		case "SdkUnavailable":
			return `Browser player unavailable (${error.reason}: ${error.message}). Open Spotify on your phone or computer.`;
		case "SpotifyNotConnected":
			return "Spotify session expired, reconnect Spotify";
		case "SpotifyUnavailable":
			return "Spotify is unreachable right now, try again in a moment";
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
			const settings = yield* SettingsStore;
			const toasts = yield* Toasts;
			const { music } = yield* settings.get;
			const view = yield* SubscriptionRef.make(
				new PlayerView({ ...PlayerView.empty, selected: music.focusPlaylist }),
			);
			const lastDeviceId = yield* Ref.make(music.deviceId);
			const scope = yield* Effect.scope;

			const saveMusic = (
				f: (current: MusicSettings) => Partial<MusicSettings>,
			) =>
				settings.update(
					(current) =>
						new Settings({
							...current,
							music: new MusicSettings({
								...current.music,
								...f(current.music),
							}),
						}),
				);

			const rememberDevice = (deviceId: string) =>
				Ref.getAndSet(lastDeviceId, Option.some(deviceId)).pipe(
					Effect.flatMap((previous) =>
						Option.contains(previous, deviceId)
							? Effect.void
							: saveMusic(() => ({ deviceId: Option.some(deviceId) })),
					),
				);

			const update = (f: (current: PlayerView) => Partial<PlayerView>) =>
				SubscriptionRef.update(
					view,
					(current) => new PlayerView({ ...current, ...f(current) }),
				);

			const channel = yield* Effect.acquireRelease(
				Effect.sync(() => new BroadcastChannel(SDK_CHANNEL)),
				(open) => Effect.sync(() => open.close()),
			);

			const runFork = yield* FiberSet.makeRuntime();
			const onClaimed = Effect.gen(function* () {
				const current = yield* SubscriptionRef.get(view);
				if (
					!Option.exists(current.playback, (p) => p.deviceSource === "browser")
				)
					return;
				yield* update(() => ({
					playback: Option.none(),
					playingIntent: false,
				}));
				yield* toasts.show("info", "Playback moved to another tab");
			});
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
				const deviceId = Option.flatMap(playback, (p) =>
					Option.fromNullOr(p.deviceId),
				);
				if (Option.isSome(deviceId)) yield* rememberDevice(deviceId.value);
				yield* update(() => ({ playback }));
				return playback;
			});

			const playOnAnyDevice = Effect.fn("Playback.playOnAnyDevice")(function* (
				contextUri: string,
			) {
				const saved = yield* Ref.get(lastDeviceId);
				const playOn = (deviceId: Option.Option<string>) =>
					spotify.play(
						new PlayRequest({
							contextUri,
							deviceId: Option.getOrUndefined(deviceId),
						}),
					);
				yield* playOn(saved).pipe(
					Effect.catchIf(
						(error) =>
							Option.isSome(saved) &&
							error._tag === "SpotifyApiError" &&
							error.status === 404,
						() =>
							Ref.set(lastDeviceId, Option.none()).pipe(
								Effect.andThen(playOn(Option.none())),
							),
					),
					Effect.catchTag("NoActiveDevice", () =>
						Effect.gen(function* () {
							const available = yield* spotify.devices.pipe(
								Effect.orElseSucceed((): ReadonlyArray<SpotifyDevice> => []),
							);
							const idle = available.find(
								(device) => device.name !== BROWSER_DEVICE_NAME,
							);
							if (idle) {
								yield* Effect.logInfo("Waking idle Spotify device", {
									device: idle.name,
								});
								return yield* playOn(Option.some(idle.id));
							}
							const sdkDeviceId = yield* sdk.ensureDevice;
							return yield* playOn(Option.some(sdkDeviceId));
						}),
					),
				);
			});

			const startPlaylist = Effect.fn("Playback.startPlaylist")(
				function* (playlist: Playlist, remember = true) {
					if (remember) {
						yield* saveMusic(() => ({ focusPlaylist: Option.some(playlist) }));
					}
					yield* update(() => ({
						selected: Option.some(playlist),
						playingIntent: true,
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
				Effect.tapCause((cause) =>
					Effect.logWarning("Playback failed to start", cause),
				),
				Effect.catch((error) =>
					update(() => ({ playingIntent: false })).pipe(
						Effect.andThen(toasts.show("error", playErrorMessage(error))),
					),
				),
			);

			const pauseMusic = Effect.gen(function* () {
				yield* update(() => ({ playingIntent: false }));
				yield* spotify.pause.pipe(Effect.ignore);
				yield* refresh();
			}).pipe(Effect.withSpan("Playback.pause"));

			const resumeMusic = Effect.gen(function* () {
				yield* update(() => ({ playingIntent: true }));
				yield* spotify.resume.pipe(Effect.ignore);
				yield* refresh();
			}).pipe(Effect.withSpan("Playback.resume"));

			const toggle = Effect.fn("Playback.toggle")(function* () {
				const current = yield* SubscriptionRef.get(view);
				if (current.isPlaying) {
					yield* update(() => ({ playingIntent: false }));
					yield* spotify.pause.pipe(Effect.ignore);
					yield* refresh();
				} else if (Option.isSome(current.selected)) {
					yield* startPlaylist(current.selected.value);
				} else if (Option.isSome(current.playback)) {
					yield* resumeMusic;
				}
			});

			const fadeTo = Effect.fn("Playback.fadeTo")(function* (target: number) {
				const playback = yield* refresh();
				const from = Option.getOrElse(
					Option.flatMap(playback, (p) => Option.fromNullOr(p.volumePercent)),
					() => target,
				);
				const steps = 5;
				for (let step = 1; step <= steps; step++) {
					yield* spotify
						.setVolume(from + ((target - from) * step) / steps)
						.pipe(Effect.ignore);
					if (step < steps) yield* Effect.sleep("300 millis");
				}
				return from;
			});

			const selectDevice = Effect.fn("Playback.selectDevice")(
				function* (deviceId: string) {
					const current = yield* SubscriptionRef.get(view);
					yield* spotify.transfer(deviceId, current.isPlaying);
					yield* rememberDevice(deviceId);
					yield* Effect.sleep("500 millis");
					yield* refresh();
				},
				Effect.catch((error) => toasts.show("error", playErrorMessage(error))),
			);

			const skipTrack = (direction: "next" | "previous") =>
				spotify[direction].pipe(
					Effect.ignore,
					Effect.andThen(Effect.sleep("400 millis")),
					Effect.andThen(refresh()),
					Effect.asVoid,
				);

			const setVolume = (percent: number) =>
				spotify.setVolume(percent).pipe(
					Effect.ignore,
					Effect.andThen(
						update((current) => ({
							playback: Option.map(
								current.playback,
								(p) => new PlaybackState({ ...p, volumePercent: percent }),
							),
						})),
					),
				);

			const togglePin = (playlistId: string) =>
				saveMusic((current) => ({
					pinned: current.pinned.includes(playlistId)
						? current.pinned.filter((id) => id !== playlistId)
						: [...current.pinned, playlistId],
				}));

			yield* refresh().pipe(
				Effect.when(
					Effect.sync(
						() =>
							Predicate.hasProperty(globalThis, "document") &&
							document.visibilityState === "visible",
					),
				),
				Effect.repeat(Schedule.spaced("5 seconds")),
				Effect.delay("5 seconds"),
				Effect.forkIn(scope),
			);

			const showError = (message: string) => toasts.show("error", message);

			return {
				view,
				refresh,
				startPlaylist,
				toggle,
				pauseMusic,
				resumeMusic,
				fadeTo,
				selectDevice,
				next: skipTrack("next"),
				previous: skipTrack("previous"),
				setVolume,
				togglePin,
				showError,
				reset: SubscriptionRef.set(view, PlayerView.empty),
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
