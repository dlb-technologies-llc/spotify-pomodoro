/**
 * User preferences, stored in the browser.
 *
 * @module
 */
import { Option, Schema } from "effect";
import { Count } from "./Session";
import { Playlist } from "./Spotify";
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
 * What music does when a break starts.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const BreakMusic = Schema.Literals([
	"keep",
	"playlist",
	"pause",
	"lower",
]);

/**
 * @since 2.1.0
 * @category Schemas
 */
export type BreakMusic = typeof BreakMusic.Type;

/**
 * How Spotify follows the pomodoro.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class MusicSettings extends Schema.Class<MusicSettings>("MusicSettings")(
	{
		focusPlaylist: Schema.OptionFromNullOr(Playlist),
		breakPlaylist: Schema.OptionFromNullOr(Playlist),
		onBreak: BreakMusic,
		breakVolume: Volume,
		pauseOnEnd: Schema.Boolean,
		deviceId: Schema.OptionFromNullOr(Schema.String),
		pinned: Schema.Array(Schema.String),
	},
) {
	/**
	 * Music follows nothing until playlists are chosen.
	 *
	 * @since 2.1.0
	 */
	static readonly defaults = new MusicSettings({
		focusPlaylist: Option.none(),
		breakPlaylist: Option.none(),
		onBreak: "keep",
		breakVolume: 0.3,
		pauseOnEnd: false,
		deviceId: Option.none(),
		pinned: [],
	});
}

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
	music: MusicSettings,
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
		music: MusicSettings.defaults,
	});
}
