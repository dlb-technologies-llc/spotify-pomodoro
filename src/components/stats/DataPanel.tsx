/**
 * Export and import of all recorded data.
 *
 * @module
 */
import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { useState } from "react";
import { importDataAtom } from "@/client/atoms";

const link =
	"flex-1 rounded-xl border border-border bg-card/50 py-2 text-center text-sm text-muted-foreground hover:text-foreground";

/**
 * Download links for JSON and CSV, and a JSON file picker for import.
 *
 * @since 2.1.0
 * @category Components
 */
export function DataPanel({ onImported }: { readonly onImported: () => void }) {
	const importData = useAtomSet(importDataAtom, { mode: "promiseExit" });
	const [message, setMessage] = useState<string | null>(null);

	return (
		<div className="space-y-5 text-sm">
			<section className="space-y-2">
				<h3 className="text-xs uppercase tracking-widest text-muted-foreground/70">
					Export
				</h3>
				<div className="flex gap-2">
					<a href="/api/export.json" download className={link}>
						JSON
					</a>
					<a href="/api/export.csv" download className={link}>
						CSV
					</a>
				</div>
				<p className="text-xs text-muted-foreground/60">
					JSON keeps everything and can be imported again; CSV has one row per
					pomodoro.
				</p>
			</section>
			<section className="space-y-2">
				<h3 className="text-xs uppercase tracking-widest text-muted-foreground/70">
					Import
				</h3>
				<label className="block">
					<span className="sr-only">import JSON export</span>
					<input
						type="file"
						accept="application/json,.json"
						onChange={async (event) => {
							const file = event.target.files?.[0];
							if (!file) return;
							setMessage("Importing…");
							const exit = await importData(await file.text());
							event.target.value = "";
							if (Exit.isSuccess(exit)) {
								const result = exit.value;
								setMessage(
									`Imported ${result.pomodoros} pomodoros, ${result.focusSessions + result.breakSessions} sessions` +
										(result.skipped > 0
											? `; skipped ${result.skipped} already present.`
											: "."),
								);
								onImported();
							} else {
								setMessage("That file isn't a Spotify Pomodoro JSON export.");
							}
						}}
						className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-foreground"
					/>
				</label>
				{message && (
					<output className="block text-xs text-muted-foreground">
						{message}
					</output>
				)}
			</section>
		</div>
	);
}
