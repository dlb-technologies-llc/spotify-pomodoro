/**
 * Health endpoint.
 *
 * @module
 */
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { Api, Health } from "@/shared/api/Api";

/**
 * @since 2.0.0
 * @category Handlers
 */
export const SystemHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
	handlers.handle("health", () => Effect.succeed(new Health({ status: "ok" }))),
);
