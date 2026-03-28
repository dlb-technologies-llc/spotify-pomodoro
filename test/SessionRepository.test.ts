/**
 * SessionRepository unit tests using in-memory SQLite.
 *
 * @module
 */
import { expect, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { FastCheck } from "effect/testing";
import { DbClientTest } from "@/db/test";
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
			const [focusInput] = FastCheck.sample(
				Schema.toArbitrary(CreateFocusSessionInput),
				1,
			);
			const session = yield* repo.createFocusSession(
				new CreateFocusSessionInput({
					...focusInput,
					pomodoroId: pomodoro.id,
				}),
			);
			expect(session.pomodoroId).toBe(pomodoro.id);
			expect(session.configuredSeconds).toBe(focusInput.configuredSeconds);
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
			const [focusInput] = FastCheck.sample(
				Schema.toArbitrary(CreateFocusSessionInput),
				1,
			);
			const session = yield* repo.createFocusSession(
				new CreateFocusSessionInput({
					...focusInput,
					pomodoroId: pomodoro.id,
				}),
			);
			const [completeInput] = FastCheck.sample(
				Schema.toArbitrary(CompleteSessionInput),
				1,
			);
			const completed = yield* repo.completeFocusSession(
				session.id,
				new CompleteSessionInput(completeInput),
			);
			expect(completed.elapsedSeconds).toBe(completeInput.elapsedSeconds);
			expect(completed.completed).toBe(true);
			expect(completed.completedAt).toBeInstanceOf(Date);
		}),
	);

	it.effect("gets a focus session by id", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const [focusInput] = FastCheck.sample(
				Schema.toArbitrary(CreateFocusSessionInput),
				1,
			);
			const created = yield* repo.createFocusSession(
				new CreateFocusSessionInput({
					...focusInput,
					pomodoroId: pomodoro.id,
				}),
			);
			const fetched = yield* repo.getFocusSession(created.id);
			expect(fetched.id).toBe(created.id);
			expect(fetched.configuredSeconds).toBe(focusInput.configuredSeconds);
		}),
	);

	it.effect("creates a break session", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const [breakInput] = FastCheck.sample(
				Schema.toArbitrary(CreateBreakSessionInput),
				1,
			);
			const session = yield* repo.createBreakSession(
				new CreateBreakSessionInput({
					...breakInput,
					pomodoroId: pomodoro.id,
				}),
			);
			expect(session.pomodoroId).toBe(pomodoro.id);
			expect(session.configuredSeconds).toBe(breakInput.configuredSeconds);
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
			const [breakInput] = FastCheck.sample(
				Schema.toArbitrary(CreateBreakSessionInput),
				1,
			);
			const session = yield* repo.createBreakSession(
				new CreateBreakSessionInput({
					...breakInput,
					pomodoroId: pomodoro.id,
				}),
			);
			const [completeInput] = FastCheck.sample(
				Schema.toArbitrary(CompleteSessionInput),
				1,
			);
			const completed = yield* repo.completeBreakSession(
				session.id,
				new CompleteSessionInput(completeInput),
			);
			expect(completed.elapsedSeconds).toBe(completeInput.elapsedSeconds);
			expect(completed.completed).toBe(true);
			expect(completed.completedAt).toBeInstanceOf(Date);
		}),
	);

	it.effect("gets a break session by id", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const pomodoro = yield* repo.createPomodoro();
			const [breakInput] = FastCheck.sample(
				Schema.toArbitrary(CreateBreakSessionInput),
				1,
			);
			const created = yield* repo.createBreakSession(
				new CreateBreakSessionInput({
					...breakInput,
					pomodoroId: pomodoro.id,
				}),
			);
			const fetched = yield* repo.getBreakSession(created.id);
			expect(fetched.id).toBe(created.id);
			expect(fetched.configuredSeconds).toBe(breakInput.configuredSeconds);
		}),
	);

	it.effect("fails with PomodoroNotFoundError for nonexistent pomodoro", () =>
		Effect.gen(function* () {
			const repo = yield* SessionRepository;
			const error = yield* Effect.flip(repo.getPomodoro(crypto.randomUUID()));
			expect(error).toBeInstanceOf(PomodoroNotFoundError);
		}),
	);

	it.effect(
		"fails with FocusSessionNotFoundError for nonexistent focus session",
		() =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const error = yield* Effect.flip(
					repo.getFocusSession(crypto.randomUUID()),
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
					repo.getBreakSession(crypto.randomUUID()),
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
		[CreateFocusSessionInput, CompleteSessionInput],
		([focusInput, completeInput]) =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const pomodoro = yield* repo.createPomodoro();
				const focus = yield* repo.createFocusSession(
					new CreateFocusSessionInput({
						...focusInput,
						pomodoroId: pomodoro.id,
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
		[CreateBreakSessionInput, CompleteSessionInput],
		([breakInput, completeInput]) =>
			Effect.gen(function* () {
				const repo = yield* SessionRepository;
				const pomodoro = yield* repo.createPomodoro();
				const breakSession = yield* repo.createBreakSession(
					new CreateBreakSessionInput({
						...breakInput,
						pomodoroId: pomodoro.id,
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

			const [focusCreate] = FastCheck.sample(
				Schema.toArbitrary(CreateFocusSessionInput),
				1,
			);
			const [focusComplete] = FastCheck.sample(
				Schema.toArbitrary(CompleteSessionInput),
				1,
			);
			const [breakCreate] = FastCheck.sample(
				Schema.toArbitrary(CreateBreakSessionInput),
				1,
			);
			const [breakComplete] = FastCheck.sample(
				Schema.toArbitrary(CompleteSessionInput),
				1,
			);

			const pomodoro = yield* repo.createPomodoro();

			const focus = yield* repo.createFocusSession(
				new CreateFocusSessionInput({
					...focusCreate,
					pomodoroId: pomodoro.id,
				}),
			);
			yield* repo.completeFocusSession(
				focus.id,
				new CompleteSessionInput(focusComplete),
			);

			const breakSession = yield* repo.createBreakSession(
				new CreateBreakSessionInput({
					...breakCreate,
					pomodoroId: pomodoro.id,
				}),
			);
			yield* repo.completeBreakSession(
				breakSession.id,
				new CompleteSessionInput(breakComplete),
			);

			yield* repo.completePomodoro(pomodoro.id);

			const stats = yield* repo.getStats();
			expect(stats.totalPomodoros).toBe(1);
			expect(stats.completedPomodoros).toBe(1);
			expect(stats.completedFocusSessions).toBe(1);
			expect(stats.completedBreakSessions).toBe(1);
			expect(stats.totalFocusSeconds).toBe(focusComplete.elapsedSeconds);
			expect(stats.totalBreakSeconds).toBe(breakComplete.elapsedSeconds);
			expect(stats.totalFocusOvertimeSeconds).toBe(
				Math.max(
					0,
					focusComplete.elapsedSeconds - focusCreate.configuredSeconds,
				),
			);
			expect(stats.totalBreakOvertimeSeconds).toBe(
				Math.max(
					0,
					breakComplete.elapsedSeconds - breakCreate.configuredSeconds,
				),
			);
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
