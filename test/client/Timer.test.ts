/**
 * Timer countdown, overtime, and phase changes on a virtual clock.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";
import { Timer } from "@/client/Timer";
import { TIMER_PRESETS } from "@/shared/domain/Timer";

const withTimer = <A, E>(f: (timer: Timer["Service"]) => Effect.Effect<A, E>) =>
	Effect.flatMap(Timer.make, f);

describe("Timer", () => {
	it.effect("starts idle on the classic preset", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				const state = yield* timer.get;
				assert.strictEqual(state.phase, "idle");
				assert.strictEqual(state.status, "stopped");
				assert.strictEqual(state.displayTime, "25:00");
			}),
		),
	);

	it.effect("counts down while running", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				yield* timer.start();
				assert.strictEqual((yield* timer.get).phase, "focus");
				yield* TestClock.adjust("61 seconds");
				const state = yield* timer.get;
				assert.strictEqual(state.remainingSeconds, 25 * 60 - 61);
				assert.strictEqual(state.displayTime, "23:59");
				assert.strictEqual(state.elapsedSeconds, 61);
			}),
		),
	);

	it.effect("announces zero once, then counts overtime", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				yield* timer.setPreset("short");
				const completions = yield* timer.completions.pipe(
					Stream.take(1),
					Stream.runCollect,
					Effect.forkChild,
				);
				yield* timer.start();
				yield* TestClock.adjust("15 minutes");
				assert.deepStrictEqual(yield* Fiber.join(completions), ["focus"]);
				yield* TestClock.adjust("75 seconds");
				const state = yield* timer.get;
				assert.isTrue(state.isOvertime);
				assert.strictEqual(state.overtimeSeconds, 75);
				assert.strictEqual(state.displayTime, "+01:15");
				assert.strictEqual(state.elapsedSeconds, 15 * 60 + 75);
			}),
		),
	);

	it.effect("switches between focus and break with fresh durations", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				yield* timer.start();
				yield* TestClock.adjust("10 minutes");
				yield* timer.switchPhase();
				let state = yield* timer.get;
				assert.strictEqual(state.phase, "break");
				assert.strictEqual(state.status, "running");
				assert.strictEqual(state.remainingSeconds, 5 * 60);
				yield* TestClock.adjust("1 minute");
				assert.strictEqual((yield* timer.get).remainingSeconds, 4 * 60);
				yield* timer.switchPhase();
				state = yield* timer.get;
				assert.strictEqual(state.phase, "focus");
				assert.strictEqual(state.remainingSeconds, 25 * 60);
			}),
		),
	);

	it.effect("ignores switching while idle", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				yield* timer.switchPhase();
				assert.strictEqual((yield* timer.get).phase, "idle");
			}),
		),
	);

	it.effect("reset stops the clock and restores the phase duration", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				yield* timer.start();
				yield* TestClock.adjust("3 minutes");
				yield* timer.reset();
				const state = yield* timer.get;
				assert.strictEqual(state.status, "stopped");
				assert.strictEqual(state.remainingSeconds, 25 * 60);
				yield* TestClock.adjust("3 minutes");
				assert.strictEqual((yield* timer.get).remainingSeconds, 25 * 60);
			}),
		),
	);

	it.effect("stop returns to idle with the chosen preset", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				yield* timer.setPreset("long");
				yield* timer.start();
				yield* TestClock.adjust("5 minutes");
				yield* timer.stop();
				const state = yield* timer.get;
				assert.strictEqual(state.phase, "idle");
				assert.strictEqual(
					state.remainingSeconds,
					TIMER_PRESETS.long.focusSeconds,
				);
				assert.strictEqual(state.config.preset, "long");
			}),
		),
	);

	it.effect.prop(
		"remaining, overtime, and elapsed agree with the clock",
		[Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 * 60 * 60 }))],
		([seconds]) =>
			withTimer((timer) =>
				Effect.gen(function* () {
					yield* timer.start();
					yield* TestClock.adjust(`${seconds} seconds`);
					const state = yield* timer.get;
					const duration = TIMER_PRESETS.classic.focusSeconds;
					assert.strictEqual(state.elapsedSeconds, seconds);
					assert.strictEqual(
						state.remainingSeconds,
						Math.max(0, duration - seconds),
					);
					assert.strictEqual(
						state.overtimeSeconds,
						Math.max(0, seconds - duration),
					);
					assert.strictEqual(state.isOvertime, seconds >= duration);
				}),
			).pipe(Effect.scoped),
	);
});
