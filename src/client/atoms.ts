/**
 * Atoms connecting React components to the browser services.
 *
 * @module
 */
import { BrowserKeyValueStore } from "@effect/platform-browser";
import { DateTime, Effect, Option, Schema, Stream } from "effect";
import { Atom } from "effect/reactivity";
import type { Playlist } from "@/shared/domain/Spotify";
import { ExportFile } from "@/shared/domain/History";
import type { PomodoroId } from "@/shared/domain/Session";
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
import { Toasts } from "./Toasts";

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
	Pomodoro.use((pomodoro) => pomodoro.updateSettings(() => next)).pipe(
		Effect.andThen(
			Toasts.use((toasts) => toasts.show("success", "Settings saved")),
		),
	),
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
 * Recording calls waiting for the server, e.g. while offline.
 *
 * @since 2.1.0
 * @category Stats
 */
export const pendingSyncAtom = runtime.atom(
	Stream.unwrap(
		Effect.map(SessionRecorder, (recorder) => recorder.pendingCount),
	),
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
 * Messages currently on screen.
 *
 * @since 2.1.0
 * @category Toasts
 */
export const toastsAtom = runtime.subscriptionRef(
	Effect.map(Toasts, (toasts) => toasts.toasts),
);

/**
 * Removes a message.
 *
 * @since 2.1.0
 * @category Toasts
 */
export const dismissToastAtom = runtime.fn((id: number) =>
	Toasts.use((toasts) => toasts.dismiss(id)),
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
 * The most recent page of history; refresh to reload.
 *
 * @since 2.1.0
 * @category Stats
 */
export const historyFirstPageAtom = runtime.atom(
	ApiClient.use((api) => api.data.history({ query: { limit: 30 } })),
);

/**
 * Loads a page of history, newest first, before an epoch-ms cursor.
 *
 * @since 2.1.0
 * @category Stats
 */
export const historyPageAtom = runtime.fn((before: number | undefined) =>
	ApiClient.use((api) => api.data.history({ query: { before, limit: 30 } })),
);

/**
 * Deletes a pomodoro and its sessions.
 *
 * @since 2.1.0
 * @category Stats
 */
export const deletePomodoroAtom = runtime.fn((id: PomodoroId) =>
	ApiClient.use((api) => api.sessions.deletePomodoro({ params: { id } })),
);

/**
 * Changes a past pomodoro's label; blank clears it.
 *
 * @since 2.1.0
 * @category Stats
 */
export const labelPastPomodoroAtom = runtime.fn(
	(change: { readonly id: PomodoroId; readonly label: string }) =>
		ApiClient.use((api) => {
			const trimmed = change.label.trim().slice(0, 120);
			return api.sessions.labelPomodoro({
				params: { id: change.id },
				payload: { label: trimmed === "" ? null : trimmed },
			});
		}),
);

const decodeExportFile = Schema.decodeUnknownEffect(
	Schema.fromJsonString(ExportFile),
);

/**
 * Imports a previously exported JSON file.
 *
 * @since 2.1.0
 * @category Stats
 */
export const importDataAtom = runtime.fn((text: string) =>
	Effect.gen(function* () {
		const file = yield* decodeExportFile(text);
		const api = yield* ApiClient;
		return yield* api.data.import({ payload: file });
	}),
);

/**
 * Whether the first-run walkthrough has been seen.
 *
 * @since 2.1.0
 * @category Onboarding
 */
export const onboardedAtom = Atom.kvs({
	runtime: Atom.runtime(BrowserKeyValueStore.layerLocalStorage),
	key: "pomodoro_onboarded",
	schema: Schema.Boolean,
	defaultValue: () => false,
});

/**
 * Theme preference: follow the system, or a fixed choice.
 *
 * @since 2.1.0
 * @category Theme
 */
export const ThemePreference = Schema.Literals(["system", "light", "dark"]);

/**
 * @since 2.1.0
 * @category Theme
 */
export type ThemePreference = typeof ThemePreference.Type;

/**
 * Storage key for the theme preference; also read by the inline script that
 * applies the theme before the app loads.
 *
 * @since 2.1.0
 * @category Theme
 */
export const THEME_STORAGE_KEY = "lofi-pomodoro-theme";

/**
 * Persisted theme preference, following the system by default.
 *
 * @since 0.0.1
 * @category Theme
 */
export const themePreferenceAtom = Atom.kvs({
	runtime: Atom.runtime(BrowserKeyValueStore.layerLocalStorage),
	key: THEME_STORAGE_KEY,
	schema: ThemePreference,
	defaultValue: (): ThemePreference => "system",
});

/**
 * Whether the system prefers a dark theme, updated live.
 *
 * @since 2.1.0
 * @category Theme
 */
export const systemDarkAtom = Atom.make((get) => {
	const query = window.matchMedia("(prefers-color-scheme: dark)");
	const onChange = (event: MediaQueryListEvent) => get.setSelf(event.matches);
	query.addEventListener("change", onChange);
	get.addFinalizer(() => query.removeEventListener("change", onChange));
	return query.matches;
});

/**
 * The theme in effect.
 *
 * @since 2.1.0
 * @category Theme
 */
export const themeAtom = Atom.make((get) => {
	const preference = get(themePreferenceAtom);
	if (preference !== "system") return preference;
	return get(systemDarkAtom) ? "dark" : "light";
});
