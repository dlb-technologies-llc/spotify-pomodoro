/**
 * Main application: timer, presets, stats, and Spotify controls.
 *
 * @module
 */
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { Globe, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	clearPlaybackErrorAtom,
	clearTabTookOverAtom,
	connectSpotifyAtom,
	disconnectSpotifyAtom,
	playerAtom,
	playlistsAtom,
	refreshPlaybackAtom,
	resetAtom,
	skipAtom,
	spotifyConnectedAtom,
	startAtom,
	startPlaylistAtom,
	stopAtom,
	themeAtom,
	timerAtom,
	togglePlaybackAtom,
} from "@/client/atoms";
import { cn } from "@/lib/utils";
import type { TimerState } from "@/shared/domain/Timer";
import { PresetSelector } from "./PresetSelector";
import { StatsDialog } from "./StatsDialog";

const PHASE_COLOR = {
	idle: "text-[var(--lofi-idle)]",
	focus: "text-[var(--lofi-focus)]",
	break: "text-[var(--lofi-break)]",
} satisfies Record<TimerState["phase"], string>;

const PHASE_GLOW = {
	idle: "glow-idle",
	focus: "glow-focus",
	break: "glow-break",
} satisfies Record<TimerState["phase"], string>;

const BADGE = {
	overtime: "bg-[var(--lofi-overtime-bg)] text-[var(--lofi-overtime)]",
	focus: "bg-[var(--lofi-focus-bg)] text-[var(--lofi-focus)]",
	break: "bg-[var(--lofi-break-bg)] text-[var(--lofi-break)]",
};

const hint = (state: TimerState) => {
	if (state.status === "running") {
		return state.phase === "focus"
			? "press b to start break · e to end pomodoro"
			: "press f to start focus · e to end pomodoro";
	}
	return state.phase === "idle"
		? "press space to start"
		: "press space to resume · r to reset · e to end";
};

/**
 * Keyboard shortcuts for the timer.
 *
 * @since 2.0.0
 * @category Hooks
 */
function useTimerKeys(state: TimerState | undefined) {
	const start = useAtomSet(startAtom);
	const skip = useAtomSet(skipAtom);
	const stop = useAtomSet(stopAtom);
	const reset = useAtomSet(resetAtom);

	useEffect(() => {
		if (!state) return;
		const running = state.status === "running";
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement) return;
			const act = (action: () => void) => {
				event.preventDefault();
				action();
			};
			switch (event.code) {
				case "Space":
				case "Enter":
					return act(() => !running && start());
				case "KeyR":
					return !running && state.phase !== "idle" && act(() => reset());
				case "KeyB":
					return running && state.phase === "focus" && act(() => skip());
				case "KeyF":
					return running && state.phase === "break" && act(() => skip());
				case "KeyE":
					return state.phase !== "idle" && act(() => stop());
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [state, start, skip, stop, reset]);
}

/**
 * Applies the persisted theme to the document.
 *
 * @since 0.0.1
 * @category Hooks
 */
function useTheme() {
	const [theme, setTheme] = useAtom(themeAtom);
	useEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
	}, [theme]);
	return {
		isDark: theme === "dark",
		toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
	};
}

/**
 * Main pomodoro timer application with Spotify playback controls.
 *
 * @since 0.0.1
 * @category Components
 */
export function App() {
	const theme = useTheme();
	const timer = AsyncResult.getOrElse(useAtomValue(timerAtom), () => undefined);
	useTimerKeys(timer);

	if (!timer) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<span className="text-muted-foreground animate-pulse-soft font-digital text-4xl">
					--:--
				</span>
			</div>
		);
	}

	const [sign, time] = timer.isOvertime
		? ["+", timer.displayTime.slice(1)]
		: ["", timer.displayTime];
	const [minutes = "00", seconds = "00"] = time.split(":");
	const colorClass = timer.isOvertime
		? "text-[var(--lofi-overtime)]"
		: PHASE_COLOR[timer.phase];
	const glowClass = timer.isOvertime
		? "glow-overtime"
		: PHASE_GLOW[timer.phase];
	const badge = timer.isOvertime
		? "overtime"
		: timer.phase === "idle"
			? null
			: timer.phase;

	return (
		<div className="min-h-screen flex flex-col" tabIndex={-1}>
			<div className="noise-overlay" />

			<header className="fixed top-0 right-0 p-5 z-50 flex gap-2">
				<StatsDialog>
					<button
						type="button"
						aria-label="statistics"
						className={cn(
							"w-10 h-10 rounded-xl flex items-center justify-center",
							"bg-card/60 backdrop-blur-sm border border-border",
							"transition-all duration-300 hover:scale-110",
							"text-sm font-medium",
						)}
					>
						📊
					</button>
				</StatsDialog>
				<button
					type="button"
					aria-label="toggle theme"
					onClick={theme.toggle}
					className={cn(
						"w-10 h-10 rounded-xl flex items-center justify-center",
						"bg-card/60 backdrop-blur-sm border border-border",
						"transition-all duration-300 hover:scale-110",
						"text-lg",
					)}
				>
					{theme.isDark ? "☀️" : "🌙"}
				</button>
			</header>

			<main className="flex-1 flex flex-col items-center justify-center px-6">
				<div className="flex flex-col items-center gap-6">
					<PresetSelector config={timer.config} />
					<div
						className={cn(
							"relative px-10 py-8 rounded-2xl bg-card/40 backdrop-blur-sm",
							"border border-border/30",
							"transition-all duration-500",
							glowClass,
						)}
					>
						{badge && (
							<div
								className={cn(
									"absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full text-sm tracking-widest uppercase",
									BADGE[badge],
								)}
							>
								{badge}
							</div>
						)}

						<div
							className={cn(
								"font-digital timer-display tracking-tight",
								colorClass,
							)}
						>
							{sign && <span className="animate-pulse-soft">{sign}</span>}
							<span
								className={cn(
									"digit-transition inline-block text-center",
									minutes.length > 2 ? "w-[2.1em]" : "w-[1.4em]",
								)}
							>
								{minutes}
							</span>
							<span className="mx-1">:</span>
							<span className="digit-transition inline-block w-[1.4em] text-center">
								{seconds}
							</span>
						</div>
					</div>

					<span className="text-muted-foreground/40 text-xs tracking-wide">
						{hint(timer)}
					</span>

					<SpotifyControls />
				</div>
			</main>

			<footer className="py-5 text-center">
				<a
					href="https://github.com/dlb-technologies-llc/spotify-pomodoro"
					target="_blank"
					rel="noopener noreferrer"
					className="text-muted-foreground/30 hover:text-muted-foreground/50 text-xs transition-colors"
				>
					spotify-pomodoro
				</a>
			</footer>

			<PlaybackNotices />
		</div>
	);
}

/**
 * Connect button, or the vinyl, playlist picker, and disconnect control.
 *
 * @since 2.0.0
 * @category Components
 */
function SpotifyControls() {
	const connected = AsyncResult.getOrElse(
		useAtomValue(spotifyConnectedAtom),
		() => false,
	);
	const connect = useAtomSet(connectSpotifyAtom);
	const disconnect = useAtomSet(disconnectSpotifyAtom);
	const refreshPlayback = useAtomSet(refreshPlaybackAtom);
	const startPlaylist = useAtomSet(startPlaylistAtom);
	const toggle = useAtomSet(togglePlaybackAtom);
	const playlists = AsyncResult.getOrElse(
		useAtomValue(playlistsAtom),
		() => [],
	);
	const player = AsyncResult.getOrElse(
		useAtomValue(playerAtom),
		() => undefined,
	);
	const [showPlaylists, setShowPlaylists] = useState(false);

	useEffect(() => {
		if (connected) refreshPlayback();
	}, [connected, refreshPlayback]);

	if (!connected) {
		return (
			<div className="flex items-center gap-4 mt-4">
				<button
					type="button"
					aria-label="connect spotify"
					onClick={() => connect()}
					className={cn(
						"flex items-center gap-2 px-4 py-2 rounded-xl text-sm",
						"bg-[#1DB954]/10 text-[#1DB954]/70 border border-[#1DB954]/20",
						"hover:bg-[#1DB954]/20 hover:text-[#1DB954] transition-all duration-300",
					)}
				>
					<span className="text-base">♪</span>
					<span>spotify</span>
				</button>
			</div>
		);
	}

	const selected = player ? Option.getOrNull(player.selected) : null;
	const spinning = player?.isPlaying ?? false;
	const source = player
		? Option.match(player.playback, {
				onNone: () => null,
				onSome: (playback) => playback.deviceSource,
			})
		: null;

	return (
		<>
			<div className="flex items-center gap-4 mt-4">
				<button
					type="button"
					aria-label={spinning ? "pause" : "play"}
					onClick={() => toggle()}
					disabled={!selected}
					className={cn(
						"relative group transition-transform duration-300",
						selected && "hover:scale-105 cursor-pointer",
						!selected && "opacity-40 cursor-default",
					)}
				>
					<div
						className={cn(
							"w-[4.5rem] h-[4.5rem] rounded-full bg-[var(--lofi-vinyl)] border border-border",
							spinning && "animate-spin-slow",
							!spinning && selected && "animate-spin-slow paused",
						)}
					>
						<div className="absolute inset-1.5 rounded-full border border-[var(--lofi-vinyl-groove)]" />
						<div className="absolute inset-3 rounded-full border border-[var(--lofi-vinyl-groove)]" />
						<div
							className={cn(
								"absolute inset-[18px] rounded-full overflow-hidden",
								"bg-card border border-border flex items-center justify-center",
							)}
						>
							{selected?.imageUrl ? (
								<img
									src={selected.imageUrl}
									alt=""
									className="w-full h-full object-cover"
								/>
							) : (
								<span className="text-muted-foreground/30 text-xs">♪</span>
							)}
						</div>
					</div>
				</button>

				<div className="relative">
					<button
						type="button"
						onClick={() => setShowPlaylists(!showPlaylists)}
						className={cn(
							"flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-base",
							"bg-secondary/30 text-muted-foreground border border-border",
							"hover:bg-secondary/50 hover:text-foreground transition-all duration-300",
						)}
					>
						<span className="truncate max-w-[160px]">
							{selected?.name ?? "playlist"}
						</span>
						<span className="text-xs opacity-50">▼</span>
					</button>

					{showPlaylists && (
						<div
							className={cn(
								"absolute bottom-full mb-2 left-0 w-72",
								"bg-card/95 backdrop-blur-lg rounded-xl",
								"border border-border shadow-xl",
								"overflow-hidden z-50",
							)}
						>
							<div className="max-h-56 overflow-y-auto">
								{playlists.map((playlist) => (
									<button
										type="button"
										key={playlist.id}
										onClick={() => {
											setShowPlaylists(false);
											startPlaylist(playlist);
										}}
										className={cn(
											"w-full flex items-center gap-3 p-3 text-left",
											"hover:bg-secondary/50 transition-colors",
											selected?.id === playlist.id && "bg-primary/10",
										)}
									>
										{playlist.imageUrl ? (
											<img
												src={playlist.imageUrl}
												alt=""
												className="w-10 h-10 rounded object-cover"
											/>
										) : (
											<div className="w-10 h-10 rounded bg-secondary flex items-center justify-center text-muted-foreground/30 text-sm">
												♪
											</div>
										)}
										<span className="truncate text-foreground/80">
											{playlist.name}
										</span>
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				<button
					type="button"
					aria-label="disconnect spotify"
					onClick={() => disconnect()}
					className="text-xs text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
				>
					×
				</button>
			</div>
			{source && (
				<div className="flex items-center gap-1.5 text-muted-foreground/30 text-xs mt-2">
					{source === "browser" ? (
						<>
							<Globe className="w-3 h-3" />
							<span>Browser</span>
						</>
					) : (
						<>
							<Smartphone className="w-3 h-3" />
							<span>External device</span>
						</>
					)}
				</div>
			)}
		</>
	);
}

/**
 * Playback error and tab-takeover toasts.
 *
 * @since 2.0.0
 * @category Components
 */
function PlaybackNotices() {
	const player = AsyncResult.getOrElse(
		useAtomValue(playerAtom),
		() => undefined,
	);
	const clearError = useAtomSet(clearPlaybackErrorAtom);
	const clearTabTookOver = useAtomSet(clearTabTookOverAtom);
	if (!player) return null;

	return (
		<>
			{Option.isSome(player.error) && (
				<div
					role="alert"
					className={cn(
						"fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
						"px-4 py-3 rounded-xl",
						"bg-destructive/10 border border-destructive/20",
						"backdrop-blur-sm shadow-lg",
						"flex items-center gap-3",
					)}
				>
					<span className="text-sm text-destructive">{player.error.value}</span>
					<button
						type="button"
						aria-label="dismiss"
						onClick={() => clearError()}
						className="text-muted-foreground hover:text-foreground transition-colors"
					>
						×
					</button>
				</div>
			)}

			{player.tabTookOver && (
				<output
					className={cn(
						"fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
						"px-4 py-3 rounded-xl",
						"bg-yellow-500/10 border border-yellow-500/20",
						"backdrop-blur-sm shadow-lg",
						"flex items-center gap-3",
					)}
				>
					<span className="text-sm text-yellow-500">
						Playback moved to another tab
					</span>
					<button
						type="button"
						aria-label="dismiss"
						onClick={() => clearTabTookOver()}
						className="text-yellow-500/60 hover:text-yellow-500 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</output>
			)}
		</>
	);
}
