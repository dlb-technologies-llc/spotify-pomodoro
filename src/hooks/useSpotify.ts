/**
 * React hooks for Spotify authentication and playback.
 *
 * @module
 */

import { Effect, Option } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { runEffect } from "../effect/runtime";
import type { PlaybackState, Playlist } from "../effect/schema/Playlist";
import { SpotifyAuth } from "../effect/services/SpotifyAuth";
import { SpotifyClient } from "../effect/services/SpotifyClient";

/**
 * Hook for Spotify OAuth authentication.
 *
 * @since 0.0.1
 * @category Hooks
 */
export function useSpotifyAuth() {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const tokenParam = params.get("token");

		if (tokenParam) {
			try {
				const token = JSON.parse(decodeURIComponent(tokenParam));
				localStorage.setItem("spotify_token", JSON.stringify(token));
				window.history.replaceState({}, "", "/");
			} catch {
				console.error("Failed to parse token from URL");
			}
		}

		runEffect(
			Effect.gen(function* () {
				const auth = yield* SpotifyAuth;
				return yield* auth.restoreToken();
			}),
		)
			.then((maybeToken) => {
				setIsAuthenticated(Option.isSome(maybeToken));
				setIsLoading(false);
			})
			.catch(() => setIsLoading(false));
	}, []);

	const login = useCallback(async () => {
		const response = await fetch("/api/auth/init");
		const { authUrl } = await response.json();
		window.location.href = authUrl;
	}, []);

	const logout = useCallback(async () => {
		await runEffect(
			Effect.gen(function* () {
				const auth = yield* SpotifyAuth;
				yield* auth.logout();
			}),
		);
		setIsAuthenticated(false);
	}, []);

	return {
		isAuthenticated,
		isLoading,
		login,
		logout,
	};
}

/**
 * Hook for fetching user playlists.
 *
 * @since 0.0.1
 * @category Hooks
 */
export function useSpotifyPlaylists() {
	const [playlists, setPlaylists] = useState<Playlist[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchPlaylists = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await runEffect(
				Effect.gen(function* () {
					const client = yield* SpotifyClient;
					return yield* client.getPlaylists();
				}),
			);
			setPlaylists(result as Playlist[]);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to fetch playlists");
		} finally {
			setIsLoading(false);
		}
	}, []);

	return {
		playlists,
		isLoading,
		error,
		fetchPlaylists,
	};
}

/**
 * Hook for controlling Spotify playback.
 *
 * @since 0.0.1
 * @category Hooks
 */
export function useSpotifyPlayback() {
	const [playbackState, setPlaybackState] = useState<PlaybackState | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [lastDeviceId, setLastDeviceId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [deviceSource, setDeviceSource] = useState<"remote" | "browser" | null>(
		null,
	);
	const [tabTookOver, setTabTookOver] = useState(false);

	const clearTabTookOver = useCallback(() => setTabTookOver(false), []);

	const broadcastRef = useRef<BroadcastChannel | null>(null);
	const deviceSourceRef = useRef(deviceSource);
	deviceSourceRef.current = deviceSource;

	const clearError = useCallback(() => setError(null), []);

	useEffect(() => {
		const channel = new BroadcastChannel("spotify-pomodoro-sdk");
		broadcastRef.current = channel;

		channel.onmessage = (event: MessageEvent) => {
			if (
				event.data?.type === "sdk-claimed" &&
				deviceSourceRef.current === "browser"
			) {
				setTabTookOver(true);
				setDeviceSource(null);
			}
		};

		return () => {
			channel.close();
			broadcastRef.current = null;
		};
	}, []);

	const fetchPlaybackState = useCallback(async () => {
		setIsLoading(true);
		try {
			const result = (await runEffect(
				Effect.gen(function* () {
					const client = yield* SpotifyClient;
					return yield* client.getPlaybackState();
				}),
			)) as PlaybackState | null;
			setPlaybackState(result);
			if (result?.deviceId) {
				setLastDeviceId(result.deviceId);
			}
			let source: "remote" | "browser" | null = null;
			if (result?.deviceName) {
				source =
					result.deviceName === "Spotify Pomodoro" ? "browser" : "remote";
				setDeviceSource(source);
			} else {
				setDeviceSource(null);
			}
			return source;
		} catch {
			/** Ignore errors - user might not have an active device */
			return null;
		} finally {
			setIsLoading(false);
		}
	}, []);

	const play = useCallback(
		async (options?: { contextUri?: string; uris?: string[] }) => {
			setError(null);
			try {
				const deviceId = playbackState?.deviceId ?? lastDeviceId ?? undefined;
				await runEffect(
					Effect.gen(function* () {
						const client = yield* SpotifyClient;
						return yield* client.play({ ...options, deviceId });
					}),
				);
				const newSource = await fetchPlaybackState();
				if (newSource === "browser") {
					broadcastRef.current?.postMessage({ type: "sdk-claimed" });
				}
			} catch (e: unknown) {
				if (e && typeof e === "object" && "_tag" in e) {
					const tagged = e as { _tag: string };
					if (tagged._tag === "PremiumRequiredError") {
						setError(
							"Spotify Premium required for browser playback. Open Spotify on another device instead.",
						);
					} else if (tagged._tag === "SdkUnavailableError") {
						setError(
							"Browser player unavailable. Open Spotify on your phone or computer.",
						);
					} else {
						setError("Open Spotify on your phone or computer first");
					}
				} else {
					setError("Open Spotify on your phone or computer first");
				}
			}
		},
		[fetchPlaybackState, playbackState?.deviceId, lastDeviceId],
	);

	const pause = useCallback(async () => {
		await runEffect(
			Effect.gen(function* () {
				const client = yield* SpotifyClient;
				return yield* client.pause();
			}),
		);
		await fetchPlaybackState();
	}, [fetchPlaybackState]);

	const setShuffle = useCallback(async (state: boolean) => {
		await runEffect(
			Effect.gen(function* () {
				const client = yield* SpotifyClient;
				return yield* client.setShuffle(state);
			}),
		);
	}, []);

	const setRepeat = useCallback(async (state: "off" | "context" | "track") => {
		await runEffect(
			Effect.gen(function* () {
				const client = yield* SpotifyClient;
				return yield* client.setRepeat(state);
			}),
		);
	}, []);

	return {
		playbackState,
		isLoading,
		error,
		clearError,
		deviceSource,
		tabTookOver,
		clearTabTookOver,
		fetchPlaybackState,
		play,
		pause,
		setShuffle,
		setRepeat,
	};
}
