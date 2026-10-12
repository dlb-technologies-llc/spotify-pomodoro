/**
 * Timer countdown, overtime, and phase changes on a virtual clock.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Schema, Stream } from "effect";
import { KeyValueStore } from "effect/persistence";
import { TestClock } from "effect/testing";
import { Timer } from "@/client/Timer";
import { TIMER_PRESETS, TimerConfig } from "@/shared/domain/Timer";

const withTimer = <A, E>(f: (timer: Timer["Service"]) => Effect.Effect<A, E>) =>
	Effect.flatMap(Timer.make, f).pipe(Effect.provide(KeyValueStore.layerMemory));

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
				yield* timer.setConfig(TIMER_PRESETS.short);
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
				yield* timer.setConfig(TIMER_PRESETS.long);
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
		[Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 45 * 60 }))],
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
		{ arbitrary: { runs: 25 } },
	);

	it.effect("resumes the same countdown after a reload", () =>
		Effect.gen(function* () {
			const store = yield* Layer.build(KeyValueStore.layerMemory);
			const load = Timer.make.pipe(Effect.provide(store));
			const first = yield* load;
			yield* first.start();
			yield* TestClock.adjust("5 minutes");
			const reloaded = yield* load;
			const state = yield* reloaded.get;
			assert.strictEqual(state.phase, "focus");
			assert.strictEqual(state.status, "running");
			assert.strictEqual(state.remainingSeconds, 20 * 60);
			yield* TestClock.adjust("1 minute");
			assert.strictEqual((yield* reloaded.get).remainingSeconds, 19 * 60);
		}),
	);

	it.effect("restores a stopped preset and stays stopped", () =>
		Effect.gen(function* () {
			const store = yield* Layer.build(KeyValueStore.layerMemory);
			const load = Timer.make.pipe(Effect.provide(store));
			yield* (yield* load).setConfig(TIMER_PRESETS.long);
			const state = yield* (yield* load).get;
			assert.strictEqual(state.config.preset, "long");
			assert.strictEqual(state.status, "stopped");
			assert.strictEqual(
				state.remainingSeconds,
				TIMER_PRESETS.long.focusSeconds,
			);
		}),
	);

	it.effect("takes a long break after every N focus sessions", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				yield* timer.setConfig(
					new TimerConfig({ ...TIMER_PRESETS.short, longBreakEvery: 2 }),
				);
				yield* timer.start();
				yield* timer.switchPhase();
				assert.strictEqual((yield* timer.get).phase, "break");
				yield* timer.switchPhase();
				const second = yield* timer.get;
				assert.strictEqual(second.phase, "focus");
				assert.strictEqual(second.cycleProgress, 1);
				assert.strictEqual(second.nextBreak, "longBreak");
				yield* timer.switchPhase();
				const long = yield* timer.get;
				assert.strictEqual(long.phase, "longBreak");
				assert.strictEqual(
					long.remainingSeconds,
					TIMER_PRESETS.short.longBreakSeconds,
				);
				assert.strictEqual(long.cycleProgress, 0);
				yield* timer.switchPhase();
				assert.strictEqual((yield* timer.get).nextBreak, "break");
			}),
		),
	);

	it.effect("ending a focus session counts toward the cycle", () =>
		withTimer((timer) =>
			Effect.gen(function* () {
				yield* timer.start();
				yield* timer.stop();
				assert.strictEqual((yield* timer.get).focusCompleted, 1);
			}),
		),
	);
});
