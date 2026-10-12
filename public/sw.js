/**
 * Offline support: hashed build assets are served from cache, pages are
 * fetched from the network and fall back to the last good copy when
 * offline. API calls are never cached; the app queues them itself.
 *
 * @module
 */

const CACHE = "spotify-pomodoro-v2";
const STATIC = [
	"/favicon.svg",
	"/manifest.webmanifest",
	"/icons/icon-192.png",
	"/icons/icon-512.png",
];
const FRESH = ["/theme-init.js"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...STATIC, ...FRESH]))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

/**
 * Serves from cache, fetching and storing on a miss.
 *
 * @param {Request} request
 */
const cacheFirst = async (request) => {
	const cached = await caches.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		const cache = await caches.open(CACHE);
		await cache.put(request, response.clone());
	}
	return response;
};

/**
 * Fetches a page or unhashed script, keeping the last successful copy for
 * offline use.
 *
 * @param {Request} request
 */
const networkFirst = async (request) => {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok && !response.redirected)
			await cache.put(request, response.clone());
		return response;
	} catch (error) {
		const cached = (await cache.match(request)) ?? (await cache.match("/"));
		if (cached) return cached;
		throw error;
	}
};

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (request.method !== "GET" || url.origin !== self.location.origin) return;
	if (url.pathname.startsWith("/api/") || url.pathname === "/callback") return;
	if (url.pathname.startsWith("/_astro/") || STATIC.includes(url.pathname)) {
		event.respondWith(cacheFirst(request));
	} else if (request.mode === "navigate" || FRESH.includes(url.pathname)) {
		event.respondWith(networkFirst(request));
	}
});
