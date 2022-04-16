import type {ProcessorUtils} from '@drovp/types';
import type {Payload} from './';
import {promises as FSP} from 'fs';
import * as Path from 'path';
import * as dayjs from 'dayjs';
import {platformPaths} from 'platform-paths';
import {
	eem,
	commonPathsRoot,
	pathExists,
	statIfExists,
	deletePath,
	uid,
	makeUndefinedProxy,
	isSamePath,
} from './lib/utils';
import {ffprobe, MetaData} from 'ffprobe-normalized';
import {checksumFile} from '@tomasklaen/checksum';
import {expandTemplateLiteral} from 'expand-template-literal';
import type Filenamify from 'filenamify';

const nativeImport = (name: string) => eval(`import('${name}')`);

type FileItem = {
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
	newPath?: string; // When missing, file rename will be skipped
	meta?: MetaData;
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
}

class SkipError extends Error {}

export default async (
	{
		inputs,
		options: {template, sorting, overwrite, emit, onMissingMeta, replacement, maxLength, simulate, verbose},
	}: Payload,
	{output, dependencies}: ProcessorUtils<{ffprobe: string}>
) => {
	// ESM dependencies
	const filenamify = (await nativeImport('filenamify')).default as typeof Filenamify;

	// Normalize template
	template = template.replace(/\r?\n/g, '').trim();

	// Build normalized files array
	const files: FileItem[] = [];

	for (const input of inputs) {
		const stat = await FSP.stat(input.path);
		const extname = Path.extname(input.path);
		const dirname = Path.dirname(input.path);
		files.push({
			path: input.path,
			basename: Path.basename(input.path),
			filename: Path.basename(input.path, extname),
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
		time: dayjs,
		uid,
	};

	// Platform paths
	for (const name of Object.keys(platformPaths) as (keyof typeof platformPaths)[]) {
		if (template.includes(name)) commonVariables[name] = await platformPaths[name]();
	}

	// Find common directory
	let commondir = files[0]!.dirname;
	for (let i = 1; i < files.length; i++) commondir = commonPathsRoot(commondir, files[i]!.path);
	commonVariables.commondir = commondir;

	console.log(`commondir: ${commondir}`);

	// Build renaming map
	const newPaths = new Map<string, FileItem>();
	const existingPaths = new Set<string>();
	const iPadSize = `${files.length - 1}`.length;
	const nPadSize = `${files.length}`.length;
	const lowercaseTemplate = template.toLowerCase();
	const extractMeta = /(^|\W)meta\s*(\.|\[)/.exec(template) != null;
	const hashesToSum = (['crc32', 'md5', 'sha1', 'sha256', 'sha512'] as const).filter((type) =>
		lowercaseTemplate.includes(type)
	);

	// Populate files with necessary data
	for (let i = 0; i < files.length; i++) {
		const file = files[i]!;
		const {path, isfile} = file;
		const n = i + 1;
		file.i = i;
		file.I = `${i}`.padStart(iPadSize, '0');
		file.n = n;
		file.N = `${n}`.padStart(nPadSize, '0');
		file.offsetI = (amount: number) => `${i + amount}`.padStart(`${files.length - 1 + amount}`.length, '0');
		file.offsetN = (amount: number) => `${n + amount}`.padStart(`${files.length + amount}`.length, '0');

		// Extract file meta
		if (extractMeta) {
			let meta: any = {};

			try {
				if (!isfile) {
					output.error(
						`Your template requests metadata, but you've dropped a directory into the profile without expand directories option enabled, and directories don't have meta data.`
					);
					return;
				}
				meta = await ffprobe(path, {path: dependencies.ffprobe});
			} catch (error) {
				switch (onMissingMeta) {
					case 'skip':
						console.log(`Skipping file "${path}" as its meta couldn't be retrieved: ${eem(error)}`);
						continue;
					case 'abort':
						output.error(`Meta couldn't be retrieved for file "${path}": ${eem(error)}`);
						return;
				}
			}

			if (verbose) console.log(`Meta for file "${path}":`, meta);

			file.meta =
				onMissingMeta === 'ignore'
					? meta
					: makeUndefinedProxy(meta, {
							onMissingProp: (prop) => {
								const ErrorType = onMissingMeta === 'skip' ? SkipError : Error;
								throw new ErrorType(`Meta property "${prop}" is missing.`);
							},
					  });
		}

		// Compute checksums
		if (isfile && hashesToSum.length > 0) {
			for (const type of hashesToSum) {
				const checksum = await checksumFile(path, type);
				file[type] = checksum;
				file[type.toUpperCase() as 'crc32'/*ugh*/] = checksum.toUpperCase();
			}
		}
	}

	// Expand templates
	for (let i = 0; i < files.length; i++) {
		const file = files[i]!;
		// Expose variables to template
		const {path, dirname} = file;
		const variables: Record<string, unknown> = {...commonVariables, ...file};

		// Expand the template and create new path
		let newName: string;
		try {
			newName = filenamify(expandTemplateLiteral(template, variables).trim(), {replacement, maxLength: Infinity});
			// TODO: use filenamify maxLength when this gets merged: https://github.com/sindresorhus/filenamify/pull/30
			if (newName.length > maxLength) {
				const extensionIndex = newName.lastIndexOf('.');
				const filename = extensionIndex > -1 ? newName.slice(0, extensionIndex) : newName;
				const extension = extensionIndex > -1 ? newName.slice(extensionIndex) : '';
				newName =
					extension.length >= maxLength
						? newName.slice(0, maxLength)
						: filename.slice(0, Math.max(1, Math.min(maxLength - extension.length, filename.length))) +
						  extension;
			}
		} catch (error) {
			if (error instanceof SkipError) {
				console.log(`Skipping file "${path}": ${error.message}`);
				continue;
			}
			output.error(`Template expansion error: ${eem(error)}`);
			return;
		}
		const newPath = Path.resolve(dirname, newName);

		// File conflict within new file paths
		if (newPaths.has(newPath)) {
			const conflictFile = newPaths.get(newPath)!;
			output.error(
				`Template would cause these paths:\n\n"${path}"\n"${conflictFile.path}"\n\nto be renamed to a same path:\n\n"${newPath}"`
			);
			return;
		}

		// File conflict with existing files
		if (!isSamePath(path, newPath) && (await pathExists(newPath))) {
			existingPaths.add(newPath);
			if (!overwrite) {
				output.error(
					`Path:\n\n"${path}"\n\nwould be renamed to:\n\n"${newPath}"\n\nbut this path already exists.`
				);
				return;
			} else if (files.find((file) => file.path === newPath)) {
				output.error(
					`Path:\n\n"${path}"\n\nwould be renamed to:\n\n"${newPath}"\n\nwhich matches current path of one of the other files in batch.`
				);
				return;
			}
		}

		file.newPath = newPath;
		newPaths.set(newPath, file);
	}

	// Actually rename files
	type RewindStep = {type: 'rename'; from: string; to: string} | {type: 'delete'; path: string};
	const rewindSteps: RewindStep[] = [];
	const toDeleteOnSuccess: string[] = [];
	const dirsToDeleteWhenEmpty = new Set<string>();

	try {
		console.log(`Renaming files${simulate ? ' (simulation)' : ''}...`);

		for (const {path, newPath} of files) {
			if (!newPath) continue; // Missing newPath means renaming this file should be skipped
			if (simulate || verbose) console.log(`-- Renaming: -------\nFrom: "${path}"\n  To: "${newPath}"`);
			if (simulate) continue;

			dirsToDeleteWhenEmpty.add(Path.dirname(path));

			// Backup existing files so the operation can be rewound, and register them up for deletion
			if (existingPaths.has(newPath)) {
				const tmpPath = `${newPath}.tmp${uid()}`;
				rewindSteps.unshift({type: 'rename', from: tmpPath, to: newPath});
				await FSP.rename(newPath, tmpPath);
				toDeleteOnSuccess.push(tmpPath);
			}

			// Ensure destination directory exists
			const newPathDirname = Path.dirname(newPath);
			let destinationDirStat = await statIfExists(newPathDirname);

			// If destination directory exists, but is a file, either throw, or
			// recoverably delete it when overwrite is enabled.
			if (destinationDirStat?.isFile()) {
				if (overwrite) {
					const tmpOldNewPathDirname = `${newPathDirname}.tmp${uid()}`;
					rewindSteps.unshift({type: 'rename', from: tmpOldNewPathDirname, to: newPathDirname});
					await FSP.rename(newPathDirname, tmpOldNewPathDirname);
					toDeleteOnSuccess.push(tmpOldNewPathDirname);
					destinationDirStat = undefined;
				} else {
					throw new Error(
						`Can't rename file:\n"${path}"\nto:\n"${newPath}"\nbecause destination directory is a file, and Overwrite option is disabled.`
					);
				}
			}

			if (!destinationDirStat) {
				await FSP.mkdir(newPathDirname, {recursive: true});
				rewindSteps.unshift({type: 'delete', path: newPathDirname});
			}

			// Attempt simple rename
			try {
				await FSP.rename(path, newPath);
				rewindSteps.unshift({type: 'rename', from: newPath, to: path});
			} catch (error) {
				if ((error as any)?.code !== 'EXDEV') throw error;

				// Fallback to moving for cross partition/drive renames
				rewindSteps.unshift({type: 'delete', path: newPath});
				await FSP.cp(path, newPath, {recursive: true});
				toDeleteOnSuccess.push(path);
			}
		}

		if (simulate || verbose) console.log('--------------------');

		// When everything went well, clean up old files
		if (toDeleteOnSuccess.length > 0) {
			console.log(`Cleaning up ${toDeleteOnSuccess.length} old files...`);

			const failedCleanups: string[] = [];

			for (const path of toDeleteOnSuccess) {
				try {
					await deletePath(path);
				} catch (error) {
					failedCleanups.push(path);
					console.log(eem(error));
				}
			}

			// Inform about failed cleanups
			if (failedCleanups.length > 0) {
				output.warning(
					`Renaming went well, but these leftover files coulnd't be deleted:\n${failedCleanups.join('\n')}`
				);
			}
		}

		// Cleanup now empty directories
		if (dirsToDeleteWhenEmpty.size > 0) {
			console.log(`Cleaning up potential empty directories...`);
			dirsToDeleteWhenEmpty.add(commondir);
			const dirsToDeleteWhenEmptyArray = [...dirsToDeleteWhenEmpty];

			// Sort paths from the longest to shortest, which ensures subdirectories get deleted before their parents
			dirsToDeleteWhenEmptyArray.sort((a, b) => (a.length < b.length ? 1 : a.length > b.length ? -1 : 0));

			for (const path of dirsToDeleteWhenEmptyArray) {
				try {
					// Fails when directory is not empty
					await FSP.rmdir(path);
				} catch {}
			}
		}

		// Emit renamed files when requested
		if (emit) {
			for (const {newPath} of files) output.file(newPath!);
		}
	} catch (error) {
		output.error(eem(error));

		// Rewind operations
		console.log(`Attempting to rewind operations...`);

		for (const step of rewindSteps) {
			switch (step.type) {
				case 'rename':
					await FSP.mkdir(Path.dirname(step.to), {recursive: true});
					await FSP.rename(step.from, step.to);
					break;

				case 'delete':
					await deletePath(step.path);
					break;
			}
		}
	}
};
