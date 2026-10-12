/**
 * The HTTP API exercised end to end on an in-memory database.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";
import { TestClock } from "effect/testing";
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

			const pomodoro = yield* sessions.createPomodoro({ query: {} });
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
				query: {},
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
				sessions.completePomodoro({ params: { id: missing.id }, query: {} }),
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

	it.effect("stores, changes, and clears a pomodoro label", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const { sessions } = yield* Effect.provide(
				ApiClient,
				apiClientFor(handler),
			);
			const created = yield* sessions.createPomodoro({
				query: { label: "write report" },
			});
			assert.deepStrictEqual(created.label, Option.some("write report"));
			const changed = yield* sessions.labelPomodoro({
				params: { id: created.id },
				payload: { label: "review PR" },
			});
			assert.deepStrictEqual(changed.label, Option.some("review PR"));
			const cleared = yield* sessions.labelPomodoro({
				params: { id: created.id },
				payload: { label: null },
			});
			assert.isTrue(Option.isNone(cleared.label));

			const unlabeled = yield* send(handler, "/api/pomodoros", {
				method: "POST",
			});
			assert.strictEqual(unlabeled.status, 201);
			const tooLong = yield* send(
				handler,
				`/api/pomodoros?label=${"x".repeat(121)}`,
				{ method: "POST" },
			);
			assert.strictEqual(tooLong.status, 400);
		}),
	);

	it.effect("pages history, deletes, exports, and re-imports", () =>
		Effect.gen(function* () {
			const handler = yield* startServer();
			const { sessions, data } = yield* Effect.provide(
				ApiClient,
				apiClientFor(handler),
			);
			const ids = [];
			for (const label of ["one", "two", "three"]) {
				const pomodoro = yield* sessions.createPomodoro({ query: { label } });
				const focus = yield* sessions.startFocus({
					payload: { pomodoroId: pomodoro.id, configuredSeconds: 60 },
				});
				yield* sessions.completeFocus({
					params: { id: focus.id },
					payload: { elapsedSeconds: 90 },
				});
				yield* sessions.completePomodoro({
					params: { id: pomodoro.id },
					query: {},
				});
				ids.push(pomodoro.id);
				yield* TestClock.adjust("1 second");
			}

			const first = yield* data.history({ query: { limit: 2 } });
			assert.deepStrictEqual(
				first.items.map((e) => Option.getOrNull(e.label)),
				["three", "two"],
			);
			assert.strictEqual(first.items[0]?.focusSeconds, 90);
			assert.strictEqual(first.items[0]?.overtimeSeconds, 30);
			const second = yield* data.history({
				query: { limit: 2, before: Option.getOrUndefined(first.nextBefore) },
			});
			assert.deepStrictEqual(
				second.items.map((e) => Option.getOrNull(e.label)),
				["one"],
			);
			assert.isTrue(Option.isNone(second.nextBefore));

			const exported = yield* data.exportJson();
			assert.strictEqual(exported.pomodoros.length, 3);
			const csv = yield* send(handler, "/api/export.csv");
			assert.match(
				csv.headers.get("content-disposition") ?? "",
				/attachment; filename="spotify-pomodoro-/,
			);
			const text = yield* Effect.promise(() => csv.text());
			assert.strictEqual(text.trim().split("\n").length, 4);
			assert.match(
				text,
				/^pomodoro_id,label,created_at,completed_at,focus_seconds/,
			);

			yield* sessions.deletePomodoro({ params: { id: ids[0] ?? "" } });
			const afterDelete = yield* sessions.stats({ query: {} });
			assert.strictEqual(afterDelete.totalPomodoros, 2);
			const missing = yield* Effect.flip(
				sessions.deletePomodoro({ params: { id: ids[0] ?? "" } }),
			);
			assert.strictEqual(missing._tag, "PomodoroNotFound");

			const imported = yield* data.import({ payload: exported });
			assert.deepStrictEqual(
				[imported.pomodoros, imported.focusSessions, imported.skipped],
				[1, 1, 4],
			);
			const restored = yield* sessions.stats({ query: {} });
			assert.strictEqual(restored.totalPomodoros, 3);
			assert.strictEqual(restored.totalFocusSeconds, 270);
		}),
	);

	it.effect(
		"accepts client ids and times so offline recordings replay safely",
		() =>
			Effect.gen(function* () {
				const handler = yield* startServer();
				const { sessions } = yield* Effect.provide(
					ApiClient,
					apiClientFor(handler),
				);
				const { id } = yield* sample(Pomodoro);
				const past = Date.parse("2025-03-01T09:00:00Z");
				const first = yield* sessions.createPomodoro({
					query: { id, at: past },
				});
				const again = yield* sessions.createPomodoro({
					query: { id, at: past + 5000 },
				});
				assert.strictEqual(first.id, id);
				assert.strictEqual(DateTime.toEpochMillis(again.createdAt), past);

				const focusId = crypto.randomUUID();
				const focus = yield* sessions.startFocus({
					payload: {
						id: focusId,
						pomodoroId: id,
						configuredSeconds: 60,
						at: past,
					},
				});
				const duplicate = yield* sessions.startFocus({
					payload: {
						id: focusId,
						pomodoroId: id,
						configuredSeconds: 60,
						at: past,
					},
				});
				assert.strictEqual(duplicate.id, focus.id);
				assert.strictEqual(DateTime.toEpochMillis(focus.startedAt), past);

				const done = yield* sessions.completeFocus({
					params: { id: focus.id },
					payload: { elapsedSeconds: 60, at: past + 60_000 },
				});
				assert.deepStrictEqual(
					Option.map(done.completedAt, DateTime.toEpochMillis),
					Option.some(past + 60_000),
				);

				const future = yield* sessions.completePomodoro({
					params: { id },
					query: { at: Date.now() + 86_400_000 },
				});
				assert.isAtMost(
					Option.getOrThrow(
						Option.map(future.completedAt, DateTime.toEpochMillis),
					),
					Date.now(),
				);
				const stats = yield* sessions.stats({ query: {} });
				assert.strictEqual(stats.totalPomodoros, 1);
			}),
	);
});
