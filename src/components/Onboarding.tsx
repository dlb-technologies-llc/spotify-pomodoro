/**
 * First-run walkthrough.
 *
 * @module
 */
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import {
	connectSpotifyAtom,
	onboardedAtom,
	spotifyConnectedAtom,
} from "@/client/atoms";
import { cn } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";

const SHORTCUTS = [
	["Space", "start or resume"],
	["B", "take a break"],
	["F", "back to focus"],
	["E", "end the pomodoro"],
	["R", "reset a paused phase"],
];

const button =
	"min-h-10 px-4 rounded-xl text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Three short steps shown once: what the app does, connecting Spotify, and
 * the shortcuts.
 *
 * @since 2.1.0
 * @category Components
 */
export function Onboarding() {
	const [onboarded, setOnboarded] = useAtom(onboardedAtom);
	const connected = AsyncResult.getOrElse(
		useAtomValue(spotifyConnectedAtom),
		() => false,
	);
	const connect = useAtomSet(connectSpotifyAtom);
	const [step, setStep] = useState(0);
	const finish = () => setOnboarded(true);

	const steps = [
		{
			title: "Welcome to Spotify Pomodoro",
			body: (
				<p>
					Focus in timed sessions with short breaks in between, and a longer
					break every few rounds. Your sessions are saved so you can see your
					streaks and focus time later.
				</p>
			),
		},
		{
			title: "Bring your music",
			body: connected ? (
				<p>
					Spotify is connected. Pick a playlist under the timer and it follows
					your focus and breaks.
				</p>
			) : (
				<div className="space-y-3">
					<p>
						Connect Spotify to play a focus playlist that pauses, changes, or
						quiets down on breaks. Playing in this browser needs Premium;
						otherwise use the Spotify app on any device.
					</p>
					<button
						type="button"
						onClick={() => {
							finish();
							connect();
						}}
						className={cn(
							button,
							"bg-[#1DB954]/10 text-[var(--spotify-text)] border-[#1DB954]/30",
						)}
					>
						Connect Spotify
					</button>
				</div>
			),
		},
		{
			title: "Shortcuts",
			body: (
				<div className="space-y-3">
					<table className="w-full text-left">
						<tbody>
							{SHORTCUTS.map(([key, action]) => (
								<tr key={key}>
									<th scope="row" className="w-20 py-1 font-normal">
										<kbd className="rounded border border-border px-2 py-0.5 font-mono text-xs">
											{key}
										</kbd>
									</th>
									<td className="py-1">{action}</td>
								</tr>
							))}
						</tbody>
					</table>
					<p>
						Every shortcut also has a button, so it works the same by touch.
					</p>
				</div>
			),
		},
	];
	const current = steps[step] ?? steps[0];
	const last = step === steps.length - 1;

	return (
		<Dialog open={!onboarded} onOpenChange={(open) => !open && finish()}>
			<DialogContent className="bg-card/95 backdrop-blur-lg border-border w-[95vw] max-w-md">
				<DialogHeader>
					<DialogTitle className="text-lg font-medium tracking-wide">
						{current?.title}
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground">
						Step {step + 1} of {steps.length}
					</DialogDescription>
				</DialogHeader>
				<div className="text-sm text-muted-foreground leading-relaxed">
					{current?.body}
				</div>
				<div className="flex items-center justify-between gap-3 pt-2">
					<button
						type="button"
						onClick={finish}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						Skip
					</button>
					<div className="flex gap-2">
						{step > 0 && (
							<button
								type="button"
								onClick={() => setStep(step - 1)}
								className={cn(
									button,
									"border-border text-muted-foreground hover:text-foreground",
								)}
							>
								Back
							</button>
						)}
						<button
							type="button"
							onClick={() => (last ? finish() : setStep(step + 1))}
							className={cn(
								button,
								"bg-primary/15 text-primary border-primary/30 hover:bg-primary/25",
							)}
						>
							{last ? "Get started" : "Next"}
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
