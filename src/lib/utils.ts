import {promises as FSP} from 'fs';
import * as Path from 'path';
import type Filenamify from 'filenamify';

let filenamify: typeof Filenamify | undefined;

const nativeImport = (name: string) => eval(`import('${name}')`);

const isWindows = process.platform === 'win32';

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
 * A read only proxy that takes over access to undefined/null properties.
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

const normalizePath = (path: string) => Path.normalize(path.trim().replace(/[\\\/]+$/, ''));

/**
 * Removes characters not allowed in paths, and trims each file/dir name to
 * a reasonable length.
 */
export async function sanitizePath(value: string, options: {maxLength?: number; replacement?: string} = {}) {
	if (!filenamify) filenamify = (await nativeImport('filenamify')).default as typeof Filenamify;

	const sourceParts = `${value}`.split(/\s*[\\\/]+\s*/);
	const resultParts: string[] = [];

	for (let i = 0; i < sourceParts.length; i++) {
		const part = sourceParts[i]!;

		// Drive letter
		if (i === 0 && part.match(/^\w+\:$/) != null) {
			resultParts.push(part);
			continue;
		}

		resultParts.push(filenamify(part, options));
	}

	return Path.join(...resultParts);
}
