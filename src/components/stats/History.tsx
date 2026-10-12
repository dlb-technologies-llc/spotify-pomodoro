/**
 * Past pomodoros with label editing and deletion.
 *
 * @module
 */
import {
	useAtom,
	useAtomRefresh,
	useAtomSet,
	useAtomValue,
} from "@effect/atom-react";
import { DateTime, Exit, Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useState } from "react";
import {
	deletePomodoroAtom,
	historyFirstPageAtom,
	historyPageAtom,
	labelPastPomodoroAtom,
} from "@/client/atoms";
import { formatDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/shared/domain/History";

const when = (entry: HistoryEntry) =>
	DateTime.toDate(entry.createdAt).toLocaleString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

/**
 * Newest-first list of recorded pomodoros, loaded 30 at a time.
 *
 * @since 2.1.0
 * @category Components
 */
export function History() {
	const first = useAtomValue(historyFirstPageAtom);
	const refreshFirst = useAtomRefresh(historyFirstPageAtom);
	const [page, loadPage] = useAtom(historyPageAtom, { mode: "promiseExit" });
	const [more, setMore] = useState<ReadonlyArray<HistoryEntry>>([]);
	const [cursor, setCursor] = useState<Option.Option<Option.Option<number>>>(
		Option.none(),
	);
	const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());

	useEffect(() => refreshFirst(), [refreshFirst]);

	if (
		AsyncResult.isInitial(first) ||
		(first.waiting && !AsyncResult.isSuccess(first))
	) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
		);
	}
	if (!AsyncResult.isSuccess(first)) {
		return (
			<p className="py-8 text-center text-sm text-destructive">
				Failed to load history.
			</p>
		);
	}

	const entries = [...first.value.items, ...more].filter(
		(e) => !deleted.has(e.id),
	);
	const next = Option.getOrElse(cursor, () => first.value.nextBefore);

	if (entries.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				No pomodoros yet.
			</p>
		);
	}

	return (
		<div className="space-y-3">
			<ul className="divide-y divide-border/40" aria-label="pomodoro history">
				{entries.map((entry) => (
					<HistoryRow
						key={entry.id}
						entry={entry}
						onDeleted={() =>
							setDeleted((current) => new Set([...current, entry.id]))
						}
					/>
				))}
			</ul>
			{Option.isSome(next) && (
				<button
					type="button"
					disabled={page.waiting}
					onClick={async () => {
						const exit = await loadPage(next.value);
						if (Exit.isSuccess(exit)) {
							setMore((current) => [...current, ...exit.value.items]);
							setCursor(Option.some(exit.value.nextBefore));
						}
					}}
					className="w-full rounded-xl border border-border py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
				>
					{page.waiting ? "Loading…" : "Load more"}
				</button>
			)}
		</div>
	);
}

function HistoryRow({
	entry,
	onDeleted,
}: {
	readonly entry: HistoryEntry;
	readonly onDeleted: () => void;
}) {
	const relabel = useAtomSet(labelPastPomodoroAtom, { mode: "promiseExit" });
	const remove = useAtomSet(deletePomodoroAtom, { mode: "promiseExit" });
	const saved = Option.getOrElse(entry.label, () => "");
	const [label, setLabel] = useState(saved);
	const [confirming, setConfirming] = useState(false);

	return (
		<li className="flex items-center gap-3 py-2 text-xs">
			<div className="min-w-0 flex-1 space-y-0.5">
				<input
					value={label}
					maxLength={120}
					onChange={(event) => setLabel(event.target.value)}
					onBlur={() => {
						if (label.trim() !== saved) void relabel({ id: entry.id, label });
					}}
					onKeyDown={(event) =>
						event.key === "Enter" && event.currentTarget.blur()
					}
					placeholder="no label"
					aria-label={`label for pomodoro on ${when(entry)}`}
					className="w-full truncate bg-transparent text-sm text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 -mx-1"
				/>
				<p className="text-muted-foreground/60">
					{when(entry)}
					{Option.isNone(entry.completedAt) && " · unfinished"}
				</p>
			</div>
			<dl className="grid grid-cols-3 gap-2 text-right font-mono text-muted-foreground">
				<div>
					<dt className="sr-only">focus</dt>
					<dd>{formatDuration(entry.focusSeconds)}</dd>
				</div>
				<div>
					<dt className="sr-only">break</dt>
					<dd>{formatDuration(entry.breakSeconds)}</dd>
				</div>
				<div>
					<dt className="sr-only">overtime</dt>
					<dd
						className={cn(
							entry.overtimeSeconds > 0 && "text-[var(--lofi-overtime)]",
						)}
					>
						+{formatDuration(entry.overtimeSeconds)}
					</dd>
				</div>
			</dl>
			<button
				type="button"
				aria-label={
					confirming ? "confirm delete" : `delete pomodoro on ${when(entry)}`
				}
				onBlur={() => setConfirming(false)}
				onClick={async () => {
					if (!confirming) return setConfirming(true);
					const exit = await remove(entry.id);
					if (Exit.isSuccess(exit)) onDeleted();
				}}
				className={cn(
					"rounded px-2 py-1",
					confirming
						? "bg-destructive/15 text-destructive"
						: "text-muted-foreground/40 hover:text-destructive",
				)}
			>
				{confirming ? "delete?" : "×"}
			</button>
		</li>
	);
}
