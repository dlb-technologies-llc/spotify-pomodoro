/**
 * Timer state and configuration.
 *
 * @module
 */
import { Schema } from "effect";
import { Count, Seconds } from "./Session";

/**
 * Timer phase.
 *
 * @since 0.0.1
 * @category Schemas
 */
export const TimerPhase = Schema.Literals([
	"idle",
	"focus",
	"break",
	"longBreak",
]);

/**
 * @since 0.0.1
 * @category Schemas
 */
export type TimerPhase = typeof TimerPhase.Type;

/**
 * Whether a phase is a short or long break.
 *
 * @since 2.1.0
 * @category Functions
 */
export const isBreak = (phase: TimerPhase): boolean =>
	phase === "break" || phase === "longBreak";

/**
 * Human-readable phase name.
 *
 * @since 2.1.0
 * @category Functions
 */
export const phaseLabel = (phase: TimerPhase): string =>
	phase === "longBreak" ? "long break" : phase;

/**
 * Whether the clock is ticking.
 *
 * @since 0.0.1
 * @category Schemas
 */
export const TimerStatus = Schema.Literals(["running", "stopped"]);

/**
 * @since 0.0.1
 * @category Schemas
 */
export type TimerStatus = typeof TimerStatus.Type;

/**
 * Named duration sets; `custom` means the user edited them.
 *
 * @since 0.2.0
 * @category Schemas
 */
export const TimerPreset = Schema.Literals([
	"short",
	"classic",
	"long",
	"custom",
]);

/**
 * @since 0.2.0
 * @category Schemas
 */
export type TimerPreset = typeof TimerPreset.Type;

/**
 * The presets offered as one-click choices.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const NamedPreset = Schema.Literals(["short", "classic", "long"]);

/**
 * @since 2.1.0
 * @category Schemas
 */
export type NamedPreset = typeof NamedPreset.Type;

/**
 * A phase length: one minute to four hours.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const PhaseSeconds = Seconds.check(
	Schema.isBetween({ minimum: 60, maximum: 4 * 60 * 60 }),
);

/**
 * Focus sessions before a long break.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const CycleLength = Schema.Int.check(
	Schema.isBetween({ minimum: 2, maximum: 12 }),
);

/**
 * Durations, in seconds, and how often the long break comes.
 *
 * @since 0.0.1
 * @category Schemas
 */
export class TimerConfig extends Schema.Class<TimerConfig>("TimerConfig")({
	preset: TimerPreset,
	focusSeconds: PhaseSeconds,
	breakSeconds: PhaseSeconds,
	longBreakSeconds: PhaseSeconds,
	longBreakEvery: CycleLength,
}) {
	/**
	 * Configured duration for a phase; idle shows the focus duration.
	 *
	 * @since 2.0.0
	 */
	durationOf(phase: TimerPhase): number {
		switch (phase) {
			case "break":
				return this.breakSeconds;
			case "longBreak":
				return this.longBreakSeconds;
			default:
				return this.focusSeconds;
		}
	}
}

/**
 * Durations for every named preset.
 *
 * @since 0.2.0
 * @category Config
 */
export const TIMER_PRESETS: { readonly [P in NamedPreset]: TimerConfig } = {
	short: new TimerConfig({
		preset: "short",
		focusSeconds: 15 * 60,
		breakSeconds: 3 * 60,
		longBreakSeconds: 10 * 60,
		longBreakEvery: 4,
	}),
	classic: new TimerConfig({
		preset: "classic",
		focusSeconds: 25 * 60,
		breakSeconds: 5 * 60,
		longBreakSeconds: 15 * 60,
		longBreakEvery: 4,
	}),
	long: new TimerConfig({
		preset: "long",
		focusSeconds: 50 * 60,
		breakSeconds: 10 * 60,
		longBreakSeconds: 30 * 60,
		longBreakEvery: 4,
	}),
};

/**
 * Snapshot of the countdown.
 *
 * Counts down to zero, then counts up as overtime until the phase ends.
 * `focusCompleted` counts focus sessions since the last long break.
 *
 * @since 0.0.1
 * @category Schemas
 */
export class TimerState extends Schema.Class<TimerState>("TimerState")({
	phase: TimerPhase,
	status: TimerStatus,
	remainingSeconds: Seconds,
	overtimeSeconds: Seconds,
	config: TimerConfig,
	focusCompleted: Count,
}) {
	/**
	 * The idle state for a configuration.
	 *
	 * @since 2.0.0
	 */
	static idle(config: TimerConfig, focusCompleted = 0): TimerState {
		return new TimerState({
			phase: "idle",
			status: "stopped",
			remainingSeconds: config.focusSeconds,
			overtimeSeconds: 0,
			config,
			focusCompleted,
		});
	}

	/**
	 * Whether the countdown has reached zero in an active phase.
	 *
	 * @since 0.0.1
	 */
	get isOvertime(): boolean {
		return this.phase !== "idle" && this.remainingSeconds === 0;
	}

	/**
	 * Seconds spent in the current phase, including overtime.
	 *
	 * @since 0.2.0
	 */
	get elapsedSeconds(): number {
		if (this.phase === "idle") return 0;
		return (
			this.config.durationOf(this.phase) -
			this.remainingSeconds +
			this.overtimeSeconds
		);
	}

	/**
	 * The break that follows the current focus session.
	 *
	 * @since 2.1.0
	 */
	get nextBreak(): "break" | "longBreak" {
		return (this.focusCompleted + 1) % this.config.longBreakEvery === 0
			? "longBreak"
			: "break";
	}

	/**
	 * Focus sessions completed in the current cycle, from 0 to `longBreakEvery - 1`.
	 *
	 * @since 2.1.0
	 */
	get cycleProgress(): number {
		return this.focusCompleted % this.config.longBreakEvery;
	}

	/**
	 * `MM:SS`, or `+MM:SS` while in overtime.
	 *
	 * @since 0.0.1
	 */
	get displayTime(): string {
		const total = this.isOvertime
			? this.overtimeSeconds
			: this.remainingSeconds;
		const minutes = Math.floor(total / 60)
			.toString()
			.padStart(2, "0");
		const seconds = (total % 60).toString().padStart(2, "0");
		return `${this.isOvertime ? "+" : ""}${minutes}:${seconds}`;
	}
}

/**
 * What the browser stores so a reload resumes the countdown.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class TimerSnapshot extends Schema.Class<TimerSnapshot>("TimerSnapshot")(
	{
		state: TimerState,
		runningSince: Schema.OptionFromNullOr(Schema.Number),
	},
) {}
