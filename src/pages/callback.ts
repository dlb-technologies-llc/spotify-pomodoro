/**
 * Spotify OAuth redirect target, served by the Effect HTTP API.
 *
 * @module
 */
import type { APIRoute } from "astro";
import { handler } from "@/server/WebHandler";

/**
 * @since 1.0.0
 * @category Routes
 */
export const GET: APIRoute = ({ request }) => handler(request);
