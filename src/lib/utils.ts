import {promises as FSP} from 'fs';
import * as Path from 'path';
import filenamify from 'filenamify';

const isWindows = process.platform === 'win32';

/**
 * Creates an event type with forced expected structure.
 * Makes creating targeted event handlers not pain in the ass.
 */
export type TargetedEvent<Target extends EventTarget = EventTarget, TypedEvent extends Event = Event> = Omit<
	TypedEvent,
	'currentTarget'
> & {
	readonly currentTarget: Target;
};

/**
 * Naive quick type guard. Casts `value` to `T` when `condition` is `true`.
 * ```
 * isOfType<MouseEvent>(event, 'clientX' in event)
 * ```
 */
export function isOfType<T>(value: any, condition: boolean): value is T {
	return condition;
}

/**
 * Extract error message.
 */
export function eem(error: any, preferStack = false) {
	return error instanceof Error ? (preferStack ? error.stack || error.message : error.message) : `${error}`;
}

/**
 * Finds common directory of multiple paths in a collection of path containing
 * objects.
 *
 * ```
 * const array = [
 *   '/foo/bar/baz/file.jpg',
 *   '/foo/bar/baz/file2.jpg',
 *   '/foo/bar/bam/baa/file.jpg',
 *   '/foo/bar/baz/baz/file.jpg',
 * ];
 * findCommonPathsRoot(array, (item) => item); // '/foo/bar'
 * ```
 */
export function findCommonDirectory(array: string[]): string | null;
export function findCommonDirectory<U extends unknown>(array: U[], selector: (array: U) => string): string | null;
export function findCommonDirectory(array: any[], selector?: (array: any) => string): string | null {
	selector = selector || ((str: any) => str);

	const first = array[0];

	if (!first) return null;

	let commonParts: string[] = splitPath(selector(first));

	// Ensure filename is stripped out
	commonParts.pop();

	for (let i = 1; i < array.length; i++) {
		const item = array[i]!;
		const itemParts = splitPath(selector(item));
		const loopSize = Math.min(commonParts.length, itemParts.length);

		for (let i = 0; i < loopSize; i++) {
			if (commonParts[i] === itemParts[i]) continue;
			if (i < commonParts.length) commonParts.splice(i, Infinity);
			break;
		}
	}

	return commonParts.length > 0 ? commonParts.join(Path.sep) : null;
}

export function splitPath(path: string) {
	return normalizePath(path).split(/[\\\/]+/);
}

export async function pathExists(path: string) {
	try {
		await FSP.access(path);
		return true;
	} catch {
		return false;
	}
}

export async function statIfExists(path: string) {
	try {
		return await FSP.stat(path);
	} catch {}
}

export async function deletePath(path: string) {
	await FSP.rm(path, {force: true, recursive: true});
}

export const uid = (size = 10) =>
	Array(size)
		.fill(0)
		.map(() => Math.floor(Math.random() * 36).toString(36))
		.join('');

export class FailProxyError extends Error {
	code: string;
	prop: string;

	constructor(message: string, code: string, prop: string) {
		super(message);
		this.code = code;
		this.prop = prop;
	}
}

/**
 * A read only proxy that informs the consumer about access to undefined/null
 * properties.
 */
export function makeUndefinedProxy(
	target: any,
	{onMissingProp}: {onMissingProp: (prop: string, value: undefined | null) => any}
) {
	function get(_: unknown, prop: string | symbol, receiver: any) {
		if (prop === 'toJSON') return target;
		if (typeof prop !== 'string') return;
		const value = target?.[prop];
		if (value == null) onMissingProp(prop, value);
		return value;
	}

	return new Proxy({}, {get}) as {[key: string]: unknown};
}

/**
 * Check if 2 paths lead to the same file.
 */
export function isSamePath(pathA: string, pathB: string) {
	if (isWindows) {
		pathA = pathA.toLowerCase();
		pathB = pathB.toLowerCase();
	}
	return normalizePath(pathA) === normalizePath(pathB);
}

export const normalizePath = (path: string) => Path.normalize(path.trim().replace(/[\\\/]+$/, ''));

/**
 * Removes characters not allowed in paths, and trims each file/dir name to
 * a reasonable length.
 */
export function sanitizePath(value: string, options: {maxLength?: number; replacement?: string} = {}) {
	const sourceParts = `${value}`.split(/\s*[\\\/]+\s*/);
	const resultParts: string[] = [];

	for (let i = 0; i < sourceParts.length; i++) {
		const part = sourceParts[i]!;

		// Special handling for path roots
		if (i === 0) {
			// Windows drive letter
			if (isWindows && part.match(/^\w+\:$/) != null) {
				resultParts.push(part);
				continue;
			}

			// Re-introduce root /
			if (part === '') {
				resultParts.push(Path.sep);
				continue;
			}
		}

		resultParts.push(filenamify(part, options));
	}

	return Path.join(...resultParts);
}

/**
 * Inserts text in currently active input/textarea element at cursor.
 */
export function insertAtCursor(text: string, input: Element | null = document.activeElement) {
	if (!isOfType<HTMLInputElement | HTMLTextAreaElement>(input, input != null && 'selectionStart' in input)) {
		return;
	}
	const [start, end] = [input.selectionStart, input.selectionEnd];
	if (start != null && end != null) input.setRangeText(text, start, end, 'end');
}

/**
 * Clamp number between specified limits.
 */
export function clamp(min: number, value: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

/**
 * Returns an ID of a passed event's modifiers combination.
 *
 * Example: `Alt+Shift`
 *
 * Modifiers are always in alphabetical order.
 */
export function idModifiers(event: Event) {
	return getModifiers(event).join('+');
}

function getModifiers(event: Event) {
	const modifiers: string[] = [];
	for (const name of ['alt', 'ctrl', 'meta', 'shift']) {
		if (event[`${name}Key` as unknown as keyof Event]) modifiers.push(name[0]!.toUpperCase() + name.slice(1));
	}
	return modifiers;
}

export function idKey(event: KeyboardEvent) {
	const parts = getModifiers(event);
	parts.push(event.key);
	return parts.join('+');
}

/**
 * Throttle / Debounce.
 */

type UnknownFn = (...args: any[]) => any;
export interface DTWrapper<T extends UnknownFn> {
	(...args: Parameters<T>): void;
	cancel: () => void;
	flush: () => void;
}

export function throttle<T extends UnknownFn>(fn: T, timeout: number = 100, noTrailing: boolean = false): DTWrapper<T> {
	let timeoutId: NodeJS.Timer | null;
	let args: any;
	let context: any;
	let last: number = 0;

	function call() {
		fn.apply(context, args);
		last = Date.now();
		timeoutId = context = args = null;
	}

	function throttled(this: any) {
		let delta = Date.now() - last;
		context = this;
		args = arguments;
		if (delta >= timeout) {
			throttled.cancel();
			call();
		} else if (!noTrailing && timeoutId == null) {
			timeoutId = setTimeout(call, timeout - delta);
		}
	}

	throttled.cancel = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	throttled.flush = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
			call();
		}
	};

	return throttled as DTWrapper<T>;
}

export function debounce<T extends UnknownFn>(fn: T, timeout: number = 100): DTWrapper<T> {
	let timeoutId: NodeJS.Timer | null;
	let args: any;
	let context: any;

	function call() {
		fn.apply(context, args);
		timeoutId = context = args = null;
	}

	function debounced(this: any) {
		context = this;
		args = arguments;
		if (timeoutId != null) clearTimeout(timeoutId);
		timeoutId = setTimeout(call, timeout);
	}

	debounced.cancel = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	debounced.flush = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
			call();
		}
	};

	return debounced as DTWrapper<T>;
}
