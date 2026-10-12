/**
 * Atoms connecting React components to the browser services.
 *
 * @module
 */
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { DateTime, Effect, Option, Schema, Stream } from "effect";
import { Atom } from "effect/reactivity";
import type { Playlist } from "@/shared/domain/Spotify";
import type { ChimeSound, Settings } from "@/shared/domain/Settings";
import type { NamedPreset } from "@/shared/domain/Timer";
import { ApiClient } from "./ApiClient";
import { AudioNotification } from "./AudioNotification";
import { ClientLive } from "./ClientLive";
import { Playback } from "./Playback";
import { Pomodoro } from "./Pomodoro";
import { SessionRecorder } from "./SessionRecorder";
import { SettingsStore } from "./SettingsStore";
import { SpotifyAuth } from "./SpotifyAuth";
import { SpotifyClient } from "./SpotifyClient";
import { Timer } from "./Timer";

/**
 * Runtime holding every browser service.
 *
 * @since 2.0.0
 * @category Runtime
 */
export const runtime = Atom.runtime(ClientLive).pipe(Atom.keepAlive);

/**
 * Current timer state.
 *
 * @since 2.0.0
 * @category Timer
 */
export const timerAtom = runtime.subscriptionRef(
	Effect.map(Timer, (timer) => timer.state),
);

/**
 * Starts a pomodoro, or resumes a reset phase.
 *
 * @since 2.0.0
 * @category Timer
 */
export const startAtom = runtime.fn(() =>
	Pomodoro.use((pomodoro) => pomodoro.start()),
);

/**
 * Switches between focus and break.
 *
 * @since 2.0.0
 * @category Timer
 */
export const skipAtom = runtime.fn(() =>
	Pomodoro.use((pomodoro) => pomodoro.skip()),
);

/**
 * Ends the pomodoro and returns to idle.
 *
 * @since 2.0.0
 * @category Timer
 */
export const stopAtom = runtime.fn(() =>
	Pomodoro.use((pomodoro) => pomodoro.stop()),
);

/**
 * Restarts the current phase from its full duration.
 *
 * @since 2.0.0
 * @category Timer
 */
export const resetAtom = runtime.fn(() =>
	Pomodoro.use((pomodoro) => pomodoro.reset()),
);

/**
 * Picks focus/break durations.
 *
 * @since 2.0.0
 * @category Timer
 */
export const setPresetAtom = runtime.fn((preset: NamedPreset) =>
	Pomodoro.use((pomodoro) => pomodoro.setPreset(preset)),
);

/**
 * Current settings.
 *
 * @since 2.1.0
 * @category Settings
 */
export const settingsAtom = runtime.subscriptionRef(
	Effect.map(SettingsStore, (store) => store.settings),
);

/**
 * Replaces the settings.
 *
 * @since 2.1.0
 * @category Settings
 */
export const saveSettingsAtom = runtime.fn((next: Settings) =>
	Pomodoro.use((pomodoro) => pomodoro.updateSettings(() => next)),
);

/**
 * Plays a chime so a sound can be previewed.
 *
 * @since 2.1.0
 * @category Settings
 */
export const previewChimeAtom = runtime.fn(
	(chime: { readonly sound: ChimeSound; readonly volume: number }) =>
		AudioNotification.use((audio) => audio.play(chime.sound, chime.volume)),
);

/**
 * What the current and next pomodoros are labelled with.
 *
 * @since 2.1.0
 * @category Timer
 */
export const labelAtom = runtime.atom(
	Stream.unwrap(Effect.map(SessionRecorder, (recorder) => recorder.label)),
);

/**
 * Sets the label, updating the pomodoro in progress.
 *
 * @since 2.1.0
 * @category Timer
 */
export const relabelAtom = runtime.fn((label: string) =>
	Pomodoro.use((pomodoro) => {
		const trimmed = label.trim();
		return pomodoro.relabel(
			trimmed === "" ? Option.none() : Option.some(trimmed.slice(0, 120)),
		);
	}),
);

const viewerTimeZone = () =>
	Option.getOrUndefined(
		DateTime.zoneMakeNamed(Intl.DateTimeFormat().resolvedOptions().timeZone),
	);

/**
 * Pomodoros completed today, refreshed whenever one completes.
 *
 * @since 2.1.0
 * @category Stats
 */
export const todayCountAtom = runtime.atom(
	Stream.unwrap(
		Effect.gen(function* () {
			const api = yield* ApiClient;
			const recorder = yield* SessionRecorder;
			return Stream.concat(Stream.make(undefined), recorder.completed).pipe(
				Stream.mapEffect(() =>
					api.sessions
						.stats({ query: { tz: viewerTimeZone() } })
						.pipe(Effect.map((stats) => stats.today.pomodoros)),
				),
			);
		}),
	),
);

/**
 * Whether a Spotify token is stored.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const spotifyConnectedAtom = runtime.atom(
	Stream.unwrap(Effect.map(SpotifyAuth, (auth) => auth.connectedChanges)),
);

/**
 * Sends the browser to Spotify's consent page.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const connectSpotifyAtom = runtime.fn(() =>
	Effect.sync(() => window.location.assign("/api/spotify/authorize")),
);

/**
 * Forgets the Spotify token and clears the player.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const disconnectSpotifyAtom = runtime.fn(() =>
	Effect.gen(function* () {
		yield* (yield* SpotifyAuth).disconnect();
		yield* (yield* Playback).reset;
	}),
);

/**
 * The user's playlists, loaded once connected.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const playlistsAtom = runtime.atom((get) =>
	Effect.gen(function* () {
		const connected = yield* get.result(spotifyConnectedAtom);
		if (!connected) return [];
		return yield* (yield* SpotifyClient).playlists;
	}),
);

/**
 * What the player shows: playback, selection, and notices.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const playerAtom = runtime.subscriptionRef(
	Effect.map(Playback, (playback) => playback.view),
);

/**
 * Reloads playback state once connected.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const refreshPlaybackAtom = runtime.fn(() =>
	Playback.use((playback) => playback.refresh()),
);

/**
 * Starts a playlist with shuffle and repeat on.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const startPlaylistAtom = runtime.fn((playlist: Playlist) =>
	Playback.use((playback) => playback.startPlaylist(playlist)),
);

/**
 * Spotify devices on the account; refresh to reload.
 *
 * @since 2.1.0
 * @category Spotify
 */
export const devicesAtom = runtime.atom(
	SpotifyClient.use((client) => client.devices),
);

/**
 * Moves playback to a device and remembers it.
 *
 * @since 2.1.0
 * @category Spotify
 */
export const selectDeviceAtom = runtime.fn((deviceId: string) =>
	Playback.use((playback) => playback.selectDevice(deviceId)),
);

/**
 * Skips to the next track.
 *
 * @since 2.1.0
 * @category Spotify
 */
export const nextTrackAtom = runtime.fn(() =>
	Playback.use((playback) => playback.next),
);

/**
 * Goes back to the previous track.
 *
 * @since 2.1.0
 * @category Spotify
 */
export const previousTrackAtom = runtime.fn(() =>
	Playback.use((playback) => playback.previous),
);

/**
 * Sets the Spotify volume, in percent.
 *
 * @since 2.1.0
 * @category Spotify
 */
export const setVolumeAtom = runtime.fn((percent: number) =>
	Playback.use((playback) => playback.setVolume(percent)),
);

/**
 * Pins or unpins a playlist at the top of the picker.
 *
 * @since 2.1.0
 * @category Spotify
 */
export const togglePinAtom = runtime.fn((playlistId: string) =>
	Playback.use((playback) => playback.togglePin(playlistId)),
);

/**
 * Pauses, or resumes the selected playlist.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const togglePlaybackAtom = runtime.fn(() =>
	Playback.use((playback) => playback.toggle()),
);

/**
 * Dismisses the playback error.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const clearPlaybackErrorAtom = runtime.fn(() =>
	Playback.use((playback) => playback.clearError),
);

/**
 * Dismisses the "playback moved to another tab" notice.
 *
 * @since 2.0.0
 * @category Spotify
 */
export const clearTabTookOverAtom = runtime.fn(() =>
	Playback.use((playback) => playback.clearTabTookOver),
);

/**
 * Statistics in the browser's time zone; refresh to reload.
 *
 * @since 2.0.0
 * @category Stats
 */
export const statsAtom = runtime.atom(
	Effect.gen(function* () {
		const api = yield* ApiClient;
		return yield* api.sessions.stats({ query: { tz: viewerTimeZone() } });
	}),
);

/**
 * Color theme.
 *
 * @since 2.0.0
 * @category Theme
 */
export const Theme = Schema.Literals(["light", "dark"]);

/**
 * Persisted color theme, defaulting to the system preference.
 *
 * @since 0.0.1
 * @category Theme
 */
export const themeAtom = Atom.kvs({
	runtime: Atom.runtime(BrowserKeyValueStore.layerLocalStorage),
	key: "lofi-pomodoro-theme",
	schema: Theme,
	defaultValue: () =>
		window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light",
});
