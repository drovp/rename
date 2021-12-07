import {promises as FSP} from 'fs';
import * as Path from 'path';

/**
 * Extract error message.
 */
export function eem(error: any, preferStack = false) {
	return error instanceof Error ? (preferStack ? error.stack || error.message : error.message) : `${error}`;
}

export function commonPathsRoot(a: string, b: string) {
	let sameParts: string[] = [];
	const aParts = a.split(/[\\\/]+/);
	const bParts = b.split(/[\\\/]+/);
	const loopSize = Math.min(aParts.length, bParts.length);

	for (let i = 0; i < loopSize; i++) {
		if (aParts[i] === bParts[i]) sameParts.push(aParts[i]!);
		else break;
	}

	return sameParts.join(Path.sep);
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
 * A read only proxy that takes over access to undnefined/null properties.
 */
export function makeUndefinedProxy(
	target: any,
	{onMissingProp}: {onMissingProp: (prop: string, value: undefined | null) => any}
) {
	function get(_: unknown, prop: string | symbol, receiver: any) {
		if (prop === 'toJSON') return target;
		if (typeof prop !== 'string') return;
		const value = target?.[prop];
		if (value == null) return onMissingProp(prop, value);
		return value;
	}

	return new Proxy({}, {get});
}
