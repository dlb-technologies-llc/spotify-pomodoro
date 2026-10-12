/**
 * Cycle progress, daily goal, and the pomodoro label.
 *
 * @module
 */
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import {
	labelAtom,
	relabelAtom,
	settingsAtom,
	todayCountAtom,
} from "@/client/atoms";
import { cn } from "@/lib/utils";
import type { TimerState } from "@/shared/domain/Timer";

/**
 * One dot per focus session in the cycle; filled dots are done.
 *
 * @since 2.1.0
 * @category Components
 */
export function CycleDots({ timer }: { readonly timer: TimerState }) {
	const every = timer.config.longBreakEvery;
	const done = timer.cycleProgress;
	return (
		<div className="flex gap-1.5">
			<span className="sr-only">{`${done} of ${every} focus sessions until a long break`}</span>
			{Array.from({ length: every }, (_, index) => (
				<span
					key={`dot-${index}`}
					aria-hidden="true"
					className={cn(
						"h-1.5 w-1.5 rounded-full transition-colors",
						index < done ? "bg-[var(--lofi-focus)]" : "bg-muted-foreground/20",
					)}
				/>
			))}
		</div>
	);
}

/**
 * Today's completed pomodoros against the daily goal.
 *
 * @since 2.1.0
 * @category Components
 */
export function GoalProgress() {
	const settings = AsyncResult.getOrElse(
		useAtomValue(settingsAtom),
		() => undefined,
	);
	const today = AsyncResult.getOrElse(
		useAtomValue(todayCountAtom),
		() => undefined,
	);
	if (!settings || settings.dailyGoal === 0 || today === undefined) return null;
	const goal = settings.dailyGoal;
	const reached = today >= goal;
	return (
		<div className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground/60">
			<span aria-live="polite">
				{reached ? `goal reached · ${today} today` : `${today} / ${goal} today`}
			</span>
			<progress
				max={goal}
				value={Math.min(today, goal)}
				aria-label="daily goal"
				className="goal-progress h-1 w-32"
			/>
		</div>
	);
}

/**
 * Optional "what are you working on?" field, saved on blur or Enter.
 *
 * @since 2.1.0
 * @category Components
 */
export function LabelInput() {
	const label = AsyncResult.getOrElse(useAtomValue(labelAtom), () =>
		Option.none<string>(),
	);
	const saved = Option.getOrElse(label, () => "");
	return <LabelField key={saved} saved={saved} />;
}

function LabelField({ saved }: { readonly saved: string }) {
	const relabel = useAtomSet(relabelAtom);
	const [draft, setDraft] = useState(saved);

	const commit = () => {
		if (draft.trim() !== saved) relabel(draft);
	};

	return (
		<input
			type="text"
			value={draft}
			maxLength={120}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") {
					setDraft(saved);
					event.currentTarget.blur();
				}
			}}
			placeholder="what are you working on?"
			aria-label="pomodoro label"
			className={cn(
				"w-64 bg-transparent text-center text-sm",
				"text-muted-foreground placeholder:text-muted-foreground/30",
				"border-b border-transparent hover:border-border focus:border-border",
				"focus:outline-none transition-colors py-1",
			)}
		/>
	);
}
