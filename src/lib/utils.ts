import * as FS from 'fs';
import * as Path from 'path';
import {createHash} from 'crypto';
import * as Stream from 'stream';

const {CRC32Stream} = require('crc32-stream'); // No types
const FSP = FS.promises;
const pipeline = Stream.promises.pipeline;

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

export async function checksumFile(
	hashName: 'crc32' | 'md5' | 'sha1' | 'sha256' | 'sha512',
	path: string
): Promise<string> {
	// CRC32 is not supported natively
	if (hashName === 'crc32') {
		const hash = new CRC32Stream();
		const pipe = pipeline(FS.createReadStream(path), hash);
		hash.resume();
		await pipe;
		hash.end();
		return hash.hex().toLowerCase();
	}

	const hash = createHash(hashName);
	await pipeline(FS.createReadStream(path), hash);
	hash.end();
	return hash.digest('hex');
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
	{
		onMissingProp,
		onMissingTarget,
	}: {onMissingProp: (prop: string, value: undefined | null) => any; onMissingTarget: () => any}
) {
	function get(_: unknown, prop: string | symbol, receiver: any) {
		if (prop === 'toJSON') return target;
		const value = target[prop];
		if (typeof prop !== 'string') return;
		if (target == null) return onMissingTarget();
		if (value == null) return onMissingProp(prop, value);
		return value;
	}

	return new Proxy({}, {get});
}
