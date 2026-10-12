/**
 * User preferences, stored in the browser.
 *
 * @module
 */
import { Schema } from "effect";
import { Count } from "./Session";
import { TIMER_PRESETS, TimerConfig } from "./Timer";

/**
 * Chime played when a phase reaches zero.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const ChimeSound = Schema.Literals(["bell", "soft", "digital", "none"]);

/**
 * @since 2.1.0
 * @category Schemas
 */
export type ChimeSound = typeof ChimeSound.Type;

/**
 * A volume from silent (0) to full (1).
 *
 * @since 2.1.0
 * @category Schemas
 */
export const Volume = Schema.Number.check(
	Schema.isBetween({ minimum: 0, maximum: 1 }),
);

/**
 * Daily pomodoro goal; 0 turns it off.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const DailyGoal = Count.check(Schema.isLessThanOrEqualTo(48));

/**
 * Every user preference.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class Settings extends Schema.Class<Settings>("Settings")({
	timer: TimerConfig,
	autoStartBreaks: Schema.Boolean,
	autoStartFocus: Schema.Boolean,
	dailyGoal: DailyGoal,
	chime: ChimeSound,
	chimeVolume: Volume,
}) {
	/**
	 * Defaults for a first visit.
	 *
	 * @since 2.1.0
	 */
	static readonly defaults = new Settings({
		timer: TIMER_PRESETS.classic,
		autoStartBreaks: false,
		autoStartFocus: false,
		dailyGoal: 8,
		chime: "bell",
		chimeVolume: 0.8,
	});
}
