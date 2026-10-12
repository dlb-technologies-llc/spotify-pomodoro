/**
 * Typed client for this app's HTTP API.
 *
 * @module
 */
import { Context, Layer } from "effect";
import { HttpApiClient } from "effect/http-api";
import { Api } from "@/shared/api/Api";

/**
 * Client derived from the shared API definition.
 *
 * Requests resolve against the page origin; supply the `HttpClient` to
 * choose the transport.
 *
 * @since 2.0.0
 * @category Services
 */
export class ApiClient extends Context.Service<ApiClient>()(
	"spotify-pomodoro/client/ApiClient",
	{ make: HttpApiClient.make(Api) },
) {
	static readonly layer = Layer.effect(this, this.make);

	/**
	 * Client for an explicit base URL, e.g. in tests.
	 *
	 * @since 2.0.0
	 */
	static readonly layerWithBaseUrl = (baseUrl: string) =>
		Layer.effect(this, HttpApiClient.make(Api, { baseUrl }));
}
