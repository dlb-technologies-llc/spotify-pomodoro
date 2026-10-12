/**
 * Server implementation of the session cookie middleware.
 *
 * @module
 */
import { Effect, Layer, Redacted } from "effect";
import { Authorization } from "@/shared/api/Api";
import { Auth } from "../Auth";
import { CurrentUser } from "../CurrentUser";

/**
 * Verifies the session cookie before protected endpoints run, and makes its
 * user the {@link CurrentUser}.
 *
 * @since 2.0.0
 * @category Layers
 */
export const AuthorizationLive = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		const auth = yield* Auth;
		return Authorization.of({
			cookie: (httpEffect, { credential }) =>
				auth
					.verify(Redacted.value(credential))
					.pipe(
						Effect.flatMap((user) =>
							Effect.provideService(httpEffect, CurrentUser, user),
						),
					),
		});
	}),
);
