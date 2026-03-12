/**
 * Audio notification service using Web Audio API.
 *
 * @module
 */

import { Effect, Layer, Option, Ref, ServiceMap } from "effect";

/**
 * Audio notification service.
 *
 * Plays synthesized chime sounds for timer events.
 *
 * @since 0.0.1
 * @category Services
 */
export class AudioNotification extends ServiceMap.Service<AudioNotification>()(
	"AudioNotification",
	{
		make: Effect.gen(function* () {
			yield* Effect.logDebug("AudioNotification service initializing");
			const audioContextRef = yield* Ref.make<Option.Option<AudioContext>>(
				Option.none(),
			);
			yield* Effect.logDebug("AudioNotification service initialized");

			const getOrCreateContext = Effect.gen(function* () {
				const maybeCtx = yield* Ref.get(audioContextRef);
				if (Option.isSome(maybeCtx)) {
					return maybeCtx.value;
				}
				const ctx = yield* Effect.sync(() => new AudioContext());
				yield* Ref.set(audioContextRef, Option.some(ctx));
				return ctx;
			});

			const play = Effect.gen(function* () {
				yield* Effect.logDebug("Playing audio notification");
				const ctx = yield* getOrCreateContext;
				yield* Effect.sync(() => {
					if (ctx.state === "suspended") {
						ctx.resume();
					}

					const oscillator = ctx.createOscillator();
					const gainNode = ctx.createGain();

					oscillator.connect(gainNode);
					gainNode.connect(ctx.destination);

					const now = ctx.currentTime;

					oscillator.frequency.setValueAtTime(880, now);
					oscillator.frequency.setValueAtTime(660, now + 0.15);

					gainNode.gain.setValueAtTime(0, now);
					gainNode.gain.linearRampToValueAtTime(0.9, now + 0.02);
					gainNode.gain.linearRampToValueAtTime(0.6, now + 0.15);
					gainNode.gain.linearRampToValueAtTime(0.9, now + 0.17);
					gainNode.gain.linearRampToValueAtTime(0, now + 0.4);

					oscillator.start(now);
					oscillator.stop(now + 0.4);
				});
			});

			return {
				play,
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
