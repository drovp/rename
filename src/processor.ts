import type {ProcessorUtils} from '@drovp/types';
import type {Payload} from './';
import {promises as FSP} from 'fs';
import * as Path from 'path';
import {eem, statIfExists, deletePath, uid} from './lib/utils';
import {RenameItem, createRenameTable} from './lib/rename';

type TmpRenameItem = RenameItem & {tmpPath: string};
const divider = '\n--------------------';

export default async (
	{id, inputs, options}: Payload,
	{output, dependencies, log}: ProcessorUtils<{ffprobe: string}>
) => {
	log(`Template:${divider}\n${options.template}${divider}`);

	const renameTable = await createRenameTable(inputs, options, {ffprobePath: dependencies.ffprobe});
	const {errors, existingPaths, commonInputDir} = renameTable;

	if (errors.length > 0) {
		const maxErrors = 10;
		let message = `${errors.length} error${errors.length > 1 ? 's' : ''}:\n\n`;
		message += errors
			.slice(0, maxErrors)
			.map(({inputPath, message}) => `→ "${inputPath}":${divider}\n${message?.message}`)
			.join('\n\n');
		if (errors.length > 10) message += `\n\n...truncated ${errors.length - maxErrors} more errors ...`;
		output.error(message);
		return;
	}

	// Actually rename files
	type RewindStep = {type: 'rename'; from: string; to: string} | {type: 'delete'; path: string};
	const rewindSteps: RewindStep[] = [];
	const toDeleteOnSuccess: string[] = [];
	const dirsToDeleteWhenEmpty = new Set<string>();

	try {
		const renameItems: TmpRenameItem[] = [];

		log(`Renaming files to temporary paths...`);

		for (const item of renameTable.items) {
			if (item.skip) continue;
			const tmpPath = `${item.inputPath}.tmp${id}`;
			await FSP.rename(item.inputPath, tmpPath);
			rewindSteps.push({type: 'rename', from: tmpPath, to: item.inputPath});
			renameItems.push({...item, tmpPath});
		}

		log(`Renaming files...${divider}`);

		for (const {inputPath, tmpPath, outputPath} of renameItems) {
			if (!outputPath) throw new Error(`Missing output path for file: "${inputPath}".`);

			log(` In: "${inputPath}"\nOut: "${outputPath}"${divider}`);

			// Add all folders from input path's directory to common input dir
			// to be deleted if they are empty after the rename.
			const commonTargetDiff = Path.dirname(inputPath)
				.slice(commonInputDir?.length || 0)
				.replace(/(^[\\\/]+)|([\\\/]+$)/, '');
			const commonTargetDirs = commonTargetDiff.split(/[\\\/]+/);
			for (let i = commonTargetDirs.length; i > 0; i--) {
				const path = Path.join(commonInputDir || '', ...commonTargetDirs.slice(0, i));
				dirsToDeleteWhenEmpty.add(path);
			}

			// Backup existing files so the operation can be rewound, and register them up for deletion
			if (existingPaths.includes(outputPath)) {
				const tmpPath = `${outputPath}.tmp${uid()}`;
				rewindSteps.push({type: 'rename', from: tmpPath, to: outputPath});
				await FSP.rename(outputPath, tmpPath);
				toDeleteOnSuccess.push(tmpPath);
			}

			// Ensure destination directory exists
			const outputPathDirname = Path.dirname(outputPath);
			let destinationDirStat = await statIfExists(outputPathDirname);

			// If destination directory exists, but is a file, either throw, or
			// recoverably delete it when overwrite is enabled.
			if (destinationDirStat?.isFile()) {
				if (options.overwrite) {
					const tmpOldOutputPathDirname = `${outputPathDirname}.tmp${uid()}`;
					rewindSteps.push({type: 'rename', from: tmpOldOutputPathDirname, to: outputPathDirname});
					await FSP.rename(outputPathDirname, tmpOldOutputPathDirname);
					toDeleteOnSuccess.push(tmpOldOutputPathDirname);
					destinationDirStat = undefined;
				} else {
					throw new Error(
						`Can't rename file:\n"${inputPath}"\nto:\n"${outputPath}"\nbecause destination directory is a file, and Overwrite option is disabled.`
					);
				}
			}

			if (!destinationDirStat) {
				await FSP.mkdir(outputPathDirname, {recursive: true});
				rewindSteps.push({type: 'delete', path: outputPathDirname});
			}

			// Attempt simple rename
			try {
				await FSP.rename(tmpPath, outputPath);
				rewindSteps.push({type: 'rename', from: outputPath, to: tmpPath});
			} catch (error) {
				if ((error as any)?.code !== 'EXDEV') throw error;

				// Fallback to moving for cross partition/drive renames
				rewindSteps.push({type: 'delete', path: outputPath});
				await FSP.cp(tmpPath, outputPath, {recursive: true});
				toDeleteOnSuccess.push(tmpPath);
			}
		}

		// When everything went well, clean up old files
		if (toDeleteOnSuccess.length > 0) {
			log(`Cleaning up ${toDeleteOnSuccess.length} old files...`);

			const failedCleanups: string[] = [];

			for (const path of toDeleteOnSuccess) {
				try {
					await deletePath(path);
				} catch (error) {
					failedCleanups.push(path);
					log(eem(error));
				}
			}

			// Inform about failed cleanups
			if (failedCleanups.length > 0) {
				output.warning(
					`Renaming went well, but these leftover files couldn't be deleted:\n${failedCleanups.join('\n')}`
				);
			}
		}

		// Cleanup now empty directories
		if (dirsToDeleteWhenEmpty.size > 0) {
			log(`Cleaning up potential empty directories:`);
			if (commonInputDir) dirsToDeleteWhenEmpty.add(commonInputDir);
			const dirsToDeleteWhenEmptyArray = [...dirsToDeleteWhenEmpty];

			// Sort paths from the longest to shortest, which ensures subdirectories get deleted before their parents
			dirsToDeleteWhenEmptyArray.sort((a, b) => (a.length < b.length ? 1 : a.length > b.length ? -1 : 0));

			log(dirsToDeleteWhenEmptyArray.map((path) => `→ "${path}"`).join('\n'));

			for (const path of dirsToDeleteWhenEmptyArray) {
				try {
					// Fails when directory is not empty
					await FSP.rmdir(path);
				} catch {}
			}
		}

		// Emit renamed files when requested
		if (options.emit) {
			log(`Emitting ${renameItems.length} files...`);
			for (const {outputPath} of renameItems) output.file(outputPath!);
		}
	} catch (error) {
		output.error(eem(error));

		// Rewind operations
		log(`Attempting to rewind operations...`);

		for (let i = rewindSteps.length - 1; i >= 0; i--) {
			const step = rewindSteps[i]!;
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
