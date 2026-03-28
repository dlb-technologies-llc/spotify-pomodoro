/**
 * React hook for fetching session statistics.
 *
 * @module
 */
import { useCallback, useEffect, useState } from "react";
import { getStats, type SessionStatsEncoded } from "@/lib/sessionApi";

/**
 * Hook for fetching and managing session statistics.
 *
 * @since 0.2.0
 * @category Hooks
 */
export function useStats() {
	const [stats, setStats] = useState<SessionStatsEncoded | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchStats = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await getStats();
			setStats(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to fetch stats");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchStats();
	}, [fetchStats]);

	return {
		stats,
		loading,
		error,
		refetch: fetchStats,
	};
}

/**
 * Format seconds as hours and minutes.
 *
 * @since 0.2.0
 * @category Helpers
 */
export function formatDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}
