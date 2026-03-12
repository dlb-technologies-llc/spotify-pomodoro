/**
 * Main application component with timer and Spotify integration.
 *
 * @module
 */

import { Globe, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Playlist } from "../effect/schema/Playlist";
import {
	useSpotifyAuth,
	useSpotifyPlayback,
	useSpotifyPlaylists,
} from "../hooks/useSpotify";
import { useTheme } from "../hooks/useTheme";
import { useTimer } from "../hooks/useTimer";
import { cn } from "../lib/utils";
import { PresetSelector } from "./PresetSelector";
import { StatsDialog } from "./StatsDialog";

/**
 * Main pomodoro timer application with Spotify playback controls.
 *
 * @since 0.0.1
 * @category Components
 */
export function App() {
	const { toggleTheme, isDark } = useTheme();
	const { state, start, reset, skip, stop } = useTimer();
	const { isAuthenticated, login, logout } = useSpotifyAuth();
	const { playlists, fetchPlaylists } = useSpotifyPlaylists();
	const {
		playbackState,
		fetchPlaybackState,
		play,
		pause: pauseMusic,
		setShuffle,
		setRepeat,
		error: playbackError,
		clearError,
		deviceSource,
		tabTookOver,
		clearTabTookOver,
	} = useSpotifyPlayback();

	const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
		null,
	);
	const [showPlaylists, setShowPlaylists] = useState(false);
	const [isPlayingIntent, setIsPlayingIntent] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const isRunning = state?.status === "running";
	const isOvertime = state?.isOvertime ?? false;
	const phase = state?.phase ?? "idle";
	const isPlaying = playbackState?.isPlaying ?? false;

	const displayTime = state?.displayTime ?? "25:00";
	const [sign, timeWithoutSign] = displayTime.startsWith("+")
		? ["+", displayTime.slice(1)]
		: ["", displayTime];
	const [minutes, seconds] = timeWithoutSign.split(":");

	useEffect(() => {
		if (isAuthenticated) {
			fetchPlaylists();
			fetchPlaybackState();
		}
	}, [isAuthenticated, fetchPlaylists, fetchPlaybackState]);

	useEffect(() => {
		if (playbackState) {
			setIsPlayingIntent(playbackState.isPlaying);
		}
	}, [playbackState]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement) return;

			if (e.code === "Space" || e.code === "Enter") {
				e.preventDefault();
				if (!isRunning) {
					start();
				}
			} else if (e.code === "KeyR" && !isRunning && phase !== "idle") {
				e.preventDefault();
				reset();
			} else if (e.code === "KeyB" && phase === "focus" && isRunning) {
				e.preventDefault();
				skip();
			} else if (e.code === "KeyF" && phase === "break" && isRunning) {
				e.preventDefault();
				skip();
			} else if (e.code === "KeyE" && phase !== "idle") {
				e.preventDefault();
				stop();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isRunning, phase, start, reset, skip, stop]);

	useEffect(() => {
		if (!tabTookOver) return;
		const timeout = setTimeout(() => clearTabTookOver(), 10_000);
		return () => clearTimeout(timeout);
	}, [tabTookOver, clearTabTookOver]);

	const handlePlaylistSelect = async (playlist: Playlist) => {
		setSelectedPlaylist(playlist);
		setShowPlaylists(false);
		setIsPlayingIntent(true);
		await play({ contextUri: playlist.uri });
		await setShuffle(true);
		await setRepeat("context");
	};

	const handlePlayPause = async () => {
		if (isPlaying || isPlayingIntent) {
			setIsPlayingIntent(false);
			await pauseMusic();
		} else if (selectedPlaylist) {
			setIsPlayingIntent(true);
			await play({ contextUri: selectedPlaylist.uri });
		}
	};

	const colorClass = isOvertime
		? "text-[var(--lofi-overtime)]"
		: phase === "focus"
			? "text-[var(--lofi-focus)]"
			: phase === "break"
				? "text-[var(--lofi-break)]"
				: "text-[var(--lofi-idle)]";

	const glowClass = isOvertime
		? "glow-overtime"
		: phase === "focus"
			? "glow-focus"
			: phase === "break"
				? "glow-break"
				: "glow-idle";

	if (!state) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<span className="text-muted-foreground animate-pulse-soft font-digital text-4xl">
					--:--
				</span>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="min-h-screen flex flex-col"
			tabIndex={-1}
		>
			<div className="noise-overlay" />

			<header className="fixed top-0 right-0 p-5 z-50 flex gap-2">
				<StatsDialog>
					<button
						type="button"
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
					onClick={toggleTheme}
					className={cn(
						"w-10 h-10 rounded-xl flex items-center justify-center",
						"bg-card/60 backdrop-blur-sm border border-border",
						"transition-all duration-300 hover:scale-110",
						"text-lg",
					)}
				>
					{isDark ? "☀️" : "🌙"}
				</button>
			</header>

			<main className="flex-1 flex flex-col items-center justify-center px-6">
				<div className="flex flex-col items-center gap-6">
					<PresetSelector />
					<div
						className={cn(
							"relative px-10 py-8 rounded-2xl bg-card/40 backdrop-blur-sm",
							"border border-border/30",
							"transition-all duration-500",
							glowClass,
						)}
					>
						{isOvertime ? (
							<div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-[var(--lofi-overtime-bg)] text-[var(--lofi-overtime)] text-sm tracking-widest uppercase">
								overtime
							</div>
						) : phase === "focus" ? (
							<div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-[var(--lofi-focus-bg)] text-[var(--lofi-focus)] text-sm tracking-widest uppercase">
								focus
							</div>
						) : phase === "break" ? (
							<div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-[var(--lofi-break-bg)] text-[var(--lofi-break)] text-sm tracking-widest uppercase">
								break
							</div>
						) : null}

						<div
							className={cn(
								"font-digital timer-display tracking-tight",
								colorClass,
							)}
						>
							{sign && <span className="animate-pulse-soft">{sign}</span>}

							<span className="digit-transition inline-block w-[1.4em] text-center">
								{minutes}
							</span>

							<span className="mx-1">:</span>

							<span className="digit-transition inline-block w-[1.4em] text-center">
								{seconds}
							</span>
						</div>
					</div>

					<span className="text-muted-foreground/40 text-xs tracking-wide">
						{isRunning
							? phase === "focus"
								? "press b to start break · e to end pomodoro"
								: "press f to start focus · e to end pomodoro"
							: phase === "idle"
								? "press space to start"
								: "press space to resume · r to reset · e to end"}
					</span>

					<div className="flex items-center gap-4 mt-4">
						{!isAuthenticated ? (
							<button
								type="button"
								onClick={login}
								className={cn(
									"flex items-center gap-2 px-4 py-2 rounded-xl text-sm",
									"bg-[#1DB954]/10 text-[#1DB954]/70 border border-[#1DB954]/20",
									"hover:bg-[#1DB954]/20 hover:text-[#1DB954] transition-all duration-300",
								)}
							>
								<span className="text-base">♪</span>
								<span>spotify</span>
							</button>
						) : (
							<>
								<button
									type="button"
									onClick={handlePlayPause}
									disabled={!selectedPlaylist}
									className={cn(
										"relative group transition-transform duration-300",
										selectedPlaylist && "hover:scale-105 cursor-pointer",
										!selectedPlaylist && "opacity-40 cursor-default",
									)}
								>
									<div
										className={cn(
											"w-[4.5rem] h-[4.5rem] rounded-full bg-[var(--lofi-vinyl)] border border-border",
											(isPlaying || isPlayingIntent) && "animate-spin-slow",
											!isPlaying &&
												!isPlayingIntent &&
												selectedPlaylist &&
												"animate-spin-slow paused",
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
											{selectedPlaylist?.images[0] ? (
												<img
													src={selectedPlaylist.images[0].url}
													alt=""
													className="w-full h-full object-cover"
												/>
											) : (
												<span className="text-muted-foreground/30 text-xs">
													♪
												</span>
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
											{selectedPlaylist?.name ?? "playlist"}
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
														onClick={() => handlePlaylistSelect(playlist)}
														className={cn(
															"w-full flex items-center gap-3 p-3 text-left",
															"hover:bg-secondary/50 transition-colors",
															selectedPlaylist?.id === playlist.id &&
																"bg-primary/10",
														)}
													>
														{playlist.images[0] ? (
															<img
																src={playlist.images[0].url}
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
									onClick={logout}
									className="text-xs text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
								>
									×
								</button>
							</>
						)}
					</div>
					{isAuthenticated && deviceSource && (
						<div className="flex items-center gap-1.5 text-muted-foreground/30 text-xs mt-2">
							{deviceSource === "browser" ? (
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
				</div>
			</main>

			<footer className="py-5 text-center">
				<a
					href="https://github.com/davidlbowman/spotify-pomodoro"
					target="_blank"
					rel="noopener noreferrer"
					className="text-muted-foreground/30 hover:text-muted-foreground/50 text-xs transition-colors"
				>
					spotify-pomodoro
				</a>
			</footer>

			{playbackError && (
				<div
					className={cn(
						"fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
						"px-4 py-3 rounded-xl",
						"bg-destructive/10 border border-destructive/20",
						"backdrop-blur-sm shadow-lg",
						"flex items-center gap-3",
					)}
				>
					<span className="text-sm text-destructive">{playbackError}</span>
					<button
						type="button"
						onClick={clearError}
						className="text-muted-foreground hover:text-foreground transition-colors"
					>
						×
					</button>
				</div>
			)}

			{tabTookOver && (
				<div
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
						onClick={clearTabTookOver}
						className="text-yellow-500/60 hover:text-yellow-500 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			)}
		</div>
	);
}
