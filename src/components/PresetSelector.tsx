/**
 * Timer preset selector.
 *
 * @module
 */
import { useAtomSet } from "@effect/atom-react";
import { setPresetAtom } from "@/client/atoms";
import { cn } from "@/lib/utils";
import {
	NamedPreset,
	TIMER_PRESETS,
	type TimerConfig,
} from "@/shared/domain/Timer";

const LABELS = {
	short: "Short",
	classic: "Classic",
	long: "Long",
} satisfies Record<NamedPreset, string>;

/**
 * Buttons for the short, classic, and long presets; edited durations show
 * as Custom.
 *
 * @since 1.0.0
 * @category Components
 */
export function PresetSelector({ config }: { readonly config: TimerConfig }) {
	const setPreset = useAtomSet(setPresetAtom);

	return (
		<div className="flex items-center gap-1">
			{NamedPreset.literals.map((preset) => {
				const { focusSeconds, breakSeconds } = TIMER_PRESETS[preset];
				const isActive = config.preset === preset;
				return (
					<button
						key={preset}
						type="button"
						aria-pressed={isActive}
						onClick={() => setPreset(preset)}
						className={cn(
							"group relative px-3 py-1.5 rounded-lg text-xs font-medium",
							"transition-all duration-300 ease-out",
							"border border-transparent",
							isActive
								? "bg-primary/15 text-primary border-primary/20"
								: "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/30",
						)}
					>
						<span className="relative z-10">{LABELS[preset]}</span>
						<span
							className={cn(
								"absolute inset-x-0 -bottom-5 text-[10px] font-mono",
								"opacity-0 group-hover:opacity-100 transition-opacity duration-200",
								"text-muted-foreground/40",
							)}
						>
							{focusSeconds / 60} / {breakSeconds / 60}
						</span>
					</button>
				);
			})}
			{config.preset === "custom" && (
				<span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary border border-primary/20">
					Custom
				</span>
			)}
		</div>
	);
}
