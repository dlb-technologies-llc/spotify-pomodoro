/**
 * Main application: timer, presets, stats, and Spotify controls.
 *
 * @module
 */
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { X } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import {
	clearPlaybackErrorAtom,
	clearTabTookOverAtom,
	playerAtom,
	resetAtom,
	skipAtom,
	startAtom,
	stopAtom,
	themeAtom,
	timerAtom,
} from "@/client/atoms";
import { cn } from "@/lib/utils";
import { isBreak, phaseLabel, type TimerState } from "@/shared/domain/Timer";
import { PresetSelector } from "./PresetSelector";
import { SpotifyControls } from "./Spotify";
import { CycleDots, GoalProgress, LabelInput } from "./SessionMeta";
import { SettingsDialog } from "./SettingsDialog";
import { StatsDialog } from "./StatsDialog";

const PHASE_COLOR = {
	idle: "text-[var(--lofi-idle)]",
	focus: "text-[var(--lofi-focus)]",
	break: "text-[var(--lofi-break)]",
	longBreak: "text-[var(--lofi-break)]",
} satisfies Record<TimerState["phase"], string>;

const PHASE_GLOW = {
	idle: "glow-idle",
	focus: "glow-focus",
	break: "glow-break",
	longBreak: "glow-break",
} satisfies Record<TimerState["phase"], string>;

const BADGE = {
	overtime: "bg-[var(--lofi-overtime-bg)] text-[var(--lofi-overtime)]",
	focus: "bg-[var(--lofi-focus-bg)] text-[var(--lofi-focus)]",
	break: "bg-[var(--lofi-break-bg)] text-[var(--lofi-break)]",
	longBreak: "bg-[var(--lofi-break-bg)] text-[var(--lofi-break)]",
} satisfies Record<Exclude<TimerState["phase"], "idle"> | "overtime", string>;

const hint = (state: TimerState) => {
	if (state.status === "running") {
		return state.phase === "focus"
			? `press b to start ${phaseLabel(state.nextBreak)} · e to end pomodoro`
			: "press f to start focus · e to end pomodoro";
	}
	return state.phase === "idle"
		? "press space to start"
		: "press space to resume · r to reset · e to end";
};

const TEXT_ENTRY =
	"input, textarea, select, [contenteditable=''], [contenteditable='true']";
const ACTIVATABLE = `${TEXT_ENTRY}, button, a[href], summary, [role='button'], [role='menuitem'], [role='option'], [role='tab']`;

const targetMatches = (target: EventTarget | null, selector: string) =>
	target instanceof Element && target.closest(selector) !== null;

/**
 * Keyboard shortcuts for the timer.
 *
 * Space and Enter defer to a focused control so buttons and links keep
 * working; letter shortcuts are ignored while typing or inside a dialog.
 *
 * @since 0.0.1
 * @category Hooks
 */
function useTimerKeys(state: TimerState | undefined) {
	const start = useAtomSet(startAtom);
	const skip = useAtomSet(skipAtom);
	const stop = useAtomSet(stopAtom);
	const reset = useAtomSet(resetAtom);
	const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
		if (
			!state ||
			event.defaultPrevented ||
			event.repeat ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			targetMatches(event.target, `${TEXT_ENTRY}, [role='dialog']`)
		) {
			return;
		}
		const running = state.status === "running";
		const act = (action: () => void) => {
			event.preventDefault();
			action();
		};
		switch (event.code) {
			case "Space":
			case "Enter":
				if (targetMatches(event.target, ACTIVATABLE)) return;
				return !running && act(() => start());
			case "KeyR":
				return !running && state.phase !== "idle" && act(() => reset());
			case "KeyB":
				return running && state.phase === "focus" && act(() => skip());
			case "KeyF":
				return running && isBreak(state.phase) && act(() => skip());
			case "KeyE":
				return state.phase !== "idle" && act(() => stop());
		}
	});

	useEffect(() => {
		const listener = (event: KeyboardEvent) => onKeyDown(event);
		window.addEventListener("keydown", listener);
		return () => window.removeEventListener("keydown", listener);
	}, []);
}

const PHASE_ICON = {
	idle: "🍅",
	focus: "🍅",
	break: "☕",
	longBreak: "🛋️",
} satisfies Record<TimerState["phase"], string>;

/**
 * Shows the countdown in the browser tab title.
 *
 * @since 2.1.0
 * @category Hooks
 */
function useTabTitle(state: TimerState | undefined) {
	const title =
		!state || state.phase === "idle"
			? "Spotify Pomodoro"
			: `${PHASE_ICON[state.phase]} ${state.displayTime} · ${state.isOvertime ? "overtime" : phaseLabel(state.phase)}`;
	useEffect(() => {
		document.title = title;
	}, [title]);
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
	useTabTitle(timer);

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
				<SettingsDialog>
					<button
						type="button"
						aria-label="settings"
						className={cn(
							"w-10 h-10 rounded-xl flex items-center justify-center",
							"bg-card/60 backdrop-blur-sm border border-border",
							"transition-all duration-300 hover:scale-110",
							"text-sm font-medium",
						)}
					>
						⚙️
					</button>
				</SettingsDialog>
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
								{badge === "overtime" ? badge : phaseLabel(badge)}
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

					<CycleDots timer={timer} />

					<TimerControls timer={timer} />

					<LabelInput />

					<span className="text-muted-foreground/40 text-xs tracking-wide pointer-coarse:hidden">
						{hint(timer)}
					</span>

					<SpotifyControls />

					<GoalProgress />
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
 * Touch-friendly buttons for the actions the keyboard shortcuts trigger.
 *
 * @since 2.1.0
 * @category Components
 */
function TimerControls({ timer }: { readonly timer: TimerState }) {
	const start = useAtomSet(startAtom);
	const skip = useAtomSet(skipAtom);
	const stop = useAtomSet(stopAtom);
	const reset = useAtomSet(resetAtom);
	const running = timer.status === "running";

	const button = (
		label: string,
		shortcut: string,
		onClick: () => void,
		primary = false,
	) => (
		<button
			key={label}
			type="button"
			onClick={onClick}
			aria-keyshortcuts={shortcut}
			className={cn(
				"min-h-11 min-w-24 px-5 rounded-xl text-sm tracking-wide",
				"border transition-all duration-200 active:scale-95",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				primary
					? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
					: "bg-card/50 text-muted-foreground border-border hover:text-foreground hover:bg-card/80",
			)}
		>
			{label}
		</button>
	);

	const buttons =
		timer.phase === "idle"
			? [button("start", "Space", () => start(), true)]
			: running
				? [
						timer.phase === "focus"
							? button(
									timer.nextBreak === "longBreak"
										? "take a long break"
										: "take a break",
									"B",
									() => skip(),
									true,
								)
							: button("back to focus", "F", () => skip(), true),
						button("end", "E", () => stop()),
					]
				: [
						button("resume", "Space", () => start(), true),
						button("reset", "R", () => reset()),
						button("end", "E", () => stop()),
					];

	return (
		<fieldset className="flex items-center gap-3 border-0 p-0 m-0 min-w-0">
			<legend className="sr-only">timer controls</legend>
			{buttons}
		</fieldset>
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
