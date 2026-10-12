/**
 * Pomodoro, session, and stats endpoints.
 *
 * @module
 */
import { DateTime, Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { Api } from "@/shared/api/Api";
import { SessionRepository } from "../SessionRepository";

/**
 * @since 2.0.0
 * @category Handlers
 */
export const SessionsHandlers = HttpApiBuilder.group(
	Api,
	"sessions",
	Effect.fn(function* (handlers) {
		const repo = yield* SessionRepository;
		return handlers
			.handle("createPomodoro", ({ query }) => repo.createPomodoro(query))
			.handle("deletePomodoro", ({ params }) => repo.deletePomodoro(params.id))
			.handle("labelPomodoro", ({ params, payload }) =>
				repo.labelPomodoro(params.id, payload),
			)
			.handle("completePomodoro", ({ params }) =>
				repo.completePomodoro(params.id),
			)
			.handle("startFocus", ({ payload }) => repo.startFocus(payload))
			.handle("completeFocus", ({ params, payload }) =>
				repo.completeFocus(params.id, payload),
			)
			.handle("startBreak", ({ payload }) => repo.startBreak(payload))
			.handle("completeBreak", ({ params, payload }) =>
				repo.completeBreak(params.id, payload),
			)
			.handle("stats", ({ query }) =>
				repo.stats(query.tz ?? DateTime.zoneMakeOffset(0)),
			);
	}),
);
