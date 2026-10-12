/**
 * The HTTP API exercised end to end on an in-memory database.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { ApiClient } from "@/client/ApiClient";
import { Pomodoro, Seconds } from "@/shared/domain/Session";
import { sample } from "../support/arbitrary";
import { apiClientFor, send, startServer } from "../support/server";

describe("sessions API", () => {
	it.effect("health reports ok", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const response = yield* send(handler, "/api/health");
			assert.strictEqual(response.status, 200);
			assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
				status: "ok",
			});
		}),
	);

	it.effect("records a full pomodoro and reports it in stats", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const configured = yield* sample(Seconds);
			const elapsed = yield* sample(Seconds);
			const { sessions } = yield* Effect.provide(
				ApiClient,
				apiClientFor(handler),
			);

			const pomodoro = yield* sessions.createPomodoro();
			assert.isTrue(Option.isNone(pomodoro.completedAt));

			const focus = yield* sessions.startFocus({
				payload: { pomodoroId: pomodoro.id, configuredSeconds: configured },
			});
			assert.strictEqual(focus.pomodoroId, pomodoro.id);
			assert.strictEqual(focus.elapsedSeconds, 0);
			assert.isFalse(focus.completed);

			const doneFocus = yield* sessions.completeFocus({
				params: { id: focus.id },
				payload: { elapsedSeconds: elapsed },
			});
			assert.isTrue(doneFocus.completed);
			assert.strictEqual(doneFocus.elapsedSeconds, elapsed);

			const breakSession = yield* sessions.startBreak({
				payload: { pomodoroId: pomodoro.id, configuredSeconds: configured },
			});
			yield* sessions.completeBreak({
				params: { id: breakSession.id },
				payload: { elapsedSeconds: elapsed },
			});
			const completed = yield* sessions.completePomodoro({
				params: { id: pomodoro.id },
			});
			assert.isTrue(Option.isSome(completed.completedAt));

			const stats = yield* sessions.stats({ query: {} });
			assert.strictEqual(stats.totalPomodoros, 1);
			assert.strictEqual(stats.completedPomodoros, 1);
			assert.strictEqual(stats.completedFocusSessions, 1);
			assert.strictEqual(stats.completedBreakSessions, 1);
			assert.strictEqual(stats.totalFocusSeconds, elapsed);
			assert.strictEqual(stats.today.pomodoros, 1);
			assert.strictEqual(stats.currentStreak, 1);
		}),
	);

	it.effect("returns typed 404s for unknown records", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const missing = yield* sample(Pomodoro.json);
			const { sessions } = yield* Effect.provide(
				ApiClient,
				apiClientFor(handler),
			);

			const pomodoro = yield* Effect.flip(
				sessions.completePomodoro({ params: { id: missing.id } }),
			);
			assert.strictEqual(pomodoro._tag, "PomodoroNotFound");

			const focus = yield* Effect.flip(
				sessions.startFocus({
					payload: { pomodoroId: missing.id, configuredSeconds: 60 },
				}),
			);
			assert.strictEqual(focus._tag, "PomodoroNotFound");

			const response = yield* send(
				handler,
				`/api/break-sessions/${missing.id}/complete`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ elapsedSeconds: 1 }),
				},
			);
			assert.strictEqual(response.status, 404);
		}),
	);

	it.effect("rejects invalid payloads with 400", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			for (const body of [
				"not json",
				JSON.stringify({ pomodoroId: "p", configuredSeconds: -1 }),
				JSON.stringify({ pomodoroId: "p", configuredSeconds: 1.5 }),
				JSON.stringify({ configuredSeconds: 60 }),
			]) {
				const response = yield* send(handler, "/api/focus-sessions", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				});
				assert.strictEqual(response.status, 400, body);
			}
		}),
	);

	it.effect("rejects an unknown time zone", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const response = yield* send(handler, "/api/stats?tz=Not/AZone");
			assert.strictEqual(response.status, 400);
			const ok = yield* send(handler, "/api/stats?tz=Pacific/Auckland");
			assert.strictEqual(ok.status, 200);
		}),
	);
});
