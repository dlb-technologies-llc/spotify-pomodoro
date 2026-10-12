import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const spotify = [
	"https://*.spotify.com",
	"https://*.scdn.co",
	"https://*.spotifycdn.com",
];

export default defineConfig({
	output: "server",
	adapter: node({ mode: "standalone" }),
	server: { port: 2500 },
	vite: { plugins: [tailwindcss()] },
	integrations: [react()],
	markdown: { syntaxHighlight: false },
	security: {
		checkOrigin: true,
		csp: {
			directives: [
				"default-src 'self'",
				`connect-src 'self' https://api.spotify.com wss://*.spotify.com ${spotify.join(" ")}`,
				`img-src 'self' data: blob: ${spotify.join(" ")}`,
				`media-src 'self' blob: ${spotify.join(" ")}`,
				"frame-src https://sdk.scdn.co https://*.spotify.com",
				"worker-src 'self'",
				"manifest-src 'self'",
				"font-src 'self' data: https://fonts.gstatic.com",
				"object-src 'none'",
				"base-uri 'self'",
				"form-action 'self'",
			],
			scriptDirective: { resources: ["'self'", "https://sdk.scdn.co"] },
		},
	},
});
