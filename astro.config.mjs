import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, sessionDrivers } from "astro/config";

// https://astro.build/config
export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	session: {
		driver: sessionDrivers.fs(),
	},
	server: {
		port: 2500,
	},
	vite: {
		plugins: [tailwindcss()],
	},
	integrations: [react()],
});
