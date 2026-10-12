/**
 * Chime played when a phase reaches zero.
 *
 * @module
 */
import { Context, Effect, Layer } from "effect";

/**
 * Synthesizes a short two-tone chime with the Web Audio API.
 *
 * @since 0.0.1
 * @category Services
 */
export class AudioNotification extends Context.Service<AudioNotification>()(
	"spotify-pomodoro/client/AudioNotification",
	{
		make: Effect.sync(() => {
			let context: AudioContext | undefined;
			const play = Effect.sync(() => {
				context ??= new AudioContext();
				const ctx = context;
				if (ctx.state === "suspended") void ctx.resume();
				const oscillator = ctx.createOscillator();
				const gain = ctx.createGain();
				oscillator.connect(gain);
				gain.connect(ctx.destination);
				const now = ctx.currentTime;
				oscillator.frequency.setValueAtTime(880, now);
				oscillator.frequency.setValueAtTime(660, now + 0.15);
				gain.gain.setValueAtTime(0, now);
				gain.gain.linearRampToValueAtTime(0.9, now + 0.02);
				gain.gain.linearRampToValueAtTime(0.6, now + 0.15);
				gain.gain.linearRampToValueAtTime(0.9, now + 0.17);
				gain.gain.linearRampToValueAtTime(0, now + 0.4);
				oscillator.start(now);
				oscillator.stop(now + 0.4);
			}).pipe(Effect.withSpan("AudioNotification.play"));
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
	static readonly layerSilent = Layer.succeed(this, { play: Effect.void });
}
