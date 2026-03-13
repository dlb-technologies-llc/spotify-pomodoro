/**
 * Client-side API for session recording.
 *
 * @module
 */

import { tracedFetch } from "@/lib/traced-fetch";

/**
 * Pomodoro response from API.
 *
 * @since 0.2.0
 * @category Types
 */
export interface PomodoroResponse {
	id: string;
	createdAt: number;
	completedAt: number | null;
}

/**
 * Focus/Break session response from API.
 *
 * @since 0.2.0
 * @category Types
 */
export interface SessionResponse {
	id: string;
	pomodoroId: string;
	configuredSeconds: number;
	elapsedSeconds: number;
	startedAt: number;
	completedAt: number | null;
	completed: boolean;
	createdAt: number;
}

/**
 * Daily activity record for contribution graph.
 *
 * @since 0.3.0
 * @category Types
 */
export interface DailyActivity {
	date: string;
	count: number;
	focusSeconds: number;
}

/**
 * Stats for a specific time period.
 *
 * @since 0.3.0
 * @category Types
 */
export interface PeriodStats {
	pomodoros: number;
	focusSeconds: number;
	breakSeconds: number;
	focusOvertimeSeconds: number;
	breakOvertimeSeconds: number;
}

/**
 * Stats response from API.
 *
 * @since 0.2.0
 * @category Types
 */
export interface StatsResponse {
	totalPomodoros: number;
	completedPomodoros: number;
	completedFocusSessions: number;
	completedBreakSessions: number;
	totalFocusSeconds: number;
	totalBreakSeconds: number;
	totalFocusOvertimeSeconds: number;
	totalBreakOvertimeSeconds: number;
	currentStreak: number;
	longestStreak: number;
	todayPomodoros: number;
	thisWeekPomodoros: number;
	thisMonthPomodoros: number;
	today: PeriodStats;
	week: PeriodStats;
	month: PeriodStats;
	year: PeriodStats;
	all: PeriodStats;
	dailyActivity: DailyActivity[];
}

/**
 * Create a new pomodoro.
 *
 * @since 0.2.0
 * @category API
 */
export async function createPomodoro(): Promise<PomodoroResponse> {
	const response = await tracedFetch(
		"session.createPomodoro",
		"/api/pomodoros",
		{
			method: "POST",
		},
	);
	if (!response.ok) {
		throw new Error(`Failed to create pomodoro: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Complete a pomodoro.
 *
 * @since 0.2.0
 * @category API
 */
export async function completePomodoro(id: string): Promise<PomodoroResponse> {
	const response = await tracedFetch(
		"session.completePomodoro",
		`/api/pomodoros/${id}/complete`,
		{ method: "POST" },
	);
	if (!response.ok) {
		throw new Error(`Failed to complete pomodoro: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Create a new focus session.
 *
 * @since 0.2.0
 * @category API
 */
export async function createFocusSession(
	pomodoroId: string,
	configuredSeconds: number,
): Promise<SessionResponse> {
	const response = await tracedFetch(
		"session.createFocusSession",
		"/api/focus-sessions",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ pomodoroId, configuredSeconds }),
		},
	);
	if (!response.ok) {
		throw new Error(`Failed to create focus session: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Complete a focus session.
 *
 * @since 0.2.0
 * @category API
 */
export async function completeFocusSession(
	id: string,
	elapsedSeconds: number,
): Promise<SessionResponse> {
	const response = await tracedFetch(
		"session.completeFocusSession",
		`/api/focus-sessions/${id}/complete`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ elapsedSeconds }),
		},
	);
	if (!response.ok) {
		throw new Error(`Failed to complete focus session: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Create a new break session.
 *
 * @since 0.2.0
 * @category API
 */
export async function createBreakSession(
	pomodoroId: string,
	configuredSeconds: number,
): Promise<SessionResponse> {
	const response = await tracedFetch(
		"session.createBreakSession",
		"/api/break-sessions",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ pomodoroId, configuredSeconds }),
		},
	);
	if (!response.ok) {
		throw new Error(`Failed to create break session: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Complete a break session.
 *
 * @since 0.2.0
 * @category API
 */
export async function completeBreakSession(
	id: string,
	elapsedSeconds: number,
): Promise<SessionResponse> {
	const response = await tracedFetch(
		"session.completeBreakSession",
		`/api/break-sessions/${id}/complete`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ elapsedSeconds }),
		},
	);
	if (!response.ok) {
		throw new Error(`Failed to complete break session: ${response.statusText}`);
	}
	return response.json();
}

/**
 * Get session statistics.
 *
 * @since 0.2.0
 * @category API
 */
export async function getStats(): Promise<StatsResponse> {
	const response = await tracedFetch("session.getStats", "/api/stats");
	if (!response.ok) {
		throw new Error(`Failed to get stats: ${response.statusText}`);
	}
	return response.json();
}
