/**
 * React hook for timer state and controls.
 *
 * @module
 */

import { Effect, Fiber, Stream, SubscriptionRef } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { getRuntime, runEffect } from "../effect/runtime";
import {
	TimerConfig,
	type TimerPreset,
	type TimerState,
} from "../effect/schema/TimerState";
import { AudioNotification } from "../effect/services/AudioNotification";
import { TIMER_PRESETS, Timer } from "../effect/services/Timer";
import {
	completeBreakSession,
	completeFocusSession,
	completePomodoro,
	createBreakSession,
	createFocusSession,
	createPomodoro,
} from "../lib/sessionApi";

/**
 * Hook for managing pomodoro timer state and controls.
 *
 * @since 0.0.1
 * @category Hooks
 */
export function useTimer() {
	const [state, setState] = useState<TimerState | null>(null);
	const dbPomodoroIdRef = useRef<string | null>(null);
	const dbFocusSessionIdRef = useRef<string | null>(null);
	const dbBreakSessionIdRef = useRef<string | null>(null);

	useEffect(() => {
		const runtime = getRuntime();
		let disposed = false;

		const subscription = Effect.gen(function* () {
			const timer = yield* Timer;
			const audio = yield* AudioNotification;

			yield* timer.setOnTimerEnd(() => {
				runEffect(audio.play());
			});

			const initial = yield* SubscriptionRef.get(timer.state);
			if (!disposed) setState(initial);

			yield* Stream.runForEach(timer.changes, (newState) =>
				Effect.sync(() => {
					if (!disposed) setState(newState);
				}),
			);
		});

		const fiber = runtime.runFork(subscription);

		return () => {
			disposed = true;
			runtime.runFork(Fiber.interrupt(fiber));
		};
	}, []);

	const start = useCallback(async () => {
		if (!state) return;

		if (state.phase === "idle") {
			try {
				const pomodoro = await createPomodoro();
				dbPomodoroIdRef.current = pomodoro.id;

				const focusSession = await createFocusSession(
					pomodoro.id,
					state.config.focusDuration,
				);
				dbFocusSessionIdRef.current = focusSession.id;
			} catch (e) {
				console.error("Failed to create session:", e);
			}
		}

		await runEffect(
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
			}),
		);
	}, [state]);

	const reset = useCallback(async () => {
		await runEffect(
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.reset();
			}),
		);
	}, []);

	const switchPhase = useCallback(
		async (options?: { autoStart?: boolean }) => {
			if (!state) return;

			if (state.phase === "focus") {
				if (dbFocusSessionIdRef.current) {
					await completeFocusSession(
						dbFocusSessionIdRef.current,
						state.totalElapsedSeconds,
					).catch((e) => console.error("Failed to complete focus session:", e));
					dbFocusSessionIdRef.current = null;
				}

				if (dbPomodoroIdRef.current) {
					const breakSession = await createBreakSession(
						dbPomodoroIdRef.current,
						state.config.breakDuration,
					).catch((e) => {
						console.error("Failed to create break session:", e);
						return null;
					});
					if (breakSession) {
						dbBreakSessionIdRef.current = breakSession.id;
					}
				}
			} else if (state.phase === "break") {
				if (dbBreakSessionIdRef.current) {
					await completeBreakSession(
						dbBreakSessionIdRef.current,
						state.totalElapsedSeconds,
					).catch((e) => console.error("Failed to complete break session:", e));
					dbBreakSessionIdRef.current = null;
				}

				if (dbPomodoroIdRef.current) {
					await completePomodoro(dbPomodoroIdRef.current).catch((e) =>
						console.error("Failed to complete pomodoro:", e),
					);
					dbPomodoroIdRef.current = null;
				}

				try {
					const pomodoro = await createPomodoro();
					dbPomodoroIdRef.current = pomodoro.id;

					const focusSession = await createFocusSession(
						pomodoro.id,
						state.config.focusDuration,
					);
					dbFocusSessionIdRef.current = focusSession.id;
				} catch (e) {
					console.error("Failed to create new cycle:", e);
				}
			}

			await runEffect(
				Effect.gen(function* () {
					const timer = yield* Timer;
					yield* timer.switchPhase(options);
				}),
			);
		},
		[state],
	);

	const endSession = useCallback(
		async (options?: { switchToNext?: boolean }) => {
			if (!state) return;

			if (state.phase === "focus" && dbFocusSessionIdRef.current) {
				await completeFocusSession(
					dbFocusSessionIdRef.current,
					state.totalElapsedSeconds,
				).catch((e) => console.error("Failed to complete focus session:", e));
				dbFocusSessionIdRef.current = null;
			} else if (state.phase === "break" && dbBreakSessionIdRef.current) {
				await completeBreakSession(
					dbBreakSessionIdRef.current,
					state.totalElapsedSeconds,
				).catch((e) => console.error("Failed to complete break session:", e));
				dbBreakSessionIdRef.current = null;

				if (dbPomodoroIdRef.current) {
					await completePomodoro(dbPomodoroIdRef.current).catch((e) =>
						console.error("Failed to complete pomodoro:", e),
					);
					dbPomodoroIdRef.current = null;
				}
			}

			if (options?.switchToNext) {
				if (state.phase === "focus" && dbPomodoroIdRef.current) {
					const breakSession = await createBreakSession(
						dbPomodoroIdRef.current,
						state.config.breakDuration,
					).catch((e) => {
						console.error("Failed to create break session:", e);
						return null;
					});
					if (breakSession) {
						dbBreakSessionIdRef.current = breakSession.id;
					}
				} else if (state.phase === "break") {
					try {
						const pomodoro = await createPomodoro();
						dbPomodoroIdRef.current = pomodoro.id;

						const focusSession = await createFocusSession(
							pomodoro.id,
							state.config.focusDuration,
						);
						dbFocusSessionIdRef.current = focusSession.id;
					} catch (e) {
						console.error("Failed to create new cycle:", e);
					}
				}
			}

			await runEffect(
				Effect.gen(function* () {
					const timer = yield* Timer;
					yield* timer.endSession(options);
				}),
			);
		},
		[state],
	);

	const skip = useCallback(async () => {
		await switchPhase({ autoStart: true });
	}, [switchPhase]);

	const stop = useCallback(async () => {
		if (!state) return;

		if (state.phase === "focus" && dbFocusSessionIdRef.current) {
			await completeFocusSession(
				dbFocusSessionIdRef.current,
				state.totalElapsedSeconds,
			).catch((e) => console.error("Failed to complete focus session:", e));
			dbFocusSessionIdRef.current = null;
		} else if (state.phase === "break" && dbBreakSessionIdRef.current) {
			await completeBreakSession(
				dbBreakSessionIdRef.current,
				state.totalElapsedSeconds,
			).catch((e) => console.error("Failed to complete break session:", e));
			dbBreakSessionIdRef.current = null;
		}

		if (dbPomodoroIdRef.current) {
			await completePomodoro(dbPomodoroIdRef.current).catch((e) =>
				console.error("Failed to complete pomodoro:", e),
			);
			dbPomodoroIdRef.current = null;
		}

		await runEffect(
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.stop();
			}),
		);
	}, [state]);

	const setConfig = useCallback(
		(focusMinutes: number, breakMinutes: number) =>
			runEffect(
				Effect.gen(function* () {
					const timer = yield* Timer;
					yield* timer.setConfig(
						new TimerConfig({
							focusDuration: focusMinutes * 60,
							breakDuration: breakMinutes * 60,
							preset: "custom",
						}),
					);
				}),
			),
		[],
	);

	const setPreset = useCallback(
		(preset: TimerPreset) =>
			runEffect(
				Effect.gen(function* () {
					const timer = yield* Timer;
					yield* timer.setPreset(preset);
				}),
			),
		[],
	);

	return {
		state,
		start,
		reset,
		switchPhase,
		endSession,
		skip,
		stop,
		setConfig,
		setPreset,
		presets: TIMER_PRESETS,
	};
}
