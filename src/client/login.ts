/**
 * Login form action.
 *
 * @module
 */
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { Atom } from "effect/reactivity";
import { type LoginRequest, TooManyAttempts } from "@/shared/domain/Auth";
import { ApiClient } from "./ApiClient";

const runtime = Atom.runtime(
	ApiClient.layer.pipe(Layer.provide(FetchHttpClient.layer)),
);

const ORIGIN = "https://pomodoro.invalid";

/**
 * Same-origin path to continue to after login; anything else becomes `/`.
 *
 * The value is parsed the way the browser will parse it, so tricks like
 * `/\t/evil.example` (tabs are stripped, leaving `//evil.example`) are caught.
 *
 * @since 2.0.0
 * @category Helpers
 */
export const safeReturnPath = (value: string | null | undefined): string => {
	if (!value?.startsWith("/")) return "/";
	try {
		const url = new URL(value, ORIGIN);
		return url.origin === ORIGIN
			? `${url.pathname}${url.search}${url.hash}`
			: "/";
	} catch {
		return "/";
	}
};

/**
 * Message shown for a failed login.
 *
 * @since 2.0.0
 * @category Helpers
 */
export const loginErrorMessage = (error: { readonly _tag: string }) => {
	if (error instanceof TooManyAttempts) {
		const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
		return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
	}
	switch (error._tag) {
		case "InvalidCredentials":
			return "Invalid credentials";
		case "AuthDisabled":
			return "Login is not enabled on this server";
		default:
			return "Connection failed";
	}
};

/**
 * Submits the credentials; the server sets the session cookie on success.
 *
 * @since 2.0.0
 * @category Atoms
 */
export const loginAtom = runtime.fn((payload: LoginRequest) =>
	ApiClient.use((api) => api.auth.login({ payload })).pipe(
		Effect.withSpan("Login.submit"),
	),
);
