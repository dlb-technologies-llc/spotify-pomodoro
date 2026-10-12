/**
 * Pomodoro countdown with overtime.
 *
 * @module
 */
import {
	Clock,
	Context,
	Effect,
	FiberHandle,
	Layer,
	Option,
	PubSub,
	Ref,
	Stream,
	SubscriptionRef,
} from "effect";
import { KeyValueStore } from "effect/persistence";
import {
	TIMER_PRESETS,
	type TimerPhase,
	type TimerPreset,
	TimerSnapshot,
	TimerState,
} from "@/shared/domain/Timer";

/**
 * Storage key for the timer snapshot.
 *
 * @since 2.1.0
 * @category Config
 */
export const TIMER_STORAGE_KEY = "pomodoro_timer";

/**
 * Countdown for the focus and break phases.
 *
 * Elapsed time is measured from the clock rather than counted per tick, so
 * throttled background tabs stay accurate. Every transition is saved, so a
 * reload resumes the same countdown. `completions` emits the phase that just
 * reached zero; the timer then keeps counting overtime until the phase is
 * switched or stopped.
 *
 * @since 0.0.1
 * @category Services
 */
export class Timer extends Context.Service<Timer>()(
	"spotify-pomodoro/client/Timer",
	{
		make: Effect.gen(function* () {
			const store = KeyValueStore.toSchemaStore(
				yield* KeyValueStore.KeyValueStore,
				TimerSnapshot,
			);
			const saved = yield* store
				.get(TIMER_STORAGE_KEY)
				.pipe(Effect.catch(() => Effect.succeedNone));
			const state = yield* SubscriptionRef.make(
				Option.match(saved, {
					onNone: () => TimerState.idle(TIMER_PRESETS.classic),
					onSome: (snapshot) => snapshot.state,
				}),
			);
			const runningSince = yield* Ref.make(
				Option.flatMap(saved, (snapshot) => snapshot.runningSince),
			);
			const ticker = yield* FiberHandle.make();
			const completions = yield* PubSub.unbounded<TimerPhase>();

			const persist = Effect.gen(function* () {
				const snapshot = new TimerSnapshot({
					state: yield* SubscriptionRef.get(state),
					runningSince: yield* Ref.get(runningSince),
				});
				yield* store.set(TIMER_STORAGE_KEY, snapshot).pipe(Effect.ignore);
			});

			const tick = Effect.gen(function* () {
				const since = yield* Ref.get(runningSince);
				const current = yield* SubscriptionRef.get(state);
				if (Option.isNone(since) || current.phase === "idle") return;
				const now = yield* Clock.currentTimeMillis;
				const elapsed = Math.max(0, Math.floor((now - since.value) / 1000));
				const duration = current.config.durationOf(current.phase);
				const remainingSeconds = Math.max(0, duration - elapsed);
				const overtimeSeconds = Math.max(0, elapsed - duration);
				if (
					remainingSeconds === current.remainingSeconds &&
					overtimeSeconds === current.overtimeSeconds
				) {
					return;
				}
				yield* SubscriptionRef.set(
					state,
					new TimerState({ ...current, remainingSeconds, overtimeSeconds }),
				);
				if (current.remainingSeconds > 0 && remainingSeconds === 0) {
					yield* Effect.logInfo("Phase reached zero", { phase: current.phase });
					yield* PubSub.publish(completions, current.phase);
					yield* persist;
				}
			});

			const startTicker = FiberHandle.run(
				ticker,
				tick.pipe(Effect.andThen(Effect.sleep("250 millis")), Effect.forever),
			);

			const run = Effect.gen(function* () {
				yield* Ref.set(
					runningSince,
					Option.some(yield* Clock.currentTimeMillis),
				);
				yield* startTicker;
			});

			const halt = Effect.gen(function* () {
				yield* Ref.set(runningSince, Option.none());
				yield* FiberHandle.clear(ticker);
			});

			const start = Effect.fn("Timer.start")(function* () {
				const current = yield* SubscriptionRef.get(state);
				if (current.status === "running") return;
				yield* SubscriptionRef.set(
					state,
					new TimerState({
						...current,
						phase: current.phase === "idle" ? "focus" : current.phase,
						status: "running",
						remainingSeconds: current.config.durationOf(current.phase),
						overtimeSeconds: 0,
					}),
				);
				yield* run;
				yield* persist;
			});

			const reset = Effect.fn("Timer.reset")(function* () {
				yield* halt;
				yield* SubscriptionRef.update(
					state,
					(current) =>
						new TimerState({
							...current,
							status: "stopped",
							remainingSeconds: current.config.durationOf(current.phase),
							overtimeSeconds: 0,
						}),
				);
				yield* persist;
			});

			const switchPhase = Effect.fn("Timer.switchPhase")(function* () {
				const current = yield* SubscriptionRef.get(state);
				if (current.phase === "idle") return;
				const phase = current.phase === "focus" ? "break" : "focus";
				yield* Effect.annotateCurrentSpan({ from: current.phase, to: phase });
				yield* SubscriptionRef.set(
					state,
					new TimerState({
						...current,
						phase,
						status: "running",
						remainingSeconds: current.config.durationOf(phase),
						overtimeSeconds: 0,
					}),
				);
				yield* run;
				yield* persist;
			});

			const stop = Effect.fn("Timer.stop")(function* () {
				yield* halt;
				yield* SubscriptionRef.update(state, (current) =>
					TimerState.idle(current.config),
				);
				yield* persist;
			});

			const setPreset = Effect.fn("Timer.setPreset")(function* (
				preset: TimerPreset,
			) {
				const config = TIMER_PRESETS[preset];
				yield* SubscriptionRef.update(
					state,
					(current) =>
						new TimerState({
							...current,
							config,
							remainingSeconds:
								current.status === "stopped"
									? config.durationOf(current.phase)
									: current.remainingSeconds,
						}),
				);
				yield* persist;
			});

			if (Option.isSome(yield* Ref.get(runningSince))) {
				yield* tick;
				yield* startTicker;
			}

			return {
				state,
				get: SubscriptionRef.get(state),
				changes: SubscriptionRef.changes(state),
				completions: Stream.fromPubSub(completions),
				start,
				reset,
				switchPhase,
				stop,
				setPreset,
			};
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make);
}
