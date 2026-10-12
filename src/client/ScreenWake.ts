/**
 * Keeps the screen on while the timer runs.
 *
 * @module
 */
import { Context, Effect, Layer, Option, Predicate, Ref } from "effect";

/**
 * Holds a screen wake lock while wanted.
 *
 * Browsers drop the lock when the tab is hidden, so it is re-acquired when
 * the tab becomes visible again. Unsupported browsers are a no-op.
 *
 * @since 2.1.0
 * @category Services
 */
export class ScreenWake extends Context.Service<ScreenWake>()(
	"spotify-pomodoro/client/ScreenWake",
	{
		make: Effect.gen(function* () {
			const wanted = yield* Ref.make(false);
			const sentinel = yield* Ref.make(Option.none<WakeLockSentinel>());
			const supported = Predicate.hasProperty(navigator, "wakeLock");

			const acquire = Effect.gen(function* () {
				if (!supported || document.visibilityState !== "visible") return;
				const held = yield* Ref.get(sentinel);
				if (Option.isSome(held) && !held.value.released) return;
				const lock = yield* Effect.tryPromise(() =>
					navigator.wakeLock.request("screen"),
				);
				yield* Ref.set(sentinel, Option.some(lock));
			}).pipe(Effect.ignore);

			const release = Ref.getAndSet(sentinel, Option.none()).pipe(
				Effect.flatMap(
					Option.match({
						onNone: () => Effect.void,
						onSome: (lock) => Effect.promise(() => lock.release()),
					}),
				),
				Effect.ignore,
			);

			const context = yield* Effect.context();
			yield* Effect.acquireRelease(
				Effect.sync(() => {
					const onVisible = () => {
						if (document.visibilityState !== "visible") return;
						void Effect.runPromiseWith(context)(
							Ref.get(wanted).pipe(
								Effect.flatMap((want) => (want ? acquire : Effect.void)),
							),
						);
					};
					document.addEventListener("visibilitychange", onVisible);
					return onVisible;
				}),
				(onVisible) =>
					Effect.sync(() =>
						document.removeEventListener("visibilitychange", onVisible),
					).pipe(Effect.andThen(release)),
			);

			const keepAwake = (on: boolean) =>
				Ref.set(wanted, on).pipe(
					Effect.andThen(on ? acquire : release),
					Effect.withSpan("ScreenWake.keepAwake", { attributes: { on } }),
				);

			return { keepAwake };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);

	/**
	 * Does nothing; for tests and unsupported environments.
	 *
	 * @since 2.1.0
	 */
	static readonly layerNoop = Layer.succeed(this, {
		keepAwake: () => Effect.void,
	});
}
