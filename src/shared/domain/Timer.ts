/**
 * Timer state and configuration.
 *
 * @module
 */
import { Schema } from "effect";
import { Seconds } from "./Session";

/**
 * Timer phase.
 *
 * @since 0.0.1
 * @category Schemas
 */
export const TimerPhase = Schema.Literals(["idle", "focus", "break"]);

/**
 * @since 0.0.1
 * @category Schemas
 */
export type TimerPhase = typeof TimerPhase.Type;

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
 * Named focus/break duration pairs.
 *
 * @since 0.2.0
 * @category Schemas
 */
export const TimerPreset = Schema.Literals(["short", "classic", "long"]);

/**
 * @since 0.2.0
 * @category Schemas
 */
export type TimerPreset = typeof TimerPreset.Type;

/**
 * Focus and break durations, in seconds.
 *
 * @since 0.0.1
 * @category Schemas
 */
export class TimerConfig extends Schema.Class<TimerConfig>("TimerConfig")({
	preset: TimerPreset,
	focusSeconds: Seconds,
	breakSeconds: Seconds,
}) {
	/**
	 * Configured duration for a phase; idle shows the focus duration.
	 *
	 * @since 2.0.0
	 */
	durationOf(phase: TimerPhase): number {
		return phase === "break" ? this.breakSeconds : this.focusSeconds;
	}
}

/**
 * Durations for every preset.
 *
 * @since 0.2.0
 * @category Config
 */
export const TIMER_PRESETS: { readonly [P in TimerPreset]: TimerConfig } = {
	short: new TimerConfig({
		preset: "short",
		focusSeconds: 15 * 60,
		breakSeconds: 3 * 60,
	}),
	classic: new TimerConfig({
		preset: "classic",
		focusSeconds: 25 * 60,
		breakSeconds: 5 * 60,
	}),
	long: new TimerConfig({
		preset: "long",
		focusSeconds: 50 * 60,
		breakSeconds: 10 * 60,
	}),
};

/**
 * Snapshot of the countdown.
 *
 * Counts down to zero, then counts up as overtime until the phase ends.
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
}) {
	/**
	 * The idle state for a configuration.
	 *
	 * @since 2.0.0
	 */
	static idle(config: TimerConfig): TimerState {
		return new TimerState({
			phase: "idle",
			status: "stopped",
			remainingSeconds: config.focusSeconds,
			overtimeSeconds: 0,
			config,
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
