/**
 * Pomodoro timer service with countdown, overtime, and phase management.
 *
 * @module
 */

import {
	Effect,
	Layer,
	Option,
	Ref,
	ServiceMap,
	SubscriptionRef,
} from "effect";
import {
	TimerConfig,
	type TimerPhase,
	type TimerPreset,
	TimerState,
} from "../schema/TimerState";

/**
 * Preset configurations for common pomodoro patterns.
 *
 * @since 0.2.0
 * @category Config
 */
export const TIMER_PRESETS: Record<
	TimerPreset,
	{ focus: number; break: number }
> = {
	classic: { focus: 25 * 60, break: 5 * 60 },
	long: { focus: 50 * 60, break: 10 * 60 },
	short: { focus: 15 * 60, break: 3 * 60 },
	custom: { focus: 25 * 60, break: 5 * 60 },
};

/**
 * Timer service for managing pomodoro sessions.
 *
 * Provides countdown timer with focus/break phases and overtime tracking.
 *
 * @since 0.0.1
 * @category Services
 */
export class Timer extends ServiceMap.Service<Timer>()("Timer", {
	make: Effect.gen(function* () {
		yield* Effect.logDebug("Timer service initializing");

		const stateRef = yield* SubscriptionRef.make(
			new TimerState({
				phase: "idle",
				status: "stopped",
				remainingSeconds: 25 * 60,
				overtime: 0,
				config: new TimerConfig({
					focusDuration: 25 * 60,
					breakDuration: 5 * 60,
					preset: "classic",
				}),
				sessionCount: 0,
				currentPomodoroId: null,
				currentSessionId: null,
				elapsedSeconds: 0,
			}),
		);

		yield* Effect.logDebug("Timer service initialized");

		const intervalRef = yield* Ref.make<
			Option.Option<ReturnType<typeof setInterval>>
		>(Option.none());

		const onTimerEndRef = yield* Ref.make<Option.Option<() => void>>(
			Option.none(),
		);

		const tick = () =>
			Effect.gen(function* () {
				const currentState = yield* SubscriptionRef.get(stateRef);
				if (currentState.status !== "running") return;

				if (currentState.remainingSeconds > 0) {
					yield* SubscriptionRef.set(
						stateRef,
						new TimerState({
							...currentState,
							remainingSeconds: currentState.remainingSeconds - 1,
						}),
					);
				} else {
					yield* SubscriptionRef.set(
						stateRef,
						new TimerState({
							...currentState,
							overtime: currentState.overtime + 1,
						}),
					);

					if (currentState.overtime === 0) {
						yield* Effect.logInfo("Timer completed, entering overtime").pipe(
							Effect.annotateLogs("phase", currentState.phase),
						);
						const callback = yield* Ref.get(onTimerEndRef);
						yield* Option.match(callback, {
							onNone: () => Effect.void,
							onSome: (fn) => Effect.sync(fn),
						});
					}
				}
			});

		const startTicking = Effect.gen(function* () {
			const existingInterval = yield* Ref.get(intervalRef);
			yield* Option.match(existingInterval, {
				onNone: () => Effect.void,
				onSome: (id) => Effect.sync(() => clearInterval(id)),
			});

			const id = yield* Effect.sync(() =>
				setInterval(() => {
					Effect.runSync(tick());
				}, 1000),
			);

			yield* Ref.set(intervalRef, Option.some(id));
		});

		const stopTicking = Effect.gen(function* () {
			const existingInterval = yield* Ref.get(intervalRef);
			yield* Option.match(existingInterval, {
				onNone: () => Effect.void,
				onSome: (id) => Effect.sync(() => clearInterval(id)),
			});
			yield* Ref.set(intervalRef, Option.none());
		});

		const start = Effect.gen(function* () {
			const state = yield* SubscriptionRef.get(stateRef);

			if (state.phase === "idle") {
				const pomodoroId = crypto.randomUUID();
				yield* Effect.logInfo("Starting new pomodoro").pipe(
					Effect.annotateLogs("pomodoroId", pomodoroId),
				);
				yield* SubscriptionRef.set(
					stateRef,
					new TimerState({
						...state,
						phase: "focus",
						status: "running",
						remainingSeconds: state.config.focusDuration,
						overtime: 0,
						currentPomodoroId: pomodoroId,
						currentSessionId: null,
						elapsedSeconds: 0,
					}),
				);
			} else {
				yield* Effect.logInfo("Resuming timer").pipe(
					Effect.annotateLogs("phase", state.phase),
				);
				yield* SubscriptionRef.update(
					stateRef,
					(s) => new TimerState({ ...s, status: "running" }),
				);
			}

			yield* startTicking;
		});

		const reset = Effect.gen(function* () {
			yield* Effect.logDebug("Resetting timer");
			yield* stopTicking;
			const state = yield* SubscriptionRef.get(stateRef);
			const duration =
				state.phase === "focus"
					? state.config.focusDuration
					: state.config.breakDuration;

			yield* SubscriptionRef.set(
				stateRef,
				new TimerState({
					...state,
					status: "stopped",
					remainingSeconds: duration,
					overtime: 0,
				}),
			);
		});

		const switchPhase = (options?: { autoStart?: boolean }) =>
			Effect.gen(function* () {
				yield* stopTicking;
				const state = yield* SubscriptionRef.get(stateRef);
				const newPhase: TimerPhase =
					state.phase === "focus" ? "break" : "focus";
				const duration =
					newPhase === "focus"
						? state.config.focusDuration
						: state.config.breakDuration;

				const newSessionCount =
					state.phase === "focus" ? state.sessionCount + 1 : state.sessionCount;

				const newPomodoroId =
					newPhase === "focus" ? crypto.randomUUID() : state.currentPomodoroId;

				const shouldAutoStart = options?.autoStart ?? false;

				yield* Effect.logInfo("Switching phase").pipe(
					Effect.annotateLogs({
						fromPhase: state.phase,
						toPhase: newPhase,
						autoStart: String(shouldAutoStart),
					}),
				);

				yield* SubscriptionRef.set(
					stateRef,
					new TimerState({
						...state,
						phase: newPhase,
						status: shouldAutoStart ? "running" : "stopped",
						remainingSeconds: duration,
						overtime: 0,
						sessionCount: newSessionCount,
						currentPomodoroId: newPomodoroId,
						currentSessionId: null,
						elapsedSeconds: 0,
					}),
				);

				if (shouldAutoStart) {
					yield* startTicking;
				}
			});

		const endSession = (options?: { switchToNext?: boolean }) =>
			Effect.gen(function* () {
				yield* stopTicking;
				const state = yield* SubscriptionRef.get(stateRef);

				yield* Effect.logInfo("Ending session").pipe(
					Effect.annotateLogs({
						phase: state.phase,
						switchToNext: String(options?.switchToNext ?? false),
					}),
				);

				const newSessionCount =
					state.phase === "focus" ? state.sessionCount + 1 : state.sessionCount;

				if (options?.switchToNext) {
					yield* switchPhase({ autoStart: true });
				} else {
					yield* SubscriptionRef.set(
						stateRef,
						new TimerState({
							...state,
							status: "stopped",
							sessionCount: newSessionCount,
						}),
					);
				}
			});

		const skip = Effect.gen(function* () {
			yield* switchPhase({ autoStart: true });
		});

		const stop = Effect.gen(function* () {
			yield* Effect.logInfo("Stopping timer and returning to idle");
			yield* stopTicking;
			const state = yield* SubscriptionRef.get(stateRef);

			yield* SubscriptionRef.set(
				stateRef,
				new TimerState({
					...state,
					phase: "idle",
					status: "stopped",
					remainingSeconds: state.config.focusDuration,
					overtime: 0,
					currentPomodoroId: null,
					currentSessionId: null,
					elapsedSeconds: 0,
				}),
			);
		});

		const setConfig = (config: TimerConfig) =>
			Effect.gen(function* () {
				yield* Effect.logDebug("Updating timer config").pipe(
					Effect.annotateLogs({
						focusDuration: String(config.focusDuration),
						breakDuration: String(config.breakDuration),
					}),
				);
				const state = yield* SubscriptionRef.get(stateRef);
				const duration =
					state.phase === "focus" || state.phase === "idle"
						? config.focusDuration
						: config.breakDuration;

				yield* SubscriptionRef.update(
					stateRef,
					(s) =>
						new TimerState({
							...s,
							config,
							remainingSeconds:
								s.status === "stopped" ? duration : s.remainingSeconds,
						}),
				);
			});

		const setPreset = (preset: TimerPreset) =>
			Effect.gen(function* () {
				yield* Effect.logInfo("Setting timer preset").pipe(
					Effect.annotateLogs("preset", preset),
				);
				const { focus, break: breakDuration } = TIMER_PRESETS[preset];
				const config = new TimerConfig({
					focusDuration: focus,
					breakDuration: breakDuration,
					preset,
				});
				yield* setConfig(config);
			});

		const setOnTimerEnd = (callback: () => void) =>
			Ref.set(onTimerEndRef, Option.some(callback));

		const changes = SubscriptionRef.changes(stateRef);

		return {
			state: stateRef,
			changes,
			start,
			reset,
			switchPhase,
			endSession,
			skip,
			stop,
			setConfig,
			setPreset,
			setOnTimerEnd,
		};
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}
