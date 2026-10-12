/**
 * In-memory server for tests.
 *
 * @module
 */
import { ConfigProvider, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { ApiClient } from "@/client/ApiClient";
import { DatabaseTest } from "@/server/Database";
import { ApiApp } from "@/server/Http";
import { httpClientFrom } from "./http";

/**
 * Environment every test server starts from.
 *
 * @since 2.0.0
 * @category Test
 */
export const baseEnv = {
	PUBLIC_SPOTIFY_CLIENT_ID: "test-client-id",
	PUBLIC_SPOTIFY_REDIRECT_URI: "http://127.0.0.1:2500/callback",
};

/**
 * Auth-enabled environment.
 *
 * @since 2.0.0
 * @category Test
 */
export const authEnv = {
	AUTH_ENABLED: "true",
	AUTH_PASSWORD: "correct-horse",
	AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
};

/**
 * Base URL test requests are made against.
 *
 * @since 2.0.0
 * @category Test
 */
export const BASE_URL = "http://pomodoro.test";

/**
 * Starts the API on an in-memory database and returns its Fetch handler.
 * Outbound HTTP (Spotify Accounts) goes to `upstream`.
 *
 * @since 2.0.0
 * @category Test
 */
export const startServer = (
	options: {
		readonly env?: Record<string, string>;
		readonly upstream?: (request: Request) => Response | Promise<Response>;
	} = {},
) =>
	Effect.acquireRelease(
		Effect.sync(() =>
			HttpRouter.toWebHandler(
				ApiApp.pipe(
					Layer.provide(DatabaseTest),
					Layer.provide(
						httpClientFrom(
							options.upstream ??
								(() => new Response("unexpected", { status: 599 })),
						),
					),
					Layer.provide(
						ConfigProvider.layer(
							ConfigProvider.fromEnv({ env: { ...baseEnv, ...options.env } }),
						),
					),
					Layer.provide(HttpServer.layerServices),
				),
				{ disableLogger: true },
			),
		),
		({ dispose }) => Effect.promise(dispose),
	).pipe(
		Effect.map(
			({ handler }) =>
				(request: Request) =>
					handler(request),
		),
	);

/**
 * Typed API client talking to a test server handler.
 *
 * @since 2.0.0
 * @category Test
 */
export const apiClientFor = (
	handler: (request: Request) => Promise<Response>,
	headers: Record<string, string> = {},
) =>
	ApiClient.layerWithBaseUrl(BASE_URL).pipe(
		Layer.provide(
			httpClientFrom((request) => {
				for (const [key, value] of Object.entries(headers)) {
					request.headers.set(key, value);
				}
				return handler(request);
			}),
		),
	);

/**
 * Sends a raw request to a test server.
 *
 * @since 2.0.0
 * @category Test
 */
export const send = (
	handler: (request: Request) => Promise<Response>,
	path: string,
	init?: RequestInit,
) => Effect.promise(() => handler(new Request(`${BASE_URL}${path}`, init)));
