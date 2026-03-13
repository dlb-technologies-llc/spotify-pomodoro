/**
 * Spotify client service tests for SDK fallback behavior.
 *
 * @module
 */

import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Result } from "effect";
import {
	HttpClient,
	type HttpClientRequest,
	HttpClientResponse,
} from "effect/unstable/http";

import {
	PremiumRequiredError,
	SdkUnavailableError,
	SpotifyApiError,
} from "@/effect/errors/SpotifyError";
import { SpotifyToken } from "@/effect/schema/SpotifyToken";
import { SpotifyAuth } from "@/effect/services/SpotifyAuth";
import { SpotifyClient } from "@/effect/services/SpotifyClient";
import { WebPlaybackSdk } from "@/effect/services/WebPlaybackSdk";

/**
 * Creates a mock HttpClient that responds based on a handler function.
 *
 * @since 1.3.0
 * @category Test Utilities
 */
const makeHttpClientLayer = (
	handler: (request: HttpClientRequest.HttpClientRequest) => Response,
) =>
	Layer.succeed(HttpClient.HttpClient)(
		HttpClient.make((request) =>
			Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))),
		),
	);

/**
 * Mock SpotifyAuth layer that returns a test token.
 *
 * @since 1.3.0
 * @category Test Utilities
 */
const MockSpotifyAuth = Layer.succeed(SpotifyAuth)(
	SpotifyAuth.of({
		getToken: () =>
			Effect.succeed(
				new SpotifyToken({
					accessToken: "test-access-token",
					refreshToken: "test-refresh-token",
					expiresAt: Date.now() + 3600_000,
					scope: "streaming user-read-playback-state",
				}),
			),
		refreshToken: () =>
			Effect.succeed(
				new SpotifyToken({
					accessToken: "test-access-token",
					refreshToken: "test-refresh-token",
					expiresAt: Date.now() + 3600_000,
					scope: "streaming user-read-playback-state",
				}),
			),
		restoreToken: () => Effect.succeed(Option.none()),
		logout: () => Effect.void,
	}),
);

/**
 * Mock WebPlaybackSdk layer with a successful ensureDevice.
 *
 * @since 1.3.0
 * @category Test Utilities
 */
const makeMockSdk = (
	ensureDevice: () => Effect.Effect<
		string,
		SdkUnavailableError | PremiumRequiredError
	> = () => Effect.succeed("sdk-device-123"),
) =>
	Layer.succeed(WebPlaybackSdk)(
		WebPlaybackSdk.of({
			initialize: () => Effect.void,
			ensureDevice,
			getDeviceState: () => Effect.succeed(Option.none()),
			isDisconnected: () => Effect.succeed(false),
			destroy: () => Effect.void,
		}),
	);

describe("SpotifyClient.play", () => {
	it.effect("succeeds on first try with 204 response", () =>
		Effect.gen(function* () {
			const httpLayer = makeHttpClientLayer(
				() => new Response(null, { status: 204 }),
			);
			const sdkLayer = makeMockSdk();

			const layer = SpotifyClient.layer.pipe(
				Layer.provide(Layer.mergeAll(httpLayer, MockSpotifyAuth, sdkLayer)),
			);

			yield* Effect.gen(function* () {
				const client = yield* SpotifyClient;
				yield* client.play();
			}).pipe(Effect.provide(layer));
		}),
	);

	it.effect("falls back to SDK on no active device (404)", () =>
		Effect.gen(function* () {
			let requestCount = 0;

			const httpLayer = makeHttpClientLayer((request) => {
				requestCount++;
				const url = request.url;

				if (requestCount === 1) {
					return new Response(
						JSON.stringify({
							error: { status: 404, message: "NO_ACTIVE_DEVICE" },
						}),
						{ status: 404 },
					);
				}

				expect(url).toContain("device_id=sdk-device-123");
				return new Response(null, { status: 204 });
			});

			const sdkLayer = makeMockSdk(() => Effect.succeed("sdk-device-123"));

			const layer = SpotifyClient.layer.pipe(
				Layer.provide(Layer.mergeAll(httpLayer, MockSpotifyAuth, sdkLayer)),
			);

			yield* Effect.gen(function* () {
				const client = yield* SpotifyClient;
				yield* client.play();
			}).pipe(Effect.provide(layer));
			expect(requestCount).toBe(2);
		}),
	);

	it.effect(
		"propagates PremiumRequiredError when SDK reports premium required",
		() =>
			Effect.gen(function* () {
				const httpLayer = makeHttpClientLayer(
					() =>
						new Response(
							JSON.stringify({
								error: { status: 404, message: "No active device found" },
							}),
							{ status: 404 },
						),
				);

				const sdkLayer = makeMockSdk(() =>
					Effect.fail(
						new PremiumRequiredError({
							message: "Premium required for playback",
						}),
					),
				);

				const layer = SpotifyClient.layer.pipe(
					Layer.provide(Layer.mergeAll(httpLayer, MockSpotifyAuth, sdkLayer)),
				);

				const result = yield* Effect.result(
					Effect.gen(function* () {
						const client = yield* SpotifyClient;
						yield* client.play();
					}).pipe(Effect.provide(layer)),
				);

				expect(Result.isFailure(result)).toBe(true);
				if (Result.isFailure(result)) {
					expect(result.failure).toBeInstanceOf(PremiumRequiredError);
				}
			}),
	);

	it.effect("propagates SdkUnavailableError when SDK fails to initialize", () =>
		Effect.gen(function* () {
			const httpLayer = makeHttpClientLayer(
				() =>
					new Response(
						JSON.stringify({
							error: { status: 404, message: "NO_ACTIVE_DEVICE" },
						}),
						{ status: 404 },
					),
			);

			const sdkLayer = makeMockSdk(() =>
				Effect.fail(
					new SdkUnavailableError({
						reason: "ScriptLoadFailed",
						message: "Script failed to load",
					}),
				),
			);

			const layer = SpotifyClient.layer.pipe(
				Layer.provide(Layer.mergeAll(httpLayer, MockSpotifyAuth, sdkLayer)),
			);

			const result = yield* Effect.result(
				Effect.gen(function* () {
					const client = yield* SpotifyClient;
					yield* client.play();
				}).pipe(Effect.provide(layer)),
			);

			expect(Result.isFailure(result)).toBe(true);
			if (Result.isFailure(result)) {
				expect(result.failure).toBeInstanceOf(SdkUnavailableError);
			}
		}),
	);

	it.effect("fails with PremiumRequiredError on 403 PREMIUM_REQUIRED", () =>
		Effect.gen(function* () {
			const httpLayer = makeHttpClientLayer(
				() =>
					new Response(
						JSON.stringify({
							error: { status: 403, message: "PREMIUM_REQUIRED" },
						}),
						{ status: 403 },
					),
			);

			const sdkLayer = makeMockSdk();

			const layer = SpotifyClient.layer.pipe(
				Layer.provide(Layer.mergeAll(httpLayer, MockSpotifyAuth, sdkLayer)),
			);

			const result = yield* Effect.result(
				Effect.gen(function* () {
					const client = yield* SpotifyClient;
					yield* client.play();
				}).pipe(Effect.provide(layer)),
			);

			expect(Result.isFailure(result)).toBe(true);
			if (Result.isFailure(result)) {
				expect(result.failure).toBeInstanceOf(PremiumRequiredError);
			}
		}),
	);

	it.effect("fails with SpotifyApiError on other error statuses", () =>
		Effect.gen(function* () {
			const httpLayer = makeHttpClientLayer(
				() =>
					new Response(
						JSON.stringify({
							error: { status: 500, message: "Internal error" },
						}),
						{ status: 500 },
					),
			);

			const sdkLayer = makeMockSdk();

			const layer = SpotifyClient.layer.pipe(
				Layer.provide(Layer.mergeAll(httpLayer, MockSpotifyAuth, sdkLayer)),
			);

			const result = yield* Effect.result(
				Effect.gen(function* () {
					const client = yield* SpotifyClient;
					yield* client.play();
				}).pipe(Effect.provide(layer)),
			);

			expect(Result.isFailure(result)).toBe(true);
			if (Result.isFailure(result)) {
				expect(result.failure).toBeInstanceOf(SpotifyApiError);
			}
		}),
	);
});
