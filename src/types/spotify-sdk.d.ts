interface WebPlaybackError {
	message: string;
}

interface WebPlaybackTrack {
	uri: string;
	id: string;
	name: string;
	duration_ms: number;
	artists: Array<{ name: string; uri: string }>;
	album: {
		name: string;
		uri: string;
		images: Array<{ url: string; height: number; width: number }>;
	};
}

interface WebPlaybackState {
	context: {
		uri: string | null;
		metadata: Record<string, unknown> | null;
	};
	disallows: Record<string, boolean>;
	paused: boolean;
	position: number;
	duration: number;
	repeat_mode: number;
	shuffle: boolean;
	track_window: {
		current_track: WebPlaybackTrack;
		previous_tracks: WebPlaybackTrack[];
		next_tracks: WebPlaybackTrack[];
	};
}

interface SpotifyPlayerOptions {
	name: string;
	getOAuthToken: (callback: (token: string) => void) => void;
	volume?: number;
}

interface SpotifyPlayer {
	connect(): Promise<boolean>;
	disconnect(): void;
	addListener(
		event: "ready" | "not_ready",
		callback: (data: { device_id: string }) => void,
	): void;
	addListener(
		event: "player_state_changed",
		callback: (state: WebPlaybackState | null) => void,
	): void;
	addListener(
		event:
			| "initialization_error"
			| "authentication_error"
			| "account_error"
			| "playback_error",
		callback: (error: WebPlaybackError) => void,
	): void;
	addListener(event: "autoplay_failed", callback: () => void): void;
	removeListener(event: string, callback?: (...args: unknown[]) => void): void;
	getCurrentState(): Promise<WebPlaybackState | null>;
	togglePlay(): Promise<void>;
	pause(): Promise<void>;
	resume(): Promise<void>;
	getVolume(): Promise<number>;
	setVolume(volume: number): Promise<void>;
	seek(positionMs: number): Promise<void>;
	previousTrack(): Promise<void>;
	nextTrack(): Promise<void>;
	activateElement(): Promise<void>;
}

declare global {
	interface Window {
		Spotify: {
			Player: new (options: SpotifyPlayerOptions) => SpotifyPlayer;
		};
		onSpotifyWebPlaybackSDKReady: (() => void) | undefined;
	}
}

export {};
