/**
 * Hands every `/api/*` request to the Effect HTTP API.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { handler } from "@/server/WebHandler";

/**
 * @since 2.0.0
 * @category Routes
 */
export const ALL: APIRoute = ({ request }) => handler(request);
