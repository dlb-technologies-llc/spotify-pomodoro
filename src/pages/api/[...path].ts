/**
 * Hands every `/api/*` request to the Effect HTTP API.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { handler } from "@/server/WebHandler";
import { PEER_HEADER } from "@/shared/domain/Auth";

/**
 * Forwards the request with {@link PEER_HEADER} set to the connection's
 * address, replacing any value the client sent.
 *
 * @since 2.0.0
 * @category Routes
 */
export const ALL: APIRoute = ({ request, clientAddress }) => {
	const headers = new Headers(request.headers);
	headers.set(PEER_HEADER, clientAddress);
	return handler(new Request(request, { headers }));
};
