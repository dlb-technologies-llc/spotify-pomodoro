/**
 * Weekly summary, streak nudge, focus charts, heatmap, and overtime.
 *
 * @module
 */
import { Schema } from "effect";
import { useState } from "react";
import {
	addDays,
	formatDuration,
	localIsoDate,
	startOfWeek,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { DailyActivity, SessionStats } from "@/shared/domain/Stats";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Focus chart granularity.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const ChartMode = Schema.Literals(["day", "week"]);

/**
 * @since 2.1.0
 * @category Schemas
 */
export type ChartMode = typeof ChartMode.Type;

/**
 * A nudge shown when today has no pomodoro yet but a streak is running.
 *
 * @since 2.1.0
 * @category Components
 */
export function StreakNudge({ stats }: { readonly stats: SessionStats }) {
	if (!stats.streakAtRisk) return null;
	return (
		<output className="block rounded-xl border border-[var(--lofi-overtime)]/30 bg-[var(--lofi-overtime-bg)] px-3 py-2 text-xs text-[var(--lofi-overtime)]">
			Do one pomodoro today to keep your {stats.currentStreak}-day streak.
		</output>
	);
}

/**
 * This week's focus time, pomodoros against the goal, and best day.
 *
 * @since 2.1.0
 * @category Components
 */
export function WeeklySummary({
	stats,
	dailyGoal,
	today,
}: {
	readonly stats: SessionStats;
	readonly dailyGoal: number;
	readonly today: Date;
}) {
	const counts = new Map(stats.dailyActivity.map((d) => [d.date, d.count]));
	const days = Array.from({ length: 7 }, (_, i) =>
		addDays(startOfWeek(today), i),
	);
	const best = days
		.map((day) => ({ day, count: counts.get(localIsoDate(day)) ?? 0 }))
		.reduce((top, entry) => (entry.count > top.count ? entry : top), {
			day: today,
			count: 0,
		});
	const goal = dailyGoal * 7;
	return (
		<section
			aria-label="this week"
			className="grid grid-cols-3 gap-2 text-center"
		>
			<Summary
				label="Focus this week"
				value={formatDuration(stats.week.focusSeconds)}
			/>
			<Summary
				label="Pomodoros"
				value={
					goal > 0
						? `${stats.week.pomodoros} / ${goal}`
						: String(stats.week.pomodoros)
				}
			/>
			<Summary
				label="Best day"
				value={
					best.count > 0
						? `${WEEKDAYS[best.day.getDay()]} · ${best.count}`
						: "—"
				}
			/>
		</section>
	);
}

function Summary({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}) {
	return (
		<div className="rounded-xl border border-border/50 bg-secondary/30 p-2">
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground/90">
				{label}
			</div>
			<div className="font-mono text-sm font-semibold">{value}</div>
		</div>
	);
}

/**
 * Focus seconds per bucket, oldest first.
 *
 * @since 2.1.0
 * @category Helpers
 */
export const focusBuckets = (
	dailyActivity: ReadonlyArray<DailyActivity>,
	today: Date,
	mode: ChartMode,
) => {
	const byDate = new Map(dailyActivity.map((d) => [d.date, d.focusSeconds]));
	if (mode === "day") {
		return Array.from({ length: 14 }, (_, i) => {
			const day = addDays(today, i - 13);
			return {
				label: `${day.getMonth() + 1}/${day.getDate()}`,
				seconds: byDate.get(localIsoDate(day)) ?? 0,
			};
		});
	}
	const thisWeek = startOfWeek(today);
	return Array.from({ length: 12 }, (_, i) => {
		const start = addDays(thisWeek, (i - 11) * 7);
		const seconds = Array.from({ length: 7 }, (_day, d) =>
			addDays(start, d),
		).reduce((sum, day) => sum + (byDate.get(localIsoDate(day)) ?? 0), 0);
		return { label: `${start.getMonth() + 1}/${start.getDate()}`, seconds };
	});
};

/**
 * Bar chart of focus time per day (last 14) or week (last 12).
 *
 * @since 2.1.0
 * @category Components
 */
export function FocusChart({
	dailyActivity,
	today,
}: {
	readonly dailyActivity: ReadonlyArray<DailyActivity>;
	readonly today: Date;
}) {
	const [mode, setMode] = useState<ChartMode>("day");
	const buckets = focusBuckets(dailyActivity, today, mode);
	const max = Math.max(1, ...buckets.map((b) => b.seconds));
	return (
		<figure className="space-y-2">
			<figcaption className="flex items-center justify-between text-xs text-muted-foreground/90">
				<span>Focus per {mode}</span>
				<span className="flex gap-1">
					{ChartMode.literals.map((option) => (
						<button
							key={option}
							type="button"
							aria-pressed={mode === option}
							onClick={() => setMode(option)}
							className={cn(
								"rounded px-2 py-0.5",
								mode === option
									? "bg-primary/20 text-primary"
									: "hover:bg-secondary/50",
							)}
						>
							{option === "day" ? "Days" : "Weeks"}
						</button>
					))}
				</span>
			</figcaption>
			<ol className="flex h-24 items-end gap-1">
				{buckets.map((bucket) => (
					<li
						key={bucket.label}
						title={`${bucket.label}: ${formatDuration(bucket.seconds)}`}
						className="flex h-full flex-1 flex-col justify-end"
					>
						<span className="sr-only">{`${bucket.label}: ${formatDuration(bucket.seconds)}`}</span>
						<span
							aria-hidden="true"
							className="block rounded-sm bg-[var(--lofi-focus)]/70"
							style={{
								height: `${(bucket.seconds / max) * 100}%`,
								minHeight: bucket.seconds > 0 ? 2 : 0,
							}}
						/>
					</li>
				))}
			</ol>
			<div
				aria-hidden="true"
				className="flex justify-between text-[9px] text-muted-foreground/90"
			>
				<span>{buckets[0]?.label}</span>
				<span>{buckets.at(-1)?.label}</span>
			</div>
		</figure>
	);
}

/**
 * When focus happens: weekday by starting hour.
 *
 * @since 2.1.0
 * @category Components
 */
export function FocusHeatmap({
	heatmap,
}: {
	readonly heatmap: ReadonlyArray<ReadonlyArray<number>>;
}) {
	const max = Math.max(1, ...heatmap.flat());
	const total = heatmap.flat().reduce((sum, value) => sum + value, 0);
	return (
		<figure className="space-y-2">
			<figcaption className="text-xs text-muted-foreground/90">
				When you focus
			</figcaption>
			{total === 0 ? (
				<p className="text-xs text-muted-foreground/90">
					No focus sessions yet.
				</p>
			) : (
				<table className="w-full border-separate border-spacing-[2px] text-[8px] text-muted-foreground/90">
					<thead>
						<tr>
							<th scope="col" className="w-6">
								<span className="sr-only">day</span>
							</th>
							{Array.from({ length: 24 }, (_, hour) => (
								<th key={hour} scope="col" className="font-normal">
									{hour % 6 === 0 ? hour : ""}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{heatmap.map((row, day) => (
							<tr key={WEEKDAYS[day]}>
								<th scope="row" className="text-left font-normal">
									{WEEKDAYS[day]?.[0]}
								</th>
								{row.map((seconds, hour) => (
									<td
										key={`${WEEKDAYS[day]}-${hour}`}
										title={`${WEEKDAYS[day]} ${hour}:00 · ${formatDuration(seconds)}`}
										className="h-3 rounded-[2px] bg-[var(--lofi-focus)]"
										style={{
											opacity:
												seconds === 0 ? 0.08 : 0.2 + (0.8 * seconds) / max,
										}}
									>
										<span className="sr-only">{formatDuration(seconds)}</span>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			)}
		</figure>
	);
}

/**
 * Average overtime per focus and break session.
 *
 * @since 2.1.0
 * @category Components
 */
export function OvertimeSummary({ stats }: { readonly stats: SessionStats }) {
	return (
		<section
			aria-label="overtime"
			className="grid grid-cols-2 gap-2 text-center"
		>
			<Summary
				label="Avg focus overtime"
				value={formatDuration(stats.averageFocusOvertimeSeconds)}
			/>
			<Summary
				label="Avg break overtime"
				value={formatDuration(stats.averageBreakOvertimeSeconds)}
			/>
		</section>
	);
}
