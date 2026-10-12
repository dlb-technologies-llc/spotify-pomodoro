try {
	const stored = JSON.parse(
		localStorage.getItem("lofi-pomodoro-theme") ?? '"system"',
	);
	const dark =
		stored === "dark" ||
		(stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.style.colorScheme = dark ? "dark" : "light";
} catch {}
