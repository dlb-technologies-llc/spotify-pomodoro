/**
 * Open/close state for a popover anchored to a button.
 *
 * @module
 */
import { useEffect, useRef, useState } from "react";

/**
 * Popover state that closes on Escape or a click outside, returning focus
 * to the trigger when closed from the keyboard.
 *
 * @since 2.1.0
 * @category Hooks
 */
export function usePopover<Panel extends HTMLElement>() {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const panel = useRef<Panel>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (panel.current?.contains(target) || trigger.current?.contains(target))
				return;
			setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.stopPropagation();
			setOpen(false);
			trigger.current?.focus();
		};
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return { open, setOpen, trigger, panel };
}
