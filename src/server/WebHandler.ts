/**
 * Fetch-style handler serving the API, built once per process.
 *
 * @module
 */
import { HttpRouter } from "effect/http";
import { ServerLive } from "./Http";

/**
 * @since 2.0.0
 * @category Handlers
 */
export const { handler, dispose } = HttpRouter.toWebHandler(ServerLive);
