/**
 * History, export, and import endpoints.
 *
 * @module
 */
import { DateTime, Effect, Schema } from "effect";
import { HttpServerResponse } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Api } from "@/shared/api/Api";
import { ExportFile } from "@/shared/domain/History";
import { toCsv } from "../Export";
import { SessionRepository } from "../SessionRepository";

const encodeExport = Schema.encodeEffect(ExportFile);

const attachment = (name: string) => ({
	"content-disposition": `attachment; filename="${name}"`,
	"cache-control": "no-store",
});

/**
 * @since 2.1.0
 * @category Handlers
 */
export const DataHandlers = HttpApiBuilder.group(
	Api,
	"data",
	Effect.fn(function* (handlers) {
		const repo = yield* SessionRepository;

		const snapshot = Effect.gen(function* () {
			const data = yield* repo.exportAll();
			const day = DateTime.formatIsoDateUtc(yield* DateTime.now);
			return { data, day };
		});

		return handlers
			.handle("history", ({ query }) =>
				repo.history({
					before: query.before ?? Number.MAX_SAFE_INTEGER,
					limit: query.limit ?? 30,
				}),
			)
			.handle(
				"exportJson",
				Effect.fn(function* () {
					const { data, day } = yield* snapshot;
					const body = yield* Effect.orDie(
						encodeExport({
							format: "spotify-pomodoro",
							version: 1,
							exportedAt: yield* DateTime.now,
							pomodoros: data.pomodoros,
							focusSessions: data.focusSessions,
							breakSessions: data.breakSessions,
						}),
					);
					return yield* HttpServerResponse.json(body, {
						headers: attachment(`spotify-pomodoro-${day}.json`),
					}).pipe(Effect.orDie);
				}),
			)
			.handle(
				"exportCsv",
				Effect.fn(function* () {
					const { data, day } = yield* snapshot;
					return HttpServerResponse.text(toCsv(data), {
						contentType: "text/csv; charset=utf-8",
						headers: attachment(`spotify-pomodoro-${day}.csv`),
					});
				}),
			)
			.handle("import", ({ payload }) => repo.importAll(payload));
	}),
);
