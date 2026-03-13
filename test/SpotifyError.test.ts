/**
 * Tests for Spotify error types.
 *
 * @module
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import {
	NoActiveDeviceError,
	PremiumRequiredError,
	SdkUnavailableError,
} from "@/effect/errors/SpotifyError";

describe("NoActiveDeviceError", () => {
	it("has the correct _tag", () => {
		const error = new NoActiveDeviceError({
			message: "No active device found",
		});
		expect(error._tag).toBe("NoActiveDeviceError");
	});

	it("has the correct message", () => {
		const error = new NoActiveDeviceError({
			message: "No active device found",
		});
		expect(error.message).toBe("No active device found");
	});

	it("is an instance of NoActiveDeviceError", () => {
		const error = new NoActiveDeviceError({
			message: "No active device found",
		});
		expect(error).toBeInstanceOf(NoActiveDeviceError);
	});

	it.effect("can be caught with catchTag in Effect context", () =>
		Effect.gen(function* () {
			const result = yield* Effect.fail(
				new NoActiveDeviceError({ message: "No active device found" }),
			).pipe(
				Effect.catchTag("NoActiveDeviceError", (e) =>
					Effect.succeed(e.message),
				),
			);
			expect(result).toBe("No active device found");
		}),
	);

	it.effect("appears as Failure when using Effect.result", () =>
		Effect.gen(function* () {
			const result = yield* Effect.result(
				Effect.fail(
					new NoActiveDeviceError({ message: "No active device found" }),
				),
			);
			expect(Result.isFailure(result)).toBe(true);
			if (Result.isFailure(result)) {
				expect(result.failure).toBeInstanceOf(NoActiveDeviceError);
				expect(result.failure._tag).toBe("NoActiveDeviceError");
			}
		}),
	);
});

describe("PremiumRequiredError", () => {
	it("has the correct _tag", () => {
		const error = new PremiumRequiredError({
			message: "Premium subscription required",
		});
		expect(error._tag).toBe("PremiumRequiredError");
	});

	it("has the correct message", () => {
		const error = new PremiumRequiredError({
			message: "Premium subscription required",
		});
		expect(error.message).toBe("Premium subscription required");
	});

	it("is an instance of PremiumRequiredError", () => {
		const error = new PremiumRequiredError({
			message: "Premium subscription required",
		});
		expect(error).toBeInstanceOf(PremiumRequiredError);
	});

	it.effect("can be caught with catchTag in Effect context", () =>
		Effect.gen(function* () {
			const result = yield* Effect.fail(
				new PremiumRequiredError({ message: "Premium subscription required" }),
			).pipe(
				Effect.catchTag("PremiumRequiredError", (e) =>
					Effect.succeed(e.message),
				),
			);
			expect(result).toBe("Premium subscription required");
		}),
	);

	it.effect("appears as Failure when using Effect.result", () =>
		Effect.gen(function* () {
			const result = yield* Effect.result(
				Effect.fail(
					new PremiumRequiredError({
						message: "Premium subscription required",
					}),
				),
			);
			expect(Result.isFailure(result)).toBe(true);
			if (Result.isFailure(result)) {
				expect(result.failure).toBeInstanceOf(PremiumRequiredError);
				expect(result.failure._tag).toBe("PremiumRequiredError");
			}
		}),
	);
});

describe("SdkUnavailableError", () => {
	it("has the correct _tag", () => {
		const error = new SdkUnavailableError({
			reason: "InitFailed",
			message: "SDK failed to initialize",
		});
		expect(error._tag).toBe("SdkUnavailableError");
	});

	it("has the correct message", () => {
		const error = new SdkUnavailableError({
			reason: "InitFailed",
			message: "SDK failed to initialize",
		});
		expect(error.message).toBe("SDK failed to initialize");
	});

	it("has the correct reason", () => {
		const error = new SdkUnavailableError({
			reason: "AuthFailed",
			message: "Authentication failed",
		});
		expect(error.reason).toBe("AuthFailed");
	});

	it("is an instance of SdkUnavailableError", () => {
		const error = new SdkUnavailableError({
			reason: "ScriptLoadFailed",
			message: "Script load failed",
		});
		expect(error).toBeInstanceOf(SdkUnavailableError);
	});

	it("accepts all valid reason values", () => {
		const reasons = [
			"InitFailed",
			"AuthFailed",
			"AccountError",
			"ScriptLoadFailed",
			"Disconnected",
		] as const;

		for (const reason of reasons) {
			const error = new SdkUnavailableError({
				reason,
				message: `Error: ${reason}`,
			});
			expect(error.reason).toBe(reason);
			expect(error.message).toBe(`Error: ${reason}`);
		}
	});

	it.effect("can be caught with catchTag in Effect context", () =>
		Effect.gen(function* () {
			const result = yield* Effect.fail(
				new SdkUnavailableError({
					reason: "Disconnected",
					message: "Player disconnected",
				}),
			).pipe(
				Effect.catchTag("SdkUnavailableError", (e) =>
					Effect.succeed(`${e.reason}: ${e.message}`),
				),
			);
			expect(result).toBe("Disconnected: Player disconnected");
		}),
	);

	it.effect("appears as Failure when using Effect.result", () =>
		Effect.gen(function* () {
			const result = yield* Effect.result(
				Effect.fail(
					new SdkUnavailableError({
						reason: "AccountError",
						message: "Account error occurred",
					}),
				),
			);
			expect(Result.isFailure(result)).toBe(true);
			if (Result.isFailure(result)) {
				expect(result.failure).toBeInstanceOf(SdkUnavailableError);
				expect(result.failure._tag).toBe("SdkUnavailableError");
				expect(result.failure.reason).toBe("AccountError");
			}
		}),
	);
});
