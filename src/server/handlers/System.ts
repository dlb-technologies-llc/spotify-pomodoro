/**
 * Liveness and readiness endpoints.
 *
 * @module
 */
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { Api, Health } from "@/shared/api/Api";
import { NotReady } from "@/shared/domain/Backup";

/**
 * @since 2.0.0
 * @category Handlers
 */
export const SystemHandlers = HttpApiBuilder.group(
	Api,
	"system",
	Effect.fn(function* (handlers) {
		const sql = yield* SqlClient.SqlClient;
		const ok = new Health({ status: "ok" });
		return handlers
			.handle("health", () => Effect.succeed(ok))
			.handle("ready", () =>
				sql`SELECT 1`.pipe(
					Effect.timeout("2 seconds"),
					Effect.as(ok),
					Effect.mapError((error) => new NotReady({ reason: String(error) })),
					Effect.withSpan("System.ready"),
				),
			);
	}),
);
