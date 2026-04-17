import { useEffect, useRef } from "react";

export type WheelDirection = "up" | "down";

// SGR mouse report: ESC [ < Cb ; Cx ; Cy (M|m)
// Cb 64 = wheel up, 65 = wheel down. Other Cb values (buttons, motion) are ignored here.
const SGR_MOUSE_RE = /\x1b\[<(\d+);\d+;\d+[Mm]/g;
const WHEEL_UP = 64;
const WHEEL_DOWN = 65;

/**
 * Subscribes to mouse wheel events from stdin while the hook is mounted.
 * Does NOT toggle terminal mouse-reporting mode on its own — the CLI entry
 * point enables/disables that once per TUI session (see `enableMouseReporting`
 * / `disableMouseReporting`) so that repeated mount/unmount of components
 * (e.g. toggling fullscreen) doesn't flicker the mode bytes.
 */
export function useMouseWheel(handler: (dir: WheelDirection) => void) {
	const handlerRef = useRef(handler);
	useEffect(() => {
		handlerRef.current = handler;
	}, [handler]);

	useEffect(() => {
		if (!process.stdin.isTTY) return;
		const onData = (buf: Buffer) => {
			const s = buf.toString("utf8");
			SGR_MOUSE_RE.lastIndex = 0;
			let m: RegExpExecArray | null;
			// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
			while ((m = SGR_MOUSE_RE.exec(s))) {
				const cb = Number(m[1]);
				if (cb === WHEEL_UP) handlerRef.current("up");
				else if (cb === WHEEL_DOWN) handlerRef.current("down");
			}
		};
		process.stdin.on("data", onData);
		return () => {
			process.stdin.off("data", onData);
		};
	}, []);
}

export function enableMouseReporting() {
	if (process.stdout.isTTY) {
		// ?1000h: basic mouse button reporting. ?1006h: SGR extended format
		// (clean parseable CSI sequences regardless of coordinate magnitude).
		process.stdout.write("\x1b[?1000h\x1b[?1006h");
	}
}

export function disableMouseReporting() {
	if (process.stdout.isTTY) {
		process.stdout.write("\x1b[?1000l\x1b[?1006l");
	}
}
