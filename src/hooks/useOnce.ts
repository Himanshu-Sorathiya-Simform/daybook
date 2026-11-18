import { useRef } from "react";

/**
 * One write at a time for one button, form or notice. A mutation's `isPending` reaches a render
 * a tick after the press, so a second press in the same frame, such as Enter twice or a key
 * repeat, still finds the control idle. Each press builds its own idempotency key, so the server
 * could not tell the second write from a new one. This flag is raised on the press itself.
 *
 * `run` starts `write` unless one is out, and answers `null` when it did not start it. The flag
 * is lowered once the write has settled, before the caller's own handlers run.
 */
export function useOnce() {
	const running = useRef(false);
	return {
		run<Write extends Promise<unknown>>(write: () => Write): Write | null {
			if (running.current) return null;
			running.current = true;
			return write().finally(() => {
				running.current = false;
			}) as Write;
		},
		/** Whether a write is out. */
		isRunning: () => running.current,
	};
}
