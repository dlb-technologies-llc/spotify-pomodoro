/**
 * Chime played when a phase reaches zero.
 *
 * @module
 */
import { Context, Effect, Layer } from "effect";
import type { ChimeSound } from "@/shared/domain/Settings";

const SOUNDS: {
	readonly [S in Exclude<ChimeSound, "none">]: {
		readonly wave: OscillatorType;
		readonly tones: ReadonlyArray<{
			readonly frequency: number;
			readonly at: number;
			readonly length: number;
		}>;
	};
} = {
	bell: {
		wave: "sine",
		tones: [
			{ frequency: 880, at: 0, length: 0.4 },
			{ frequency: 660, at: 0.15, length: 0.45 },
		],
	},
	soft: {
		wave: "triangle",
		tones: [
			{ frequency: 523.25, at: 0, length: 0.7 },
			{ frequency: 392, at: 0.35, length: 0.9 },
		],
	},
	digital: {
		wave: "square",
		tones: [
			{ frequency: 1046.5, at: 0, length: 0.08 },
			{ frequency: 1046.5, at: 0.16, length: 0.08 },
			{ frequency: 1046.5, at: 0.32, length: 0.08 },
		],
	},
};

/**
 * Synthesizes chimes with the Web Audio API.
 *
 * @since 0.0.1
 * @category Services
 */
export class AudioNotification extends Context.Service<AudioNotification>()(
	"spotify-pomodoro/client/AudioNotification",
	{
		make: Effect.sync(() => {
			let context: AudioContext | undefined;
			const play = (sound: ChimeSound, volume: number) =>
				Effect.sync(() => {
					if (sound === "none" || volume <= 0) return;
					context ??= new AudioContext();
					const ctx = context;
					if (ctx.state === "suspended") void ctx.resume();
					const { wave, tones } = SOUNDS[sound];
					const peak = Math.min(1, volume) * (wave === "square" ? 0.25 : 0.9);
					for (const tone of tones) {
						const oscillator = ctx.createOscillator();
						const gain = ctx.createGain();
						oscillator.type = wave;
						oscillator.frequency.value = tone.frequency;
						oscillator.connect(gain);
						gain.connect(ctx.destination);
						const start = ctx.currentTime + tone.at;
						gain.gain.setValueAtTime(0, start);
						gain.gain.linearRampToValueAtTime(peak, start + 0.02);
						gain.gain.exponentialRampToValueAtTime(0.001, start + tone.length);
						oscillator.start(start);
						oscillator.stop(start + tone.length + 0.05);
					}
				}).pipe(Effect.ignore, Effect.withSpan("AudioNotification.play"));
			return { play };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);

	/**
	 * Silent implementation for tests.
	 *
	 * @since 2.0.0
	 */
	static readonly layerSilent = Layer.succeed(this, {
		play: () => Effect.void,
	});
}
