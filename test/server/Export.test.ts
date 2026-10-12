/**
 * CSV export.
 *
 * @module
 */
import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";
import { toCsv } from "@/server/Export";
import { FocusSession, Pomodoro } from "@/shared/domain/Session";
import { sample } from "../support/arbitrary";

describe("toCsv", () => {
	it.effect("quotes labels that contain commas, quotes, or newlines", () =>
		Effect.gen(function* () {
			const pomodoro = new Pomodoro({
				...(yield* sample(Pomodoro)),
				label: Option.some('fix "bug", then\nship'),
				createdAt: DateTime.makeUnsafe("2025-01-01T10:00:00Z"),
				completedAt: Option.none(),
			});
			const focus = new FocusSession({
				...(yield* sample(FocusSession)),
				pomodoroId: pomodoro.id,
				completed: true,
				configuredSeconds: 1500,
				elapsedSeconds: 1600,
			});
			const csv = toCsv({
				pomodoros: [pomodoro],
				focusSessions: [focus],
				breakSessions: [],
			});
			const [, row] = csv.trim().split(/\n(?=[0-9a-f]{8}-)/);
			assert.strictEqual(
				row,
				`${pomodoro.id},"fix ""bug"", then\nship",2025-01-01T10:00:00.000Z,,1600,100,0,0`,
			);
		}),
	);
});
