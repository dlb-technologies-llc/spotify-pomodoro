/**
 * SessionRepository unit tests using in-memory SQLite.
 *
 * @module
 */
import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { DbClientTest } from "@/db";
import {
	BreakSessionNotFoundError,
	FocusSessionNotFoundError,
	PomodoroNotFoundError,
} from "@/effect/errors/DatabaseError";
import {
	CompleteSessionInput,
	CreateBreakSessionInput,
	CreateFocusSessionInput,
} from "@/effect/schema/Session";
import { SessionRepository } from "@/effect/services/SessionRepository";

const TestLayer = SessionRepository.layer.pipe(Layer.provide(DbClientTest));

layer(TestLayer)("SessionRepository", (it) => {
	it.effect("creates a pomodoro", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			expect(pomodoro.id).toBeTruthy();
			expect(pomodoro.createdAt).toBeInstanceOf(Date);
			expect(pomodoro.completedAt).toBeNull();
		}),
	);

	it.effect("gets a pomodoro by id", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const created = yield* repo.createPomodoro();
			const fetched = yield* repo.getPomodoro(created.id);
			expect(fetched.id).toBe(created.id);
			expect(fetched.createdAt.getTime()).toBe(created.createdAt.getTime());
			expect(fetched.completedAt).toBeNull();
		}),
	);

	it.effect("completes a pomodoro", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const created = yield* repo.createPomodoro();
			const completed = yield* repo.completePomodoro(created.id);
			expect(completed.completedAt).toBeInstanceOf(Date);
			expect(completed.completedAt).not.toBeNull();
		}),
	);

	it.effect("creates a focus session", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const input = new CreateFocusSessionInput({
				pomodoroId: pomodoro.id,
				configuredSeconds: 1500,
			});
			const session = yield* repo.createFocusSession(input);
			expect(session.pomodoroId).toBe(pomodoro.id);
			expect(session.configuredSeconds).toBe(1500);
			expect(session.elapsedSeconds).toBe(0);
			expect(session.completed).toBe(false);
			expect(session.completedAt).toBeNull();
			expect(session.startedAt).toBeInstanceOf(Date);
		}),
	);

	it.effect("completes a focus session with elapsed seconds", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const input = new CreateFocusSessionInput({
				pomodoroId: pomodoro.id,
				configuredSeconds: 1500,
			});
			const session = yield* repo.createFocusSession(input);
			const completeInput = new CompleteSessionInput({
				elapsedSeconds: 1620,
			});
			const completed = yield* repo.completeFocusSession(
				session.id,
				completeInput,
			);
			expect(completed.elapsedSeconds).toBe(1620);
			expect(completed.completed).toBe(true);
			expect(completed.completedAt).toBeInstanceOf(Date);
		}),
	);

	it.effect("gets a focus session by id", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const input = new CreateFocusSessionInput({
				pomodoroId: pomodoro.id,
				configuredSeconds: 1500,
			});
			const created = yield* repo.createFocusSession(input);
			const fetched = yield* repo.getFocusSession(created.id);
			expect(fetched.id).toBe(created.id);
			expect(fetched.configuredSeconds).toBe(1500);
		}),
	);

	it.effect("creates a break session", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const input = new CreateBreakSessionInput({
				pomodoroId: pomodoro.id,
				configuredSeconds: 300,
			});
			const session = yield* repo.createBreakSession(input);
			expect(session.pomodoroId).toBe(pomodoro.id);
			expect(session.configuredSeconds).toBe(300);
			expect(session.elapsedSeconds).toBe(0);
			expect(session.completed).toBe(false);
			expect(session.completedAt).toBeNull();
			expect(session.startedAt).toBeInstanceOf(Date);
		}),
	);

	it.effect("completes a break session with elapsed seconds", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const input = new CreateBreakSessionInput({
				pomodoroId: pomodoro.id,
				configuredSeconds: 300,
			});
			const session = yield* repo.createBreakSession(input);
			const completeInput = new CompleteSessionInput({
				elapsedSeconds: 350,
			});
			const completed = yield* repo.completeBreakSession(
				session.id,
				completeInput,
			);
			expect(completed.elapsedSeconds).toBe(350);
			expect(completed.completed).toBe(true);
			expect(completed.completedAt).toBeInstanceOf(Date);
		}),
	);

	it.effect("gets a break session by id", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const input = new CreateBreakSessionInput({
				pomodoroId: pomodoro.id,
				configuredSeconds: 300,
			});
			const created = yield* repo.createBreakSession(input);
			const fetched = yield* repo.getBreakSession(created.id);
			expect(fetched.id).toBe(created.id);
			expect(fetched.configuredSeconds).toBe(300);
		}),
	);

	it.effect("fails with PomodoroNotFoundError for nonexistent pomodoro", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const error = yield* Effect.flip(
				repo.getPomodoro("nonexistent-pomodoro-id"),
			);
			expect(error).toBeInstanceOf(PomodoroNotFoundError);
		}),
	);

	it.effect(
		"fails with FocusSessionNotFoundError for nonexistent focus session",
		() =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const error = yield* Effect.flip(
					repo.getFocusSession("nonexistent-session-id"),
				);
				expect(error).toBeInstanceOf(FocusSessionNotFoundError);
			}),
	);

	it.effect(
		"fails with BreakSessionNotFoundError for nonexistent break session",
		() =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const error = yield* Effect.flip(
					repo.getBreakSession("nonexistent-session-id"),
				);
				expect(error).toBeInstanceOf(BreakSessionNotFoundError);
			}),
	);

	it.effect.prop(
		"creates focus session with any valid input",
		[CreateFocusSessionInput],
		([input]) =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const pomodoro = yield* repo.createPomodoro();
				const session = yield* repo.createFocusSession(
					new CreateFocusSessionInput({
						...input,
						pomodoroId: pomodoro.id,
					}),
				);
				expect(session.configuredSeconds).toBe(input.configuredSeconds);
				expect(session.pomodoroId).toBe(pomodoro.id);
				expect(session.completed).toBe(false);
				expect(session.elapsedSeconds).toBe(0);
			}),
	);

	it.effect.prop(
		"creates break session with any valid input",
		[CreateBreakSessionInput],
		([input]) =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const pomodoro = yield* repo.createPomodoro();
				const session = yield* repo.createBreakSession(
					new CreateBreakSessionInput({
						...input,
						pomodoroId: pomodoro.id,
					}),
				);
				expect(session.configuredSeconds).toBe(input.configuredSeconds);
				expect(session.pomodoroId).toBe(pomodoro.id);
				expect(session.completed).toBe(false);
				expect(session.elapsedSeconds).toBe(0);
			}),
	);

	it.effect.prop(
		"completes focus session with any valid elapsed time",
		[CompleteSessionInput],
		([completeInput]) =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const pomodoro = yield* repo.createPomodoro();
				const focus = yield* repo.createFocusSession(
					new CreateFocusSessionInput({
						pomodoroId: pomodoro.id,
						configuredSeconds: 1500,
					}),
				);
				const completed = yield* repo.completeFocusSession(
					focus.id,
					completeInput,
				);
				expect(completed.elapsedSeconds).toBe(completeInput.elapsedSeconds);
				expect(completed.completed).toBe(true);
				expect(completed.completedAt).toBeInstanceOf(Date);
			}),
	);

	it.effect.prop(
		"completes break session with any valid elapsed time",
		[CompleteSessionInput],
		([completeInput]) =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const pomodoro = yield* repo.createPomodoro();
				const breakSession = yield* repo.createBreakSession(
					new CreateBreakSessionInput({
						pomodoroId: pomodoro.id,
						configuredSeconds: 300,
					}),
				);
				const completed = yield* repo.completeBreakSession(
					breakSession.id,
					completeInput,
				);
				expect(completed.elapsedSeconds).toBe(completeInput.elapsedSeconds);
				expect(completed.completed).toBe(true);
				expect(completed.completedAt).toBeInstanceOf(Date);
			}),
	);
});

layer(TestLayer)("SessionRepository (stats)", (it) => {
	it.effect("returns correct stats after a complete pomodoro cycle", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;

			const pomodoro = yield* repo.createPomodoro();

			const focusInput = new CreateFocusSessionInput({
				pomodoroId: pomodoro.id,
				configuredSeconds: 1500,
			});
			const focus = yield* repo.createFocusSession(focusInput);
			yield* repo.completeFocusSession(
				focus.id,
				new CompleteSessionInput({ elapsedSeconds: 1600 }),
			);

			const breakInput = new CreateBreakSessionInput({
				pomodoroId: pomodoro.id,
				configuredSeconds: 300,
			});
			const breakSession = yield* repo.createBreakSession(breakInput);
			yield* repo.completeBreakSession(
				breakSession.id,
				new CompleteSessionInput({ elapsedSeconds: 320 }),
			);

			yield* repo.completePomodoro(pomodoro.id);

			const stats = yield* repo.getStats();
			expect(stats.totalPomodoros).toBe(1);
			expect(stats.completedPomodoros).toBe(1);
			expect(stats.completedFocusSessions).toBe(1);
			expect(stats.completedBreakSessions).toBe(1);
			expect(stats.totalFocusSeconds).toBe(1600);
			expect(stats.totalBreakSeconds).toBe(320);
			expect(stats.totalFocusOvertimeSeconds).toBe(100);
			expect(stats.totalBreakOvertimeSeconds).toBe(20);
		}),
	);
});

layer(TestLayer)("SessionRepository (empty database)", (it) => {
	it.effect("returns all-zero stats on fresh database", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const stats = yield* repo.getStats();
			expect(stats.totalPomodoros).toBe(0);
			expect(stats.completedPomodoros).toBe(0);
			expect(stats.completedFocusSessions).toBe(0);
			expect(stats.completedBreakSessions).toBe(0);
			expect(stats.totalFocusSeconds).toBe(0);
			expect(stats.totalBreakSeconds).toBe(0);
			expect(stats.totalFocusOvertimeSeconds).toBe(0);
			expect(stats.totalBreakOvertimeSeconds).toBe(0);
			expect(stats.currentStreak).toBe(0);
			expect(stats.longestStreak).toBe(0);
			expect(stats.dailyActivity).toHaveLength(0);
		}),
	);
});
