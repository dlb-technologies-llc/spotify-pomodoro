/**
 * Timer service unit tests.
 *
 * @module
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect, SubscriptionRef } from "effect";
import { TimerConfig } from "@/effect/schema/TimerState";
import { TIMER_PRESETS, Timer } from "@/effect/services/Timer";

describe("Timer Service", () => {
	describe("initial state", () => {
		it.effect("starts in idle phase", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.phase).toBe("idle");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("starts in stopped status", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.status).toBe("stopped");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("has default 25 minute focus duration", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.config.focusDuration).toBe(25 * 60);
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("has default 5 minute break duration", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.config.breakDuration).toBe(5 * 60);
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("start", () => {
		it.effect("transitions from idle to focus phase", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.phase).toBe("focus");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("sets status to running", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.status).toBe("running");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("generates a pomodoro ID", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.currentPomodoroId).not.toBeNull();
				expect(typeof state.currentPomodoroId).toBe("string");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("sets remaining seconds to focus duration", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.remainingSeconds).toBe(state.config.focusDuration);
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("reset", () => {
		it.effect("sets status to stopped", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.reset();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.status).toBe("stopped");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("resets remaining seconds to configured duration", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.reset();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.remainingSeconds).toBe(state.config.focusDuration);
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("clears overtime", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.reset();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.overtime).toBe(0);
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("switchPhase", () => {
		it.effect("switches from focus to break", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.switchPhase();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.phase).toBe("break");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("switches from break to focus", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.switchPhase();
				yield* timer.switchPhase();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.phase).toBe("focus");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("increments session count when leaving focus", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				const beforeState = yield* SubscriptionRef.get(timer.state);
				yield* timer.switchPhase();
				const afterState = yield* SubscriptionRef.get(timer.state);
				expect(afterState.sessionCount).toBe(beforeState.sessionCount + 1);
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("does not increment session count when leaving break", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.switchPhase();
				const beforeState = yield* SubscriptionRef.get(timer.state);
				yield* timer.switchPhase();
				const afterState = yield* SubscriptionRef.get(timer.state);
				expect(afterState.sessionCount).toBe(beforeState.sessionCount);
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("auto-starts when autoStart option is true", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.switchPhase({ autoStart: true });
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.status).toBe("running");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("stops when autoStart option is false", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.switchPhase({ autoStart: false });
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.status).toBe("stopped");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("generates new pomodoro ID when switching to focus", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				const firstPomodoroId = (yield* SubscriptionRef.get(timer.state))
					.currentPomodoroId;
				yield* timer.switchPhase();
				yield* timer.switchPhase();
				const secondPomodoroId = (yield* SubscriptionRef.get(timer.state))
					.currentPomodoroId;
				expect(secondPomodoroId).not.toBe(firstPomodoroId);
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("preserves pomodoro ID when switching to break", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				const focusPomodoroId = (yield* SubscriptionRef.get(timer.state))
					.currentPomodoroId;
				yield* timer.switchPhase();
				const breakPomodoroId = (yield* SubscriptionRef.get(timer.state))
					.currentPomodoroId;
				expect(breakPomodoroId).toBe(focusPomodoroId);
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("skip", () => {
		it.effect("switches phase with autoStart", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				yield* timer.skip();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.phase).toBe("break");
				expect(state.status).toBe("running");
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("setPreset", () => {
		it.effect("applies classic preset", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.setPreset("classic");
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.config.focusDuration).toBe(TIMER_PRESETS.classic.focus);
				expect(state.config.breakDuration).toBe(TIMER_PRESETS.classic.break);
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("applies long preset", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.setPreset("long");
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.config.focusDuration).toBe(TIMER_PRESETS.long.focus);
				expect(state.config.breakDuration).toBe(TIMER_PRESETS.long.break);
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("applies short preset", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.setPreset("short");
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.config.focusDuration).toBe(TIMER_PRESETS.short.focus);
				expect(state.config.breakDuration).toBe(TIMER_PRESETS.short.break);
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("updates remaining seconds when idle", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.setPreset("long");
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.remainingSeconds).toBe(TIMER_PRESETS.long.focus);
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("setConfig", () => {
		it.effect("applies custom configuration", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				const customConfig = new TimerConfig({
					focusDuration: 45 * 60,
					breakDuration: 15 * 60,
					preset: "custom",
				});
				yield* timer.setConfig(customConfig);
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.config.focusDuration).toBe(45 * 60);
				expect(state.config.breakDuration).toBe(15 * 60);
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("displayTime", () => {
		it.effect("formats time correctly for idle state", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.displayTime).toBe("25:00");
			}).pipe(Effect.provide(Timer.layer)),
		);

		it.effect("formats time correctly after preset change", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.setPreset("short");
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.displayTime).toBe("15:00");
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("totalElapsedSeconds", () => {
		it.effect("calculates elapsed time correctly", () =>
			Effect.gen(function* () {
				const timer = yield* Timer;
				yield* timer.start();
				const state = yield* SubscriptionRef.get(timer.state);
				expect(state.totalElapsedSeconds).toBe(0);
			}).pipe(Effect.provide(Timer.layer)),
		);
	});

	describe("TIMER_PRESETS", () => {
		it("has classic preset with 25/5 minutes", () => {
			expect(TIMER_PRESETS.classic.focus).toBe(25 * 60);
			expect(TIMER_PRESETS.classic.break).toBe(5 * 60);
		});

		it("has long preset with 50/10 minutes", () => {
			expect(TIMER_PRESETS.long.focus).toBe(50 * 60);
			expect(TIMER_PRESETS.long.break).toBe(10 * 60);
		});

		it("has short preset with 15/3 minutes", () => {
			expect(TIMER_PRESETS.short.focus).toBe(15 * 60);
			expect(TIMER_PRESETS.short.break).toBe(3 * 60);
		});
	});
});
