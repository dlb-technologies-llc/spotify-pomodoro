/**
 * Spotify controls: connect, vinyl play/pause, playlist and device pickers,
 * and the now-playing strip.
 *
 * @module
 */
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import {
	ChevronLeft,
	ChevronRight,
	Globe,
	Laptop,
	Smartphone,
	Speaker,
	Star,
	Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePopover } from "./usePopover";
import {
	connectSpotifyAtom,
	devicesAtom,
	disconnectSpotifyAtom,
	nextTrackAtom,
	playerAtom,
	playlistsAtom,
	previousTrackAtom,
	refreshPlaybackAtom,
	selectDeviceAtom,
	setVolumeAtom,
	settingsAtom,
	spotifyConnectedAtom,
	startPlaylistAtom,
	togglePinAtom,
	togglePlaybackAtom,
} from "@/client/atoms";
import { cn } from "@/lib/utils";
import {
	BROWSER_DEVICE_NAME,
	type PlaybackState,
	type Playlist,
} from "@/shared/domain/Spotify";

const popover = cn(
	"absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 z-50",
	"bg-card/95 backdrop-blur-lg rounded-xl border border-border shadow-xl overflow-hidden",
);

/**
 * Orders playlists with pinned ones first, filtered by a search term.
 *
 * @since 2.1.0
 * @category Helpers
 */
export const arrangePlaylists = (
	playlists: ReadonlyArray<Playlist>,
	pinned: ReadonlyArray<string>,
	search: string,
) => {
	const term = search.trim().toLowerCase();
	const matches = term
		? playlists.filter((p) => p.name.toLowerCase().includes(term))
		: playlists;
	return [
		...matches.filter((p) => pinned.includes(p.id)),
		...matches.filter((p) => !pinned.includes(p.id)),
	];
};

/**
 * Searchable playlist list with pinned favourites.
 *
 * @since 2.1.0
 * @category Components
 */
function PlaylistPicker({
	selected,
	panel,
	onClose,
}: {
	readonly selected: Playlist | null;
	readonly panel: React.RefObject<HTMLDivElement | null>;
	readonly onClose: () => void;
}) {
	const result = useAtomValue(playlistsAtom);
	const playlists = AsyncResult.getOrElse(result, () => []);
	const settings = AsyncResult.getOrElse(
		useAtomValue(settingsAtom),
		() => undefined,
	);
	const pinned = settings?.music.pinned ?? [];
	const startPlaylist = useAtomSet(startPlaylistAtom);
	const togglePin = useAtomSet(togglePinAtom);
	const [search, setSearch] = useState("");
	const searchBox = useRef<HTMLInputElement>(null);
	useEffect(() => searchBox.current?.focus(), []);
	const shown = arrangePlaylists(playlists, pinned, search);

	return (
		<div ref={panel} className={popover}>
			<input
				type="search"
				ref={searchBox}
				value={search}
				onChange={(event) => setSearch(event.target.value)}
				placeholder={`search ${playlists.length} playlists`}
				aria-label="search playlists"
				className="w-full bg-transparent px-3 py-2.5 text-sm border-b border-border focus:outline-none"
			/>
			<ul className="max-h-64 overflow-y-auto">
				{result.waiting && playlists.length === 0 && (
					<li className="p-3 text-sm text-muted-foreground">loading…</li>
				)}
				{!result.waiting && shown.length === 0 && (
					<li className="p-3 text-sm text-muted-foreground">
						no playlists found
					</li>
				)}
				{shown.map((playlist) => {
					const isPinned = pinned.includes(playlist.id);
					return (
						<li
							key={playlist.id}
							className={cn(
								"flex items-center gap-2 pr-2 hover:bg-secondary/50 transition-colors",
								selected?.id === playlist.id && "bg-primary/10",
							)}
						>
							<button
								type="button"
								onClick={() => {
									onClose();
									startPlaylist(playlist);
								}}
								className="flex flex-1 min-w-0 items-center gap-3 p-3 text-left"
							>
								{playlist.imageUrl ? (
									<img
										src={playlist.imageUrl}
										alt=""
										className="w-10 h-10 rounded object-cover"
									/>
								) : (
									<span className="w-10 h-10 rounded bg-secondary flex items-center justify-center text-muted-foreground/90 text-sm">
										♪
									</span>
								)}
								<span className="truncate text-foreground/80">
									{playlist.name}
								</span>
							</button>
							<button
								type="button"
								aria-label={`${isPinned ? "unpin" : "pin"} ${playlist.name}`}
								aria-pressed={isPinned}
								onClick={() => togglePin(playlist.id)}
								className="p-1.5 rounded text-muted-foreground/90 hover:text-foreground"
							>
								<Star
									className={cn(
										"w-4 h-4",
										isPinned && "fill-current text-yellow-500",
									)}
								/>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

const deviceIcon = (type: string, name: string) =>
	name === BROWSER_DEVICE_NAME
		? Globe
		: type === "Smartphone"
			? Smartphone
			: type === "Computer"
				? Laptop
				: Speaker;

/**
 * Lists the account's devices and moves playback to the chosen one.
 *
 * @since 2.1.0
 * @category Components
 */
function DevicePicker({
	playback,
}: {
	readonly playback: PlaybackState | null;
}) {
	const { open, setOpen, trigger, panel } = usePopover<HTMLUListElement>();
	const devices = AsyncResult.getOrElse(useAtomValue(devicesAtom), () => []);
	const refreshDevices = useAtomRefresh(devicesAtom);
	const selectDevice = useAtomSet(selectDeviceAtom);
	const current = playback?.deviceName ?? null;
	const CurrentIcon = current
		? playback?.deviceSource === "browser"
			? Globe
			: Smartphone
		: Speaker;

	return (
		<div className="relative">
			<button
				ref={trigger}
				type="button"
				aria-label="choose device"
				aria-expanded={open}
				onClick={() => {
					if (!open) refreshDevices();
					setOpen(!open);
				}}
				className="flex items-center gap-1.5 text-muted-foreground/90 hover:text-muted-foreground text-xs"
			>
				<CurrentIcon className="w-3 h-3" />
				<span>{current ?? "no device"}</span>
			</button>
			{open && (
				<ul ref={panel} className={popover}>
					{devices.length === 0 && (
						<li className="p-3 text-sm text-muted-foreground">
							No devices. Open Spotify on a phone or computer.
						</li>
					)}
					{devices.map((device) => {
						const Icon = deviceIcon(device.type, device.name);
						return (
							<li key={device.id}>
								<button
									type="button"
									onClick={() => {
										setOpen(false);
										selectDevice(device.id);
									}}
									className={cn(
										"w-full flex items-center gap-3 p-3 text-left text-sm hover:bg-secondary/50",
										device.id === playback?.deviceId && "bg-primary/10",
									)}
								>
									<Icon className="w-4 h-4 text-muted-foreground" />
									<span className="truncate">{device.name}</span>
									{device.isActive && (
										<span className="ml-auto text-xs text-[var(--spotify-text)]">
											active
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

/**
 * Current track with previous, next, and volume.
 *
 * @since 2.1.0
 * @category Components
 */
function NowPlaying({ playback }: { readonly playback: PlaybackState }) {
	const next = useAtomSet(nextTrackAtom);
	const previous = useAtomSet(previousTrackAtom);
	const setVolume = useAtomSet(setVolumeAtom);
	const [volume, setLocalVolume] = useState<number | null>(null);
	const shownVolume = volume ?? playback.volumePercent ?? 50;
	const track = playback.track;
	if (!track) return null;

	const commitVolume = () => {
		if (volume !== null) setVolume(volume);
		setLocalVolume(null);
	};

	return (
		<section
			aria-label="now playing"
			className="flex items-center gap-3 rounded-xl bg-card/40 border border-border/30 px-3 py-2 w-full max-w-sm"
		>
			{track.imageUrl ? (
				<img
					src={track.imageUrl}
					alt=""
					className="w-10 h-10 rounded object-cover"
				/>
			) : (
				<span className="w-10 h-10 rounded bg-secondary" />
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm text-foreground/80">{track.title}</p>
				<p className="truncate text-xs text-muted-foreground/90">
					{track.artist ?? ""}
				</p>
			</div>
			<button
				type="button"
				aria-label="previous track"
				onClick={() => previous()}
				className="p-1.5 rounded text-muted-foreground hover:text-foreground"
			>
				<ChevronLeft className="w-4 h-4" />
			</button>
			<button
				type="button"
				aria-label="next track"
				onClick={() => next()}
				className="p-1.5 rounded text-muted-foreground hover:text-foreground"
			>
				<ChevronRight className="w-4 h-4" />
			</button>
			{playback.volumePercent !== null && (
				<label className="flex items-center gap-1 text-muted-foreground">
					<Volume2 className="w-4 h-4" aria-hidden="true" />
					<input
						type="range"
						min={0}
						max={100}
						step={5}
						value={shownVolume}
						aria-label="volume"
						onChange={(event) => setLocalVolume(Number(event.target.value))}
						onPointerUp={commitVolume}
						onKeyUp={commitVolume}
						className="w-16 accent-[#1DB954]"
					/>
				</label>
			)}
		</section>
	);
}

/**
 * Connect button, or the full set of Spotify controls once connected.
 *
 * @since 2.0.0
 * @category Components
 */
export function SpotifyControls() {
	const connected = AsyncResult.getOrElse(
		useAtomValue(spotifyConnectedAtom),
		() => false,
	);
	const connect = useAtomSet(connectSpotifyAtom);
	const disconnect = useAtomSet(disconnectSpotifyAtom);
	const refreshPlayback = useAtomSet(refreshPlaybackAtom);
	const toggle = useAtomSet(togglePlaybackAtom);
	const player = AsyncResult.getOrElse(
		useAtomValue(playerAtom),
		() => undefined,
	);
	const {
		open: playlistsOpen,
		setOpen: setPlaylistsOpen,
		trigger: playlistsTrigger,
		panel: playlistsPanel,
	} = usePopover<HTMLDivElement>();

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
						"bg-[#1DB954]/10 text-[var(--spotify-text)] border border-[#1DB954]/20",
						"hover:bg-[#1DB954]/20 hover:text-[var(--spotify-text)] transition-all duration-300",
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
	const playback = player ? Option.getOrNull(player.playback) : null;

	return (
		<div className="flex flex-col items-center gap-3 mt-4 w-full">
			<div className="flex items-center gap-4">
				<button
					type="button"
					aria-label={spinning ? "pause" : "play"}
					onClick={() => toggle()}
					disabled={!selected && !playback}
					className={cn(
						"relative group transition-transform duration-300",
						(selected || playback) && "hover:scale-105 cursor-pointer",
						!selected && !playback && "opacity-40 cursor-default",
					)}
				>
					<div
						className={cn(
							"w-[4.5rem] h-[4.5rem] rounded-full bg-[var(--lofi-vinyl)] border border-border",
							"animate-spin-slow",
							!spinning && "paused",
						)}
					>
						<div className="absolute inset-1.5 rounded-full border border-[var(--lofi-vinyl-groove)]" />
						<div className="absolute inset-3 rounded-full border border-[var(--lofi-vinyl-groove)]" />
						<div className="absolute inset-[18px] rounded-full overflow-hidden bg-card border border-border flex items-center justify-center">
							{(playback?.track?.imageUrl ?? selected?.imageUrl) ? (
								<img
									src={playback?.track?.imageUrl ?? selected?.imageUrl ?? ""}
									alt=""
									className="w-full h-full object-cover"
								/>
							) : (
								<span className="text-muted-foreground/90 text-xs">♪</span>
							)}
						</div>
					</div>
				</button>

				<div className="relative">
					<button
						ref={playlistsTrigger}
						type="button"
						aria-expanded={playlistsOpen}
						onClick={() => setPlaylistsOpen(!playlistsOpen)}
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
					{playlistsOpen && (
						<PlaylistPicker
							selected={selected}
							panel={playlistsPanel}
							onClose={() => setPlaylistsOpen(false)}
						/>
					)}
				</div>

				<button
					type="button"
					aria-label="disconnect spotify"
					onClick={() => disconnect()}
					className="text-xs text-muted-foreground/90 hover:text-foreground transition-colors"
				>
					×
				</button>
			</div>

			{playback && <NowPlaying playback={playback} />}
			<DevicePicker playback={playback} />
		</div>
	);
}
