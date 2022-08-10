import {Payload} from '../';
import {promises as FSP} from 'fs';
import {cpus} from 'os';
import * as Path from 'path';
import dayjs from 'dayjs';
import {platformPaths} from 'platform-paths';
import {
	eem,
	findCommonDirectory,
	pathExists,
	normalizePath,
	uid,
	makeUndefinedProxy,
	isSamePath,
	sanitizePath,
} from './utils';
import {ffprobe} from 'ffprobe-normalized';
import {checksumFile} from '@tomasklaen/checksum';
import {expandTemplateLiteral} from 'expand-template-literal';
import pAll from 'p-all';

const CPUS = cpus().length;

type Meta = {[key: string]: unknown};
type InternalFile = {
	skip: boolean;
	path: string;
	basename: string;
	filename: string;
	extname: string;
	ext: string;
	dirname: string;
	dirbasename: string;
	size: number;
	atime: number;
	mtime: number;
	ctime: number;
	birthtime: number;
	isfile: boolean;
	isdirectory: boolean;
	rawMeta?: Meta;
	meta?: Meta;
	crc32?: string;
	md5?: string;
	sha1?: string;
	sha256?: string;
	sha512?: string;
	CRC32?: string;
	MD5?: string;
	SHA1?: string;
	SHA256?: string;
	SHA512?: string;
	i?: number;
	I?: string;
	n?: number;
	N?: string;
	offsetI?: (amount: number) => string;
	offsetN?: (amount: number) => string;
	padI?: (length: number, padString?: string) => string;
	padN?: (length: number, padString?: string) => string;
	pad?: (value: any, length: number, padString?: string) => string;
};

export interface RenameItem {
	inputPath: string;
	outputPath?: string; // Can be missing when skipping
	skip: boolean;
	message?: Message;
	meta?: Meta;
}

export interface Message {
	variant: 'warning' | 'danger';
	message: string;
}

export interface RenameTable {
	items: RenameItem[];
	warnings: RenameItem[];
	errors: RenameItem[];
	commonInputDir: string | null;
	commonOutputDir: string | null;
	commonDir: string | null;
	existingPaths: string[];
}

export async function createRenameTable(
	inputs: Payload['inputs'],
	{template, sorting, overwrite, onMissingMeta, replacement, maxLength}: Payload['options'],
	{ffprobePath, onProgress}: {ffprobePath: string; onProgress?: (progress: number) => void}
): Promise<RenameTable> {
	// Normalize template
	template = template.replace(/\r?\n/g, '').trim();

	// Build normalized files array
	const files: InternalFile[] = [];
	const renameItems: RenameItem[] = [];
	const errors: RenameItem[] = [];
	const warnings: RenameItem[] = [];

	for (const input of inputs) {
		const inputPath = normalizePath(input.path);
		const stat = await FSP.stat(inputPath);
		const extname = Path.extname(inputPath);
		const dirname = Path.dirname(inputPath);
		files.push({
			skip: false,
			path: inputPath,
			basename: Path.basename(inputPath),
			filename: Path.basename(inputPath, extname),
			extname,
			ext: extname[0] === '.' ? extname.slice(1) : extname,
			dirname,
			dirbasename: Path.basename(dirname),
			size: stat.size,
			atime: stat.atimeMs,
			mtime: stat.mtimeMs,
			ctime: stat.ctimeMs,
			birthtime: stat.birthtimeMs,
			isfile: stat.isFile(),
			isdirectory: stat.isDirectory(),
		});
	}

	// Sort files
	switch (sorting) {
		case 'lexicographical': {
			const collator = new Intl.Collator();
			files.sort((a, b) => collator.compare(a.path, b.path));
			break;
		}

		case 'natural': {
			const collator = new Intl.Collator(undefined, {numeric: true});
			files.sort((a, b) => collator.compare(a.path, b.path));
			break;
		}
	}

	// Declare common variables
	const commonVariables: Record<string, any> = {
		// Data
		starttime: Date.now(),
		files,

		// Utilities
		Path,
		Time: dayjs,
		uid,
	};

	// Platform paths
	for (const name of Object.keys(platformPaths) as (keyof typeof platformPaths)[]) {
		if (template.includes(name)) commonVariables[name] = await platformPaths[name]();
	}

	// Find common directory
	let commonInputDir = findCommonDirectory(files, (file) => file.path);
	commonVariables.commondir = commonInputDir;

	// Build renaming map
	const oldPaths = new Set(files.map((file) => file.path));
	const filesByNewPath = new Map<string, InternalFile>();
	const existingPaths = new Set<string>();
	const iPadSize = `${files.length - 1}`.length;
	const nPadSize = `${files.length}`.length;
	const lowercaseTemplate = template.toLowerCase();
	const extractMeta = /(^|\W)meta\s*(\.|\[)/.exec(template) != null;
	const hashesToSum = (['crc32', 'md5', 'sha1', 'sha256', 'sha512'] as const).filter((type) =>
		lowercaseTemplate.includes(type)
	);

	// This is called when missing meta property is accessed
	let onMissingProp: (name: string) => void = () => {};

	// Populate files with necessary data
	const metaPromises: (() => Promise<void>)[] = [];
	let completed = 0;
	for (let i = 0; i < files.length; i++) {
		const file = files[i]!;
		const {path, isfile} = file;
		const n = i + 1;
		file.i = i;
		file.I = `${i}`.padStart(iPadSize, '0');
		file.n = n;
		file.N = `${n}`.padStart(nPadSize, '0');
		file.pad = (value: unknown, length: number, padString = '0') => `${value}`.padStart(length, padString);

		// Queue meta data retrieval in async-concurrent manner
		metaPromises.push(async () => {
			// Extract file meta
			if (extractMeta) {
				let meta: any = {};

				try {
					if (!isfile) {
						throw new Error(
							`Your template requests metadata, but you've dropped a directory into the profile without expand directories option enabled, and directories don't have meta data.`
						);
					}
					meta = await ffprobe(path, {path: ffprobePath});
				} catch (error) {
					if (onMissingMeta === 'abort') {
						throw new Error(`Meta couldn't be retrieved for file "${path}": ${eem(error)}`);
					}
				}

				file.rawMeta = meta;
				file.meta = makeUndefinedProxy(meta, {onMissingProp: (prop) => onMissingProp(prop)});
			}

			// Compute checksums
			if (isfile && hashesToSum.length > 0) {
				for (const type of hashesToSum) {
					const checksum = await checksumFile(path, type);
					file[type] = checksum;
					file[type.toUpperCase() as 'crc32' /*ugh*/] = checksum.toUpperCase();
				}
			}

			// Update progress here, since this is the slowest possible operation
			onProgress?.(++completed / files.length);
		});
	}

	await pAll(metaPromises, {concurrency: Math.max(1, Math.floor(CPUS * 0.8))});

	// Expand templates
	for (let i = 0; i < files.length; i++) {
		const file = files[i]!;
		// Expose variables to template
		const {path, dirname} = file;
		const variables: Record<string, unknown> = {...commonVariables, ...file};
		const renameItem: RenameItem = {skip: false, inputPath: path, meta: file.rawMeta};
		renameItems.push(renameItem);

		// Expand the template and create new path
		let newName: string;
		try {
			let accessedMissingProps: string[] = [];
			onMissingProp = (prop) => accessedMissingProps.push(prop);
			newName = expandTemplateLiteral(template, variables).trim();

			// What to do when template accesses a missing meta property
			if (accessedMissingProps.length > 0) {
				const message = `Missing meta: ${accessedMissingProps.join(', ')}`;
				switch (onMissingMeta) {
					case 'abort':
						renameItem.skip = true;
						renameItem.message = {variant: 'danger', message};
						errors.push(renameItem);
						break;

					// Fallthrough on purpose
					case 'skip':
						renameItem.skip = true;

					default:
						renameItem.message = {variant: 'warning', message};
						warnings.push(renameItem);
				}
			}
		} catch (error) {
			throw new Error(`Template expansion error: ${eem(error)}`);
		}
		const newPath = sanitizePath(Path.resolve(dirname, newName), {replacement, maxLength});

		renameItem.outputPath = newPath;

		// File conflict within new file paths
		const conflictFile = filesByNewPath.get(newPath);
		if (conflictFile) {
			renameItem.skip = true;
			renameItem.message = {
				variant: 'danger',
				// Append potential warning from above
				message: `${
					renameItem.message ? `${renameItem.message.message}\n\n` : ''
				}Template would cause these paths:\n\n"${path}"\n"${
					conflictFile.path
				}"\n\nto be renamed to a same path:\n\n"${newPath}"`,
			};
			errors.push(renameItem);
			continue;
		}

		filesByNewPath.set(newPath, file);

		// File conflict with existing files
		// We don't care if:
		// - overwrite is enabled
		// - the new path matches the original path
		// - the new path matches original path of any of the input files
		if (!overwrite && !isSamePath(path, newPath) && !oldPaths.has(newPath) && (await pathExists(newPath))) {
			existingPaths.add(newPath);
			renameItem.skip = true;
			renameItem.message = {
				variant: 'danger',
				message: `Path:\n\n"${path}"\n\nwould be renamed to:\n\n"${newPath}"\n\nbut this path already exists.`,
			};
			errors.push(renameItem);
		}
	}

	const commonOutputDir = findCommonDirectory(
		renameItems.map((item) => item.outputPath).filter((path) => !!path) as string[]
	);

	return {
		items: renameItems,
		commonInputDir,
		commonOutputDir,
		commonDir:
			commonInputDir && commonOutputDir
				? findCommonDirectory([Path.join(commonInputDir, 'noop'), Path.join(commonOutputDir, 'noop')])
				: null,
		warnings,
		errors,
		existingPaths: [...existingPaths],
	};
}
