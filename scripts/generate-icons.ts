/**
 * Renders the app icons in `public/icons` from `public/favicon.svg`.
 *
 * Usage: `bun scripts/generate-icons.ts` (needs Playwright's Chromium).
 *
 * @module
 */
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svg = await readFile("public/favicon.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();

const render = async (size: number, file: string, maskable: boolean) => {
	await page.setViewportSize({ width: size, height: size });
	const inner = maskable ? size * 0.7 : size;
	await page.setContent(
		`<html><body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${maskable ? "#1a1820" : "transparent"}">
			<div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
		</body></html>`,
	);
	await page.screenshot({
		path: `public/icons/${file}`,
		omitBackground: !maskable,
	});
};

await render(192, "icon-192.png", false);
await render(512, "icon-512.png", false);
await render(512, "icon-maskable-512.png", true);
await render(180, "apple-touch-icon.png", true);
await browser.close();
