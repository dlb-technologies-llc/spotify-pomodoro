/**
 * Stats dialog component for displaying session statistics.
 *
 * @module
 */

import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useMemo, useState } from "react";
import { settingsAtom, statsAtom } from "@/client/atoms";
import { DataPanel } from "./stats/DataPanel";
import { History } from "./stats/History";
import {
	FocusChart,
	FocusHeatmap,
	OvertimeSummary,
	StreakNudge,
	WeeklySummary,
} from "./stats/Insights";
import { formatDuration, localIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
	DailyActivity,
	PeriodStats,
	StatsPeriod,
} from "@/shared/domain/Stats";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";

/**
 * Views inside the statistics dialog.
 *
 * @since 2.1.0
 * @category Schemas
 */
const StatsTab = Schema.Literals(["overview", "history", "data"]);

type StatsTab = typeof StatsTab.Type;

/**
 * Dialog displaying pomodoro session statistics.
 *
 * @since 0.2.0
 * @category Components
 */
export function StatsDialog({
	children,
}: {
	readonly children: React.ReactNode;
}) {
	const result = useAtomValue(statsAtom);
	const refresh = useAtomRefresh(statsAtom);
	const settings = AsyncResult.getOrElse(
		useAtomValue(settingsAtom),
		() => undefined,
	);
	const [period, setPeriod] = useState<StatsPeriod>("today");
	const [tab, setTab] = useState<StatsTab>("overview");
	const [today] = useState(() => new Date());
	const stats = AsyncResult.getOrElse(result, () => undefined);
	const loading = result.waiting || AsyncResult.isInitial(result);
	const failed = AsyncResult.isFailure(result);
	const periodStats = stats?.[period];

	return (
		<Dialog onOpenChange={(open) => open && refresh()}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent
				className={cn(
					"bg-card/95 backdrop-blur-lg border-border",
					"w-[95vw] max-w-lg sm:max-w-xl",
					"max-h-[90vh] overflow-y-auto",
				)}
				aria-describedby={undefined}
			>
				<DialogHeader>
					<DialogTitle className="text-lg font-medium tracking-wide">
						Statistics
					</DialogTitle>
				</DialogHeader>

				<div
					role="tablist"
					aria-label="statistics views"
					className="flex gap-1 rounded-lg bg-secondary/30 p-0.5"
				>
					{StatsTab.literals.map((value) => (
						<button
							key={value}
							type="button"
							role="tab"
							aria-selected={tab === value}
							onClick={() => setTab(value)}
							className={cn(
								"flex-1 rounded-md px-3 py-1 text-xs capitalize transition-all",
								tab === value
									? "bg-primary/20 text-primary font-medium"
									: "text-muted-foreground/70 hover:text-foreground",
							)}
						>
							{value}
						</button>
					))}
				</div>

				{tab === "history" && <History />}
				{tab === "data" && <DataPanel onImported={refresh} />}

				{tab === "overview" && loading && (
					<div className="py-8 text-center text-muted-foreground">
						Loading...
					</div>
				)}

				{tab === "overview" && failed && !loading && (
					<div className="py-8 text-center text-red-500">
						Failed to load statistics
					</div>
				)}

				{tab === "overview" && stats && !loading && (
					<div className="space-y-4">
						<StreakNudge stats={stats} />
						<WeeklySummary
							stats={stats}
							dailyGoal={settings?.dailyGoal ?? 0}
							today={today}
						/>
						<ContributionGraph dailyActivity={stats.dailyActivity} />

						<div className="flex items-center justify-between gap-2 px-1">
							<div className="flex items-center gap-1 text-xs text-muted-foreground/60">
								<span className="hidden sm:inline">
									{stats.currentStreak} day streak
								</span>
								<span className="sm:hidden">{stats.currentStreak}d streak</span>
								<span className="text-muted-foreground/30">·</span>
								<span>best: {stats.longestStreak}</span>
							</div>
							<PeriodTabs period={period} onChange={setPeriod} />
						</div>

						{periodStats && <PeriodStatsGrid stats={periodStats} />}

						<FocusChart dailyActivity={stats.dailyActivity} today={today} />
						<FocusHeatmap heatmap={stats.focusHeatmap} />
						<OvertimeSummary stats={stats} />

						<div className="pt-1 text-center text-xs text-muted-foreground/50">
							{stats.completedPomodoros} total pomodoros completed
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

/**
 * Tab buttons for selecting time period.
 *
 * @since 0.3.0
 * @category Components
 */
function PeriodTabs({
	period,
	onChange,
}: {
	readonly period: StatsPeriod;
	readonly onChange: (period: StatsPeriod) => void;
}) {
	const tabs: ReadonlyArray<{
		readonly value: StatsPeriod;
		readonly label: string;
		readonly shortLabel: string;
	}> = [
		{ value: "today", label: "Today", shortLabel: "D" },
		{ value: "week", label: "Week", shortLabel: "W" },
		{ value: "month", label: "Month", shortLabel: "M" },
		{ value: "year", label: "Year", shortLabel: "Y" },
		{ value: "all", label: "All", shortLabel: "All" },
	];

	return (
		<div className="flex gap-0.5 rounded-lg bg-secondary/30 p-0.5">
			{tabs.map((tab) => (
				<button
					key={tab.value}
					type="button"
					onClick={() => onChange(tab.value)}
					className={cn(
						"px-2 py-1 text-xs rounded-md transition-all",
						"sm:px-3",
						period === tab.value
							? "bg-primary/20 text-primary font-medium"
							: "text-muted-foreground/70 hover:text-foreground hover:bg-secondary/50",
					)}
				>
					<span className="hidden sm:inline">{tab.label}</span>
					<span className="sm:hidden">{tab.shortLabel}</span>
				</button>
			))}
		</div>
	);
}

/**
 * Grid of stats for the selected period.
 *
 * @since 0.3.0
 * @category Components
 */
function PeriodStatsGrid({ stats }: { readonly stats: PeriodStats }) {
	return (
		<div className="grid grid-cols-3 gap-2 sm:gap-3">
			<StatCard label="Pomodoros" value={stats.pomodoros} />
			<StatCard label="Focus" value={formatDuration(stats.focusSeconds)} />
			<StatCard label="Break" value={formatDuration(stats.breakSeconds)} />
		</div>
	);
}

/**
 * Individual stat card for displaying a metric.
 *
 * @since 0.2.0
 * @category Components
 */
function StatCard({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string | number;
}) {
	return (
		<div
			className={cn(
				"rounded-xl bg-secondary/30 border border-border/50 p-2 sm:p-3",
				"text-center",
			)}
		>
			<div className="text-[10px] sm:text-xs text-muted-foreground/70 uppercase tracking-wide mb-0.5 sm:mb-1">
				{label}
			</div>
			<div className="font-mono font-semibold text-lg sm:text-xl">{value}</div>
		</div>
	);
}

/**
 * GitHub-style contribution graph showing daily activity for a full year.
 *
 * @since 0.3.0
 * @category Components
 */
function ContributionGraph({
	dailyActivity,
}: {
	readonly dailyActivity: ReadonlyArray<DailyActivity>;
}) {
	const [today] = useState(() => new Date());
	const currentYear = today.getFullYear();
	const availableYears = useMemo(() => {
		const years = new Set<number>();
		years.add(currentYear);
		for (const d of dailyActivity) {
			years.add(Number(d.date.slice(0, 4)));
		}
		return Array.from(years).toSorted((a, b) => b - a);
	}, [dailyActivity, currentYear]);

	const [selectedYear, setSelectedYear] = useState(currentYear);

	const { weeks, maxCount, monthLabels } = useMemo(() => {
		const activityMap = new Map(dailyActivity.map((d) => [d.date, d.count]));

		const yearStart = new Date(selectedYear, 0, 1);
		const firstSunday = new Date(yearStart);
		firstSunday.setDate(yearStart.getDate() - yearStart.getDay());

		const yearEnd = new Date(selectedYear, 11, 31);
		const lastSaturday = new Date(yearEnd);
		lastSaturday.setDate(yearEnd.getDate() + (6 - yearEnd.getDay()));

		const result: {
			date: string | null;
			count: number;
			dayOfWeek: number;
		}[][] = [];
		const months: { label: string; weekIndex: number }[] = [];

		let maxVal = 0;
		let weekIdx = 0;
		const currentDate = new Date(firstSunday);

		const weekCount =
			Math.round(
				(lastSaturday.getTime() - firstSunday.getTime()) /
					(7 * 24 * 60 * 60 * 1000),
			) + 1;

		for (let w = 0; w < weekCount; w++) {
			const week: { date: string | null; count: number; dayOfWeek: number }[] =
				[];

			for (let d = 0; d < 7; d++) {
				const isOutOfYear =
					currentDate.getFullYear() !== selectedYear || currentDate > today;
				const dateStr = localIsoDate(currentDate);
				const count = isOutOfYear ? 0 : activityMap.get(dateStr) || 0;

				if (!isOutOfYear) {
					maxVal = Math.max(maxVal, count);
				}

				week.push({
					date: isOutOfYear ? null : dateStr,
					count,
					dayOfWeek: d,
				});

				if (
					currentDate.getDate() <= 7 &&
					currentDate.getFullYear() === selectedYear &&
					d === 0
				) {
					months.push({
						label: currentDate.toLocaleDateString("en-US", { month: "short" }),
						weekIndex: weekIdx,
					});
				}

				currentDate.setDate(currentDate.getDate() + 1);
			}

			result.push(week);
			weekIdx++;
		}

		return { weeks: result, maxCount: maxVal, monthLabels: months };
	}, [dailyActivity, selectedYear, today]);

	const getIntensity = (count: number): number => {
		if (count === 0) return 0;
		if (maxCount <= 1) return 4;
		const ratio = count / maxCount;
		if (ratio <= 0.25) return 1;
		if (ratio <= 0.5) return 2;
		if (ratio <= 0.75) return 3;
		return 4;
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex gap-1">
					{availableYears.map((year) => (
						<button
							key={year}
							type="button"
							onClick={() => setSelectedYear(year)}
							className={cn(
								"px-2 py-0.5 text-xs rounded transition-colors",
								selectedYear === year
									? "bg-primary/20 text-primary font-medium"
									: "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/50",
							)}
						>
							{year}
						</button>
					))}
				</div>
			</div>

			<div className="overflow-x-auto">
				<div className="min-w-[280px]">
					<div
						className="grid gap-[3px] text-[8px] text-muted-foreground/50 mb-1"
						style={{
							gridTemplateColumns: `16px repeat(${weeks.length}, 1fr)`,
						}}
					>
						<div />
						{monthLabels.map((m, i) => {
							const nextIdx = monthLabels[i + 1]?.weekIndex ?? weeks.length;
							const span = nextIdx - m.weekIndex;
							return (
								<div
									key={`${m.label}-${i}`}
									style={{ gridColumn: `span ${span}` }}
									className="text-center truncate"
								>
									{m.label}
								</div>
							);
						})}
					</div>

					<div className="flex gap-[3px]">
						<div className="flex flex-col justify-between text-[8px] text-muted-foreground/50 w-4 shrink-0 py-[2px]">
							<span>S</span>
							<span>W</span>
							<span>S</span>
						</div>

						<div className="flex gap-[2px] flex-1">
							{weeks.map((week, wIdx) => (
								<div key={wIdx} className="flex flex-col gap-[2px] flex-1">
									{week.map((day, dIdx) => (
										<ContributionCell
											key={day.date ?? `empty-${wIdx}-${dIdx}`}
											date={day.date}
											count={day.count}
											intensity={day.date ? getIntensity(day.count) : -1}
										/>
									))}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			<div className="flex items-center justify-end gap-1.5 text-[9px] text-muted-foreground/50">
				<span>Less</span>
				{[0, 1, 2, 3, 4].map((level) => (
					<div
						key={level}
						className={cn(
							"w-2.5 h-2.5 rounded-sm",
							level === 0 && "bg-secondary/50",
							level === 1 && "bg-[var(--lofi-focus)]/25",
							level === 2 && "bg-[var(--lofi-focus)]/45",
							level === 3 && "bg-[var(--lofi-focus)]/70",
							level === 4 && "bg-[var(--lofi-focus)]",
						)}
					/>
				))}
				<span>More</span>
			</div>
		</div>
	);
}

/**
 * Single cell in the contribution graph.
 *
 * @since 0.3.0
 * @category Components
 */
function ContributionCell({
	date,
	count,
	intensity,
}: {
	readonly date: string | null;
	readonly count: number;
	readonly intensity: number;
}) {
	if (intensity === -1 || !date) {
		return <div className="aspect-square rounded-sm bg-transparent" />;
	}

	const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString(
		"en-US",
		{
			month: "short",
			day: "numeric",
			year: "numeric",
		},
	);

	return (
		<div
			className={cn(
				"aspect-square rounded-sm transition-colors cursor-default",
				"hover:ring-1 hover:ring-foreground/20",
				intensity === 0 && "bg-secondary/50",
				intensity === 1 && "bg-[var(--lofi-focus)]/25",
				intensity === 2 && "bg-[var(--lofi-focus)]/45",
				intensity === 3 && "bg-[var(--lofi-focus)]/70",
				intensity === 4 && "bg-[var(--lofi-focus)]",
			)}
			title={`${formattedDate}: ${count} pomodoro${count !== 1 ? "s" : ""}`}
		/>
	);
}
