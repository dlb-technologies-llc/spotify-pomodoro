/**
 * Pomodoro controls recording through the real API on an in-memory database.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Ref, Schedule } from "effect";
import { KeyValueStore } from "effect/persistence";
import { TestClock } from "effect/testing";
import { ApiClient } from "@/client/ApiClient";
import { AudioNotification } from "@/client/AudioNotification";
import { Notifier } from "@/client/Notifier";
import { Outbox } from "@/client/Outbox";
import { Pomodoro } from "@/client/Pomodoro";
import { ScreenWake } from "@/client/ScreenWake";
import {
	RECORDING_STORAGE_KEY,
	SessionRecorder,
} from "@/client/SessionRecorder";
import { RecordingIds } from "@/shared/domain/Session";
import { Settings } from "@/shared/domain/Settings";
import { TimerConfig } from "@/shared/domain/Timer";
import { SettingsStore } from "@/client/SettingsStore";
import { Timer } from "@/client/Timer";
import { httpClientFrom } from "../support/http";
import { apiClientFor, BASE_URL, startServer } from "../support/server";

const controls = (
	api: Layer.Layer<ApiClient>,
	options: {
		readonly audio?: Layer.Layer<AudioNotification>;
		readonly notifier?: Layer.Layer<Notifier>;
		readonly screen?: Layer.Layer<ScreenWake>;
		readonly store?: Layer.Layer<KeyValueStore.KeyValueStore>;
	} = {},
) =>
	Pomodoro.layer.pipe(
		Layer.provideMerge(
			Layer.mergeAll(
				Timer.layer,
				SessionRecorder.layer,
				options.audio ?? AudioNotification.layerSilent,
				options.notifier ?? Notifier.layerNoop,
				options.screen ?? ScreenWake.layerNoop,
			),
		),
		Layer.provideMerge(SettingsStore.layer),
		Layer.provideMerge(Outbox.layer),
		Layer.provideMerge(api),
		Layer.provideMerge(options.store ?? KeyValueStore.layerMemory),
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
				play: () => Ref.update(chimes, (n) => n + 1),
			});
			const offline = ApiClient.layerWithBaseUrl(BASE_URL).pipe(
				Layer.provide(
					httpClientFrom(() => new Response("down", { status: 503 })),
				),
			);
			yield* Effect.gen(function* () {
				const pomodoro = yield* Pomodoro;
				yield* pomodoro.setPreset("short");
				yield* settle;
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
			}).pipe(Effect.provide(controls(offline, { audio })));
		}),
	);

	it.effect("notifies and keeps the screen awake while running", () =>
		Effect.gen(function* () {
			const notifications = yield* Ref.make<ReadonlyArray<string>>([]);
			const awake = yield* Ref.make<ReadonlyArray<boolean>>([]);
			const notifier = Layer.succeed(Notifier, {
				requestPermission: Effect.void,
				notify: (title: string) =>
					Ref.update(notifications, (all) => [...all, title]),
			});
			const screen = Layer.succeed(ScreenWake, {
				keepAwake: (on: boolean) => Ref.update(awake, (all) => [...all, on]),
			});
			const offline = ApiClient.layerWithBaseUrl(BASE_URL).pipe(
				Layer.provide(
					httpClientFrom(() => new Response("down", { status: 503 })),
				),
			);
			yield* Effect.gen(function* () {
				const pomodoro = yield* Pomodoro;
				yield* pomodoro.setPreset("short");
				yield* settle;
				yield* pomodoro.start();
				yield* TestClock.adjust("15 minutes");
				yield* settle;
				yield* pomodoro.skip();
				yield* TestClock.adjust("3 minutes");
				yield* settle;
				yield* pomodoro.stop();
				yield* settle;
			}).pipe(Effect.provide(controls(offline, { notifier, screen })));
			assert.deepStrictEqual(yield* Ref.get(notifications), [
				"Focus complete",
				"Break over",
			]);
			assert.deepStrictEqual(yield* Ref.get(awake), [false, true, false]);
		}),
	);

	it.live("finishes recording a pomodoro started before a reload", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const api = apiClientFor(handler);
			const store = yield* Layer.build(KeyValueStore.layerMemory);
			const shared = Layer.succeedContext(store);
			yield* Effect.gen(function* () {
				yield* (yield* Pomodoro).start();
				const recording = KeyValueStore.toSchemaStore(
					yield* KeyValueStore.KeyValueStore,
					RecordingIds,
				);
				yield* eventually(
					recording.get(RECORDING_STORAGE_KEY).pipe(
						Effect.filterOrFail(
							(ids) =>
								Option.exists(ids, (current) => Option.isSome(current.focus)),
							() => "focus session not recorded yet",
						),
					),
				);
			}).pipe(Effect.provide(controls(api, { store: shared })));

			yield* Effect.gen(function* () {
				const timer = yield* Timer;
				assert.strictEqual((yield* timer.get).phase, "focus");
				yield* (yield* Pomodoro).stop();
				const result = yield* eventually(
					stats.pipe(
						Effect.filterOrFail(
							(s) => s.completedPomodoros === 1,
							() => "recording still in flight",
						),
					),
				);
				assert.strictEqual(result.completedFocusSessions, 1);
			}).pipe(Effect.provide(controls(api, { store: shared })));
		}),
	);

	it.effect("follows settings: durations, chime, and auto-start", () =>
		Effect.gen(function* () {
			const chimes = yield* Ref.make<ReadonlyArray<string>>([]);
			const audio = Layer.succeed(AudioNotification, {
				play: (sound: string, volume: number) =>
					Ref.update(chimes, (all) => [...all, `${sound}@${volume}`]),
			});
			const offline = ApiClient.layerWithBaseUrl(BASE_URL).pipe(
				Layer.provide(
					httpClientFrom(() => new Response("down", { status: 503 })),
				),
			);
			yield* Effect.gen(function* () {
				const pomodoro = yield* Pomodoro;
				const timer = yield* Timer;
				yield* pomodoro.updateSettings(
					(current) =>
						new Settings({
							...current,
							timer: new TimerConfig({
								...current.timer,
								preset: "custom",
								focusSeconds: 120,
							}),
							autoStartBreaks: true,
							chime: "digital",
							chimeVolume: 0.5,
						}),
				);
				yield* settle;
				assert.strictEqual((yield* timer.get).remainingSeconds, 120);
				yield* pomodoro.start();
				yield* TestClock.adjust("2 minutes");
				yield* settle;
				const state = yield* timer.get;
				assert.strictEqual(state.phase, "break");
				assert.strictEqual(state.status, "running");
			}).pipe(Effect.provide(controls(offline, { audio })));
			assert.deepStrictEqual(yield* Ref.get(chimes), ["digital@0.5"]);
		}),
	);

	it.live("records the label and relabels the pomodoro in progress", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const api = apiClientFor(handler);
			yield* Effect.gen(function* () {
				const pomodoro = yield* Pomodoro;
				yield* pomodoro.relabel(Option.some("write report"));
				yield* pomodoro.start();
				const recording = KeyValueStore.toSchemaStore(
					yield* KeyValueStore.KeyValueStore,
					RecordingIds,
				);
				const ids = yield* eventually(
					recording.get(RECORDING_STORAGE_KEY).pipe(
						Effect.flatMap((stored) =>
							Option.match(
								Option.flatMap(stored, (current) => current.focus),
								{
									onNone: () => Effect.fail("not recorded yet"),
									onSome: () => Effect.succeed(stored),
								},
							),
						),
					),
				);
				const pomodoroId = Option.flatMap(ids, (current) => current.pomodoro);
				yield* pomodoro.relabel(Option.some("review PR"));
				const client = yield* ApiClient;
				const relabeled = yield* eventually(
					client.sessions
						.labelPomodoro({
							params: { id: Option.getOrThrow(pomodoroId) },
							payload: { label: "review PR" },
						})
						.pipe(
							Effect.filterOrFail(
								(p) => Option.contains(p.label, "review PR"),
								() => "label not applied",
							),
						),
				);
				assert.deepStrictEqual(relabeled.label, Option.some("review PR"));
			}).pipe(Effect.provide(controls(api)));
		}),
	);
});
