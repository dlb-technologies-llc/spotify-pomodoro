/**
 * Web Playback SDK service unit tests.
 *
 * Tests service interface contracts, error types, and schemas.
 * Full integration tests with the actual Spotify SDK are done manually
 * since the SDK requires a real browser environment with Spotify Premium.
 *
 * @module
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Layer, Option } from "effect";

import {
	NoActiveDeviceError,
	PremiumRequiredError,
	SdkUnavailableError,
} from "@/effect/errors/SpotifyError";
import { SdkDeviceState } from "@/effect/schema/WebPlaybackSdk";
import { WebPlaybackSdk } from "@/effect/services/WebPlaybackSdk";

describe("WebPlaybackSdk", () => {
	describe("error types", () => {
		it("SdkUnavailableError has correct tag and reason", () => {
			const error = new SdkUnavailableError({
				reason: "InitFailed",
				message: "test init failure",
			});
			expect(error._tag).toBe("SdkUnavailableError");
			expect(error.reason).toBe("InitFailed");
			expect(error.message).toBe("test init failure");
		});

		it("PremiumRequiredError has correct tag", () => {
			const error = new PremiumRequiredError({
				message: "Premium required",
			});
			expect(error._tag).toBe("PremiumRequiredError");
			expect(error.message).toBe("Premium required");
		});

		it("NoActiveDeviceError has correct tag", () => {
			const error = new NoActiveDeviceError({
				message: "No active device",
			});
			expect(error._tag).toBe("NoActiveDeviceError");
			expect(error.message).toBe("No active device");
		});

		it("SdkUnavailableError accepts all valid reasons", () => {
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
					message: `test ${reason}`,
				});
				expect(error.reason).toBe(reason);
			}
		});

		it.effect("errors can be caught with catchTag in Effect", () =>
			Effect.gen(function* () {
				const effect = Effect.fail(
					new PremiumRequiredError({ message: "Premium required" }),
				).pipe(
					Effect.catchTag("PremiumRequiredError", (e) =>
						Effect.succeed(`caught: ${e.message}`),
					),
				);

				const result = yield* effect;
				expect(result).toBe("caught: Premium required");
			}),
		);
	});

	describe("SdkDeviceState schema", () => {
		it("can be constructed with valid fields", () => {
			const state = new SdkDeviceState({
				deviceId: "test-device-123",
				isReady: true,
				playerName: "Spotify Pomodoro",
			});
			expect(state.deviceId).toBe("test-device-123");
			expect(state.isReady).toBe(true);
			expect(state.playerName).toBe("Spotify Pomodoro");
		});
	});

	describe("service mock layer", () => {
		const mockDeviceId = "mock-device-456";

		const MockWebPlaybackSdk = Layer.succeed(
			WebPlaybackSdk,
			WebPlaybackSdk.of({
				_tag: "WebPlaybackSdk",
				initialize: Effect.void,
				ensureDevice: Effect.succeed(mockDeviceId),
				getDeviceState: Effect.succeed(
					Option.some(
						new SdkDeviceState({
							deviceId: mockDeviceId,
							isReady: true,
							playerName: "Spotify Pomodoro",
						}),
					),
				),
				destroy: Effect.void,
			}),
		);

		it.effect("mock ensureDevice returns device id", () =>
			Effect.gen(function* () {
				const deviceId = yield* WebPlaybackSdk.ensureDevice;
				expect(deviceId).toBe(mockDeviceId);
			}).pipe(Effect.provide(MockWebPlaybackSdk)),
		);

		it.effect("mock getDeviceState returns Some with state", () =>
			Effect.gen(function* () {
				const state = yield* WebPlaybackSdk.getDeviceState;
				expect(Option.isSome(state)).toBe(true);
				if (Option.isSome(state)) {
					expect(state.value.deviceId).toBe(mockDeviceId);
					expect(state.value.isReady).toBe(true);
					expect(state.value.playerName).toBe("Spotify Pomodoro");
				}
			}).pipe(Effect.provide(MockWebPlaybackSdk)),
		);

		it.effect("mock can simulate PremiumRequired failure", () =>
			Effect.gen(function* () {
				const result = yield* Effect.either(WebPlaybackSdk.ensureDevice);
				expect(Either.isLeft(result)).toBe(true);
				if (Either.isLeft(result)) {
					expect(result.left).toBeInstanceOf(PremiumRequiredError);
				}
			}).pipe(
				Effect.provide(
					Layer.succeed(
						WebPlaybackSdk,
						WebPlaybackSdk.of({
							_tag: "WebPlaybackSdk",
							initialize: Effect.fail(
								new PremiumRequiredError({
									message: "Premium required",
								}),
							),
							ensureDevice: Effect.fail(
								new PremiumRequiredError({
									message: "Premium required",
								}),
							),
							getDeviceState: Effect.succeed(Option.none()),
							destroy: Effect.void,
						}),
					),
				),
			),
		);

		it.effect("mock can simulate SdkUnavailable failure", () =>
			Effect.gen(function* () {
				const result = yield* Effect.either(WebPlaybackSdk.ensureDevice);
				expect(Either.isLeft(result)).toBe(true);
				if (Either.isLeft(result)) {
					expect(result.left).toBeInstanceOf(SdkUnavailableError);
					expect((result.left as SdkUnavailableError).reason).toBe(
						"ScriptLoadFailed",
					);
				}
			}).pipe(
				Effect.provide(
					Layer.succeed(
						WebPlaybackSdk,
						WebPlaybackSdk.of({
							_tag: "WebPlaybackSdk",
							initialize: Effect.fail(
								new SdkUnavailableError({
									reason: "ScriptLoadFailed",
									message: "Script failed",
								}),
							),
							ensureDevice: Effect.fail(
								new SdkUnavailableError({
									reason: "ScriptLoadFailed",
									message: "Script failed",
								}),
							),
							getDeviceState: Effect.succeed(Option.none()),
							destroy: Effect.void,
						}),
					),
				),
			),
		);
	});
});
