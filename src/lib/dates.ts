/**
 * Local calendar date helpers for charts.
 *
 * @module
 */

/**
 * Local calendar date as `YYYY-MM-DD`.
 *
 * @since 2.0.0
 * @category Helpers
 */
export const localIsoDate = (date: Date) =>
	[
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");

/**
 * The local date `days` after `date` (negative goes back).
 *
 * @since 2.1.0
 * @category Helpers
 */
export const addDays = (date: Date, days: number) => {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
};

/**
 * Midnight on the Sunday starting the week of `date`.
 *
 * @since 2.1.0
 * @category Helpers
 */
export const startOfWeek = (date: Date) => {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return addDays(start, -start.getDay());
};

/**
 * Formats seconds as `1h 5m` or `5m`.
 *
 * @since 0.2.0
 * @category Helpers
 */
export function formatDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
