import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "./src") };

export default defineConfig({
	resolve: { alias },
	test: {
		setupFiles: ["./vitest.setup.ts"],
		projects: [
			{
				resolve: { alias },
				test: {
					name: "unit",
					include: ["test/**/*.test.ts"],
					exclude: ["test/live/**"],
					setupFiles: ["./vitest.setup.ts"],
				},
			},
			{
				resolve: { alias },
				test: {
					name: "live",
					include: ["test/live/**/*.test.ts"],
					setupFiles: ["./vitest.setup.ts"],
					testTimeout: 30_000,
				},
			},
		],
	},
});
