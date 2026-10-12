/**
 * Backup endpoints.
 *
 * @module
 */
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { Api } from "@/shared/api/Api";
import { Backup } from "../Backup";

/**
 * @since 2.1.0
 * @category Handlers
 */
export const BackupHandlers = HttpApiBuilder.group(
	Api,
	"backups",
	Effect.fn(function* (handlers) {
		const backup = yield* Backup;
		return handlers
			.handle("list", () => backup.list())
			.handle("create", () => backup.create());
	}),
);
