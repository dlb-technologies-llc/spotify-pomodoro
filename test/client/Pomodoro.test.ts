/**
 * Pomodoro controls recording through the real API on an in-memory database.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Ref, Schedule } from "effect";
import { TestClock } from "effect/testing";
import { ApiClient } from "@/client/ApiClient";
import { AudioNotification } from "@/client/AudioNotification";
import { Pomodoro } from "@/client/Pomodoro";
import { SessionRecorder } from "@/client/SessionRecorder";
import { Timer } from "@/client/Timer";
import { httpClientFrom } from "../support/http";
import { apiClientFor, BASE_URL, startServer } from "../support/server";

const controls = (
	api: Layer.Layer<ApiClient>,
	audio = AudioNotification.layerSilent,
) =>
	Pomodoro.layer.pipe(
		Layer.provideMerge(
			Layer.mergeAll(Timer.layer, SessionRecorder.layer, audio),
		),
		Layer.provideMerge(api),
	);

const eventually = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	effect.pipe(
		Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 100 }),
	);

const settle = Effect.repeat(Effect.yieldNow, { times: 20 });

const stats = ApiClient.use((api) => api.sessions.stats({ query: {} }));

describe("Pomodoro", () => {
	it.live("records a cycle: focus → break → focus → end", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			yield* Effect.gen(function* () {
				const pomodoro = yield* Pomodoro;
				const timer = yield* Timer;

				yield* pomodoro.start();
				assert.strictEqual((yield* timer.get).phase, "focus");
				yield* pomodoro.skip();
				assert.strictEqual((yield* timer.get).phase, "break");
				yield* pomodoro.skip();
				assert.strictEqual((yield* timer.get).phase, "focus");
				yield* pomodoro.stop();
				assert.strictEqual((yield* timer.get).phase, "idle");

				const result = yield* eventually(
					stats.pipe(
						Effect.filterOrFail(
							(s) => s.completedPomodoros === 2,
							() => "recording still in flight",
						),
					),
				);
				assert.strictEqual(result.totalPomodoros, 2);
				assert.strictEqual(result.completedFocusSessions, 2);
				assert.strictEqual(result.completedBreakSessions, 1);
			}).pipe(Effect.provide(controls(apiClientFor(handler))));
		}),
	);

	it.live("start does nothing while running", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			yield* Effect.gen(function* () {
				const pomodoro = yield* Pomodoro;
				yield* pomodoro.start();
				yield* pomodoro.start();
				yield* pomodoro.stop();
				const result = yield* eventually(
					stats.pipe(
						Effect.filterOrFail(
							(s) => s.completedPomodoros === 1,
							() => "recording still in flight",
						),
					),
				);
				assert.strictEqual(result.totalPomodoros, 1);
			}).pipe(Effect.provide(controls(apiClientFor(handler))));
		}),
	);

	it.live("keeps the timer working when the API is down", () =>
		Effect.gen(function* () {
			const offline = ApiClient.layerWithBaseUrl(BASE_URL).pipe(
				Layer.provide(
					httpClientFrom(() => new Response("down", { status: 503 })),
				),
			);
			yield* Effect.gen(function* () {
				const pomodoro = yield* Pomodoro;
				const timer = yield* Timer;
				yield* pomodoro.start();
				yield* pomodoro.skip();
				yield* pomodoro.stop();
				assert.strictEqual((yield* timer.get).phase, "idle");
			}).pipe(Effect.provide(controls(offline)));
		}),
	);

	it.effect("chimes once when a phase reaches zero", () =>
		Effect.gen(function* () {
			const chimes = yield* Ref.make(0);
			const audio = Layer.succeed(AudioNotification, {
				play: Ref.update(chimes, (n) => n + 1),
			});
			const offline = ApiClient.layerWithBaseUrl(BASE_URL).pipe(
				Layer.provide(
					httpClientFrom(() => new Response("down", { status: 503 })),
				),
			);
			yield* Effect.gen(function* () {
				const pomodoro = yield* Pomodoro;
				yield* pomodoro.setPreset("short");
				yield* pomodoro.start();
				yield* TestClock.adjust("14 minutes");
				yield* settle;
				assert.strictEqual(yield* Ref.get(chimes), 0);
				yield* TestClock.adjust("1 minute");
				yield* settle;
				assert.strictEqual(yield* Ref.get(chimes), 1);
				yield* TestClock.adjust("10 minutes");
				yield* settle;
				assert.strictEqual(yield* Ref.get(chimes), 1);
			}).pipe(Effect.provide(controls(offline, audio)));
		}),
	);
});
