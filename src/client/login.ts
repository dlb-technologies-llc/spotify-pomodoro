/**
 * Login form action.
 *
 * @module
 */
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { Atom } from "effect/reactivity";
import { AUTH_USERNAME } from "@/shared/domain/Auth";
import { ApiClient } from "./ApiClient";

const runtime = Atom.runtime(
	ApiClient.layer.pipe(Layer.provide(FetchHttpClient.layer)),
);

/**
 * Same-origin path to continue to after login; anything else becomes `/`.
 *
 * @since 2.0.0
 * @category Helpers
 */
export const safeReturnPath = (value: string | null | undefined): string =>
	value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
		? value
		: "/";

/**
 * Message shown for a failed login.
 *
 * @since 2.0.0
 * @category Helpers
 */
export const loginErrorMessage = (error: { readonly _tag: string }) =>
	error._tag === "InvalidCredentials"
		? "Invalid credentials"
		: error._tag === "AuthDisabled"
			? "Login is not enabled on this server"
			: "Connection failed";

/**
 * Submits the password; the server sets the session cookie on success.
 *
 * @since 2.0.0
 * @category Atoms
 */
export const loginAtom = runtime.fn((password: string) =>
	ApiClient.use((api) =>
		api.auth.login({ payload: { username: AUTH_USERNAME, password } }),
	).pipe(Effect.withSpan("Login.submit")),
);
