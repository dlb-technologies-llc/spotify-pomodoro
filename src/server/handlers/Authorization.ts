/**
 * Server implementation of the session cookie middleware.
 *
 * @module
 */
import { Effect, Layer, Redacted } from "effect";
import { Authorization } from "@/shared/api/Api";
import { Auth } from "../Auth";

/**
 * Verifies the session cookie before protected endpoints run.
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
					.pipe(Effect.andThen(httpEffect)),
		});
	}),
);
