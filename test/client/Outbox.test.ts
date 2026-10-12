/**
 * Recording while offline and syncing once the server is reachable.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Schedule, Stream } from "effect";
import { KeyValueStore } from "effect/persistence";
import { ApiClient } from "@/client/ApiClient";
import { isRetryable, Outbox } from "@/client/Outbox";
import { SessionRecorder } from "@/client/SessionRecorder";
import { httpClientFrom } from "../support/http";
import { BASE_URL, startServer } from "../support/server";

const eventually = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	effect.pipe(
		Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 400 }),
	);

describe("Outbox", () => {
	it.live("queues while offline and replays in order with original times", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			let online = false;
			const seen: Array<string> = [];
			const api = ApiClient.layerWithBaseUrl(BASE_URL).pipe(
				Layer.provide(
					httpClientFrom(async (request) => {
						if (!online) throw new TypeError("Failed to fetch");
						seen.push(`${request.method} ${new URL(request.url).pathname}`);
						return handler(request);
					}),
				),
			);
			const layer = SessionRecorder.layer.pipe(
				Layer.provideMerge(Outbox.layer),
				Layer.provideMerge(api),
				Layer.provide(KeyValueStore.layerMemory),
			);
			yield* Effect.gen(function* () {
				const recorder = yield* SessionRecorder;
				yield* recorder.beginPomodoro(60);
				yield* recorder.focusToBreak(61, 30);
				yield* recorder.end("break", 31);
				const pending = yield* recorder.pendingCount.pipe(
					Stream.take(1),
					Stream.runHead,
				);
				assert.deepStrictEqual(pending._tag === "Some" ? pending.value : -1, 6);

				online = true;
				yield* eventually(
					recorder.pendingCount.pipe(
						Stream.take(1),
						Stream.runHead,
						Effect.filterOrFail(
							(count) => count._tag === "Some" && count.value === 0,
							() => "still syncing",
						),
					),
				);
				const stats = yield* ApiClient.use((client) =>
					client.sessions.stats({ query: {} }),
				);
				assert.strictEqual(stats.completedPomodoros, 1);
				assert.strictEqual(stats.totalFocusSeconds, 61);
				assert.strictEqual(stats.totalBreakSeconds, 31);
			}).pipe(Effect.provide(layer));
			assert.deepStrictEqual(
				seen
					.filter((line) => line.startsWith("POST"))
					.map((line) => line.replace(/[0-9a-f-]{36}/gi, ":id")),
				[
					"POST /api/pomodoros",
					"POST /api/focus-sessions",
					"POST /api/focus-sessions/:id/complete",
					"POST /api/break-sessions",
					"POST /api/break-sessions/:id/complete",
					"POST /api/pomodoros/:id/complete",
				],
			);
		}),
	);

	it("retries network and server errors, not rejections", () => {
		assert.isFalse(isRetryable(new Error("boom")));
		assert.isTrue(isRetryable({ _tag: "Unauthorized" }));
		assert.isFalse(isRetryable({ _tag: "PomodoroNotFound" }));
	});
});
