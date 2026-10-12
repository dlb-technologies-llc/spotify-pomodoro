/**
 * HTTP doubles for tests.
 *
 * @module
 */
import { Effect, Layer } from "effect";
import {
	HttpClient,
	HttpClientError,
	HttpClientRequest,
	HttpClientResponse,
} from "effect/http";

/**
 * An `HttpClient` whose requests are answered by a Fetch-style handler. A
 * rejected handler becomes a transport error, as with real `fetch`.
 *
 * @since 2.0.0
 * @category Test
 */
export const httpClientFrom = (
	handler: (request: Request) => Response | Promise<Response>,
) =>
	Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((request) =>
			HttpClientRequest.toWeb(request).pipe(
				Effect.orDie,
				Effect.flatMap((web) =>
					Effect.tryPromise({
						try: async () => handler(web),
						catch: (cause) =>
							new HttpClientError.HttpClientError({
								reason: new HttpClientError.TransportError({ request, cause }),
							}),
					}),
				),
				Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
			),
		),
	);

/**
 * JSON response helper.
 *
 * @since 2.0.0
 * @category Test
 */
export const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

/**
 * Records every request made through a handler.
 *
 * @since 2.0.0
 * @category Test
 */
export const recording = (
	handler: (request: Request) => Response | Promise<Response>,
) => {
	const requests: Array<{ method: string; url: URL; body: string }> = [];
	const layer = httpClientFrom(async (request) => {
		requests.push({
			method: request.method,
			url: new URL(request.url),
			body: await request.clone().text(),
		});
		return handler(request);
	});
	return { requests, layer };
};
