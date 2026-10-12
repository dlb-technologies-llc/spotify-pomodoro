/**
 * Timer, goal, and sound preferences.
 *
 * @module
 */
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Option, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import {
	playlistsAtom,
	previewChimeAtom,
	saveSettingsAtom,
	settingsAtom,
	spotifyConnectedAtom,
} from "@/client/atoms";
import { cn } from "@/lib/utils";
import {
	BreakMusic,
	ChimeSound,
	MusicSettings,
	Settings,
} from "@/shared/domain/Settings";
import type { Playlist } from "@/shared/domain/Spotify";
import { NamedPreset, TIMER_PRESETS } from "@/shared/domain/Timer";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";

const decodeSettings = Schema.decodeUnknownOption(Settings);
const encodeMusic = Schema.encodeSync(MusicSettings);

const BREAK_MUSIC_LABELS = {
	keep: "Keep playing",
	playlist: "Switch to break playlist",
	pause: "Pause",
	lower: "Lower the volume",
} satisfies Record<BreakMusic, string>;

const CHIME_LABELS = {
	bell: "Bell",
	soft: "Soft",
	digital: "Digital",
	none: "None",
} satisfies Record<ChimeSound, string>;

/**
 * The form's editable values, kept as text while typing.
 *
 * @since 2.1.0
 * @category Models
 */
const draftOf = (settings: Settings) => ({
	focus: String(settings.timer.focusSeconds / 60),
	break: String(settings.timer.breakSeconds / 60),
	longBreak: String(settings.timer.longBreakSeconds / 60),
	every: String(settings.timer.longBreakEvery),
	goal: String(settings.dailyGoal),
	autoStartBreaks: settings.autoStartBreaks,
	autoStartFocus: settings.autoStartFocus,
	chime: settings.chime,
	volume: settings.chimeVolume,
	music: settings.music,
});

type Draft = ReturnType<typeof draftOf>;

const settingsFrom = (draft: Draft) => {
	const minutes = (value: string) => Math.round(Number(value) * 60);
	const durations = {
		focusSeconds: minutes(draft.focus),
		breakSeconds: minutes(draft.break),
		longBreakSeconds: minutes(draft.longBreak),
		longBreakEvery: Number(draft.every),
	};
	const preset =
		NamedPreset.literals.find((name) => {
			const known = TIMER_PRESETS[name];
			return (
				known.focusSeconds === durations.focusSeconds &&
				known.breakSeconds === durations.breakSeconds &&
				known.longBreakSeconds === durations.longBreakSeconds &&
				known.longBreakEvery === durations.longBreakEvery
			);
		}) ?? "custom";
	return decodeSettings({
		timer: { preset, ...durations },
		autoStartBreaks: draft.autoStartBreaks,
		autoStartFocus: draft.autoStartFocus,
		dailyGoal: Number(draft.goal),
		chime: draft.chime,
		chimeVolume: draft.volume,
		music: encodeMusic(draft.music),
	});
};

const field =
	"w-20 rounded-lg bg-background/50 border border-border/50 px-2 py-1.5 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Settings dialog opened from the header.
 *
 * @since 2.1.0
 * @category Components
 */
export function SettingsDialog({
	children,
}: {
	readonly children: React.ReactNode;
}) {
	const settings = AsyncResult.getOrElse(
		useAtomValue(settingsAtom),
		() => Settings.defaults,
	);
	const save = useAtomSet(saveSettingsAtom);
	const preview = useAtomSet(previewChimeAtom);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(() => draftOf(settings));
	const parsed = settingsFrom(draft);
	const connected = AsyncResult.getOrElse(
		useAtomValue(spotifyConnectedAtom),
		() => false,
	);
	const playlists = AsyncResult.getOrElse(
		useAtomValue(playlistsAtom),
		() => [],
	);
	const setMusic = (patch: Partial<MusicSettings>) =>
		setDraft((current) => ({
			...current,
			music: new MusicSettings({ ...current.music, ...patch }),
		}));
	const playlistSelect = (
		label: string,
		value: Option.Option<Playlist>,
		onChange: (playlist: Option.Option<Playlist>) => void,
	) => (
		<label className="flex items-center justify-between gap-4 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<select
				aria-label={label}
				value={Option.match(value, { onNone: () => "", onSome: (p) => p.id })}
				onChange={(event) =>
					onChange(
						Option.fromUndefinedOr(
							playlists.find((p) => p.id === event.target.value),
						),
					)
				}
				className={cn(field, "w-44 text-left font-sans truncate")}
			>
				<option value="">None</option>
				{Option.isSome(value) &&
					!playlists.some((p) => p.id === value.value.id) && (
						<option value={value.value.id}>{value.value.name}</option>
					)}
				{playlists.map((playlist) => (
					<option key={playlist.id} value={playlist.id}>
						{playlist.name}
					</option>
				))}
			</select>
		</label>
	);
	const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
		setDraft((current) => ({ ...current, [key]: value }));

	const number = (
		key: "focus" | "break" | "longBreak" | "every" | "goal",
		label: string,
		unit: string,
		limits: {
			readonly min: number;
			readonly max: number;
			readonly step?: number;
		},
	) => (
		<label className="flex items-center justify-between gap-4 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="flex items-center gap-2">
				<input
					type="number"
					inputMode="decimal"
					min={limits.min}
					max={limits.max}
					step={limits.step ?? 1}
					value={draft[key]}
					onChange={(event) => set(key, event.target.value)}
					aria-label={label}
					aria-describedby={`${key}-unit`}
					className={field}
				/>
				<span
					id={`${key}-unit`}
					className="w-12 text-xs text-muted-foreground/60"
				>
					{unit}
				</span>
			</span>
		</label>
	);

	const toggle = (key: "autoStartBreaks" | "autoStartFocus", label: string) => (
		<label className="flex items-center justify-between gap-4 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<input
				type="checkbox"
				checked={draft[key]}
				onChange={(event) => set(key, event.target.checked)}
				className="h-4 w-4 accent-[var(--lofi-focus)]"
			/>
		</label>
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (next) setDraft(draftOf(settings));
				setOpen(next);
			}}
		>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent
				className={cn(
					"bg-card/95 backdrop-blur-lg border-border",
					"w-[95vw] max-w-md max-h-[90vh] overflow-y-auto",
				)}
			>
				<DialogHeader>
					<DialogTitle className="text-lg font-medium tracking-wide">
						Settings
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground/60">
						Saved in this browser.
					</DialogDescription>
				</DialogHeader>

				<form
					className="space-y-6"
					onSubmit={(event) => {
						event.preventDefault();
						if (Option.isSome(parsed)) {
							save(parsed.value);
							setOpen(false);
						}
					}}
				>
					<fieldset className="space-y-3 border-0 p-0 m-0">
						<legend className="mb-2 text-xs uppercase tracking-widest text-muted-foreground/70">
							Timer
						</legend>
						{number("focus", "Focus", "min", { min: 1, max: 240 })}
						{number("break", "Short break", "min", { min: 1, max: 240 })}
						{number("longBreak", "Long break", "min", { min: 1, max: 240 })}
						{number("every", "Long break every", "sessions", {
							min: 2,
							max: 12,
						})}
						{toggle("autoStartBreaks", "Start breaks automatically")}
						{toggle("autoStartFocus", "Start focus automatically")}
					</fieldset>

					<fieldset className="space-y-3 border-0 p-0 m-0">
						<legend className="mb-2 text-xs uppercase tracking-widest text-muted-foreground/70">
							Goal
						</legend>
						{number("goal", "Daily goal", "pomodoros", { min: 0, max: 48 })}
					</fieldset>

					<fieldset className="space-y-3 border-0 p-0 m-0">
						<legend className="mb-2 text-xs uppercase tracking-widest text-muted-foreground/70">
							Music
						</legend>
						{!connected && (
							<p className="text-xs text-muted-foreground/60">
								Connect Spotify to choose playlists.
							</p>
						)}
						{playlistSelect(
							"Focus playlist",
							draft.music.focusPlaylist,
							(focusPlaylist) => setMusic({ focusPlaylist }),
						)}
						<label className="flex items-center justify-between gap-4 text-sm">
							<span className="text-muted-foreground">On breaks</span>
							<select
								aria-label="On breaks"
								value={draft.music.onBreak}
								onChange={(event) => {
									const onBreak = BreakMusic.literals.find(
										(b) => b === event.target.value,
									);
									if (onBreak) setMusic({ onBreak });
								}}
								className={cn(field, "w-44 text-left font-sans")}
							>
								{BreakMusic.literals.map((choice) => (
									<option key={choice} value={choice}>
										{BREAK_MUSIC_LABELS[choice]}
									</option>
								))}
							</select>
						</label>
						{draft.music.onBreak === "playlist" &&
							playlistSelect(
								"Break playlist",
								draft.music.breakPlaylist,
								(breakPlaylist) => setMusic({ breakPlaylist }),
							)}
						{draft.music.onBreak === "lower" && (
							<label className="flex items-center justify-between gap-4 text-sm">
								<span className="text-muted-foreground">Break volume</span>
								<input
									type="range"
									aria-label="Break volume"
									min={0}
									max={1}
									step={0.05}
									value={draft.music.breakVolume}
									onChange={(event) =>
										setMusic({ breakVolume: Number(event.target.value) })
									}
									className="w-40 accent-[#1DB954]"
								/>
							</label>
						)}
						<label className="flex items-center justify-between gap-4 text-sm">
							<span className="text-muted-foreground">
								Pause when a pomodoro ends
							</span>
							<input
								type="checkbox"
								checked={draft.music.pauseOnEnd}
								onChange={(event) =>
									setMusic({ pauseOnEnd: event.target.checked })
								}
								className="h-4 w-4 accent-[#1DB954]"
							/>
						</label>
					</fieldset>

					<fieldset className="space-y-3 border-0 p-0 m-0">
						<legend className="mb-2 text-xs uppercase tracking-widest text-muted-foreground/70">
							Sound
						</legend>
						<label className="flex items-center justify-between gap-4 text-sm">
							<span className="text-muted-foreground">Chime</span>
							<select
								value={draft.chime}
								onChange={(event) => {
									const chime = ChimeSound.literals.find(
										(c) => c === event.target.value,
									);
									if (chime) set("chime", chime);
								}}
								className={cn(field, "w-32 text-left font-sans")}
							>
								{ChimeSound.literals.map((chime) => (
									<option key={chime} value={chime}>
										{CHIME_LABELS[chime]}
									</option>
								))}
							</select>
						</label>
						<label className="flex items-center justify-between gap-4 text-sm">
							<span className="text-muted-foreground">Volume</span>
							<input
								type="range"
								min={0}
								max={1}
								step={0.05}
								value={draft.volume}
								onChange={(event) => set("volume", Number(event.target.value))}
								className="w-40 accent-[var(--lofi-focus)]"
							/>
						</label>
						<button
							type="button"
							onClick={() =>
								preview({ sound: draft.chime, volume: draft.volume })
							}
							className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
						>
							Play chime
						</button>
					</fieldset>

					{Option.isNone(parsed) && (
						<p role="alert" className="text-sm text-destructive">
							Durations must be 1–240 minutes, long breaks every 2–12 sessions,
							and the goal 0–48.
						</p>
					)}

					<div className="flex justify-between gap-3">
						<button
							type="button"
							onClick={() =>
								setDraft(
									draftOf(
										new Settings({ ...settings, timer: TIMER_PRESETS.classic }),
									),
								)
							}
							className="text-xs text-muted-foreground hover:text-foreground"
						>
							Reset durations
						</button>
						<button
							type="submit"
							disabled={Option.isNone(parsed)}
							className={cn(
								"min-h-10 px-5 rounded-xl text-sm",
								"bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25",
								"disabled:opacity-40 disabled:cursor-not-allowed",
							)}
						>
							Save
						</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
