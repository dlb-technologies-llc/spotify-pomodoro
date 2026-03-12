/**
 * Login form component for authenticated deployments.
 *
 * @module
 */

import { useState } from "react";
import { cn } from "../lib/utils";

/**
 * Login component props.
 *
 * @since 1.1.0
 * @category Components
 */
interface LoginProps {
	returnUrl?: string;
}

/**
 * Login form with lofi aesthetic.
 *
 * @since 1.1.0
 * @category Components
 */
export function Login({ returnUrl = "/" }: LoginProps) {
	const username = "admin";
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		setIsLoading(true);

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.error || "Login failed");
				setIsLoading(false);
				return;
			}

			window.location.href = returnUrl;
		} catch {
			setError("Connection failed");
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex flex-col">
			<div className="noise-overlay" />

			<main className="flex-1 flex flex-col items-center justify-center px-6">
				<div
					className={cn(
						"relative w-full max-w-sm",
						"animate-in fade-in slide-in-from-bottom-4 duration-700",
					)}
				>
					<div
						className={cn(
							"absolute -inset-px rounded-2xl",
							"bg-gradient-to-br from-[var(--lofi-idle)]/20 via-transparent to-[var(--lofi-focus)]/10",
							"blur-xl opacity-60",
						)}
					/>

					<div
						className={cn(
							"relative px-8 py-10 rounded-2xl",
							"bg-card/60 backdrop-blur-sm",
							"border border-border/50",
							"shadow-xl shadow-black/5",
						)}
					>
						<div className="text-center mb-8">
							<div
								className={cn(
									"inline-flex items-center justify-center",
									"w-16 h-16 rounded-2xl mb-4",
									"bg-[var(--lofi-idle-bg)] border border-[var(--lofi-idle)]/20",
								)}
							>
								<span className="text-3xl">🍅</span>
							</div>

							<h1 className="text-xl font-medium text-foreground tracking-tight">
								spotify pomodoro
							</h1>

							<p className="text-sm text-muted-foreground/60 mt-1">
								enter your credentials to continue
							</p>
						</div>

						<form onSubmit={handleSubmit} className="space-y-4">
							<div className="space-y-2">
								<label
									htmlFor="username"
									className="block text-xs font-medium text-muted-foreground/70 uppercase tracking-wider"
								>
									username
								</label>
								<input
									id="username"
									type="text"
									value={username}
									readOnly
									autoComplete="username"
									className={cn(
										"w-full px-4 py-3 rounded-xl",
										"bg-background/30 border border-border/30",
										"text-muted-foreground cursor-not-allowed",
										"transition-all duration-200",
									)}
								/>
							</div>

							<div className="space-y-2">
								<label
									htmlFor="password"
									className="block text-xs font-medium text-muted-foreground/70 uppercase tracking-wider"
								>
									password
								</label>
								<input
									id="password"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									autoComplete="current-password"
									className={cn(
										"w-full px-4 py-3 rounded-xl",
										"bg-background/50 border border-border/50",
										"text-foreground placeholder:text-muted-foreground/30",
										"focus:outline-none focus:ring-2 focus:ring-[var(--lofi-idle)]/30 focus:border-[var(--lofi-idle)]/50",
										"transition-all duration-200",
									)}
									placeholder="••••••••"
								/>
							</div>

							{error && (
								<div
									className={cn(
										"px-4 py-3 rounded-xl text-sm",
										"bg-destructive/10 text-destructive border border-destructive/20",
										"animate-in fade-in slide-in-from-top-1 duration-200",
									)}
								>
									{error}
								</div>
							)}

							<button
								type="submit"
								disabled={isLoading}
								className={cn(
									"w-full px-4 py-3 rounded-xl text-sm font-medium",
									"bg-[var(--lofi-idle)] text-white",
									"hover:bg-[var(--lofi-idle)]/90",
									"focus:outline-none focus:ring-2 focus:ring-[var(--lofi-idle)]/50 focus:ring-offset-2 focus:ring-offset-card",
									"disabled:opacity-50 disabled:cursor-not-allowed",
									"transition-all duration-200",
									"shadow-lg shadow-[var(--lofi-idle)]/20",
								)}
							>
								{isLoading ? (
									<span className="inline-flex items-center gap-2">
										<span className="animate-spin">◌</span>
										signing in...
									</span>
								) : (
									"sign in"
								)}
							</button>
						</form>

						<div className="mt-8 pt-6 border-t border-border/30 text-center">
							<p className="text-xs text-muted-foreground/40 leading-relaxed">
								credentials are configured via
								<br />
								environment variables
							</p>
						</div>
					</div>
				</div>
			</main>

			<footer className="py-5 text-center">
				<span className="text-muted-foreground/30 text-xs">
					protected instance
				</span>
			</footer>
		</div>
	);
}
