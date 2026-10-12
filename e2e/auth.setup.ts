import path from "node:path";
import { test as setup } from "@playwright/test";

const authFile = path.join(
	import.meta.dirname,
	"../playwright/.auth/user.json",
);

setup("authenticate", async ({ page }) => {
	await page.goto("/login");
	await page.getByLabel("password").fill("test-password");
	await page.getByRole("button", { name: "sign in" }).click();
	await page.waitForURL("/");
	await page.evaluate(() => localStorage.setItem("pomodoro_onboarded", "true"));
	await page.context().storageState({ path: authFile });
});
