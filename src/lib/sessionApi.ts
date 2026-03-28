/**
 * Client-side API for session recording.
 *
 * @module
 */

import type {
	BreakSession,
	FocusSession,
	Pomodoro,
	SessionStats,
} from "@/effect/schema/Session";
import { tracedFetch } from "@/lib/traced-fetch";

/**
 * Encoded pomodoro response from API (dates as epoch ms).
 *
 * @since 0.5.0
 * @category Types
 */
export type PomodoroEncoded = typeof Pomodoro.Encoded;

/**
 * Encoded focus session response from API (dates as epoch ms).
 *
 * @since 0.5.0
 * @category Types
 */
export type FocusSessionEncoded = typeof FocusSession.Encoded;

/**
 * Encoded break session response from API (dates as epoch ms).
 *
 * @since 0.5.0
 * @category Types
 */
export type BreakSessionEncoded = typeof BreakSession.Encoded;

/**
 * Encoded stats response from API.
 *
 * @since 0.5.0
 * @category Types
 */
export type SessionStatsEncoded = typeof SessionStats.Encoded;

/**
 * Create a new pomodoro.
 *
 * @since 0.2.0
 * @category API
 */
export async function createPomodoro(): Promise<PomodoroEncoded> {
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
export async function completePomodoro(id: string): Promise<PomodoroEncoded> {
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
): Promise<FocusSessionEncoded> {
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
): Promise<FocusSessionEncoded> {
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
): Promise<BreakSessionEncoded> {
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
): Promise<BreakSessionEncoded> {
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
export async function getStats(): Promise<SessionStatsEncoded> {
	const response = await tracedFetch("session.getStats", "/api/stats");
	if (!response.ok) {
		throw new Error(`Failed to get stats: ${response.statusText}`);
	}
	return response.json();
}
