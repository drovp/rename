import {Plugin, PayloadData, OptionsSchema, makeAcceptsFlags, AppSettings} from '@drovp/types';

const isMac = process.platform === 'darwin';

type Options = {
	template: string;
	expandDirectories: boolean;
	sorting: 'disabled' | 'lexicographical' | 'natural';
	overwrite: boolean;
	preview: boolean;
	emit: boolean;
	onMissingMeta: 'abort' | 'skip' | 'ignore';
	replacement: string;
	maxLength: number;
};

const optionsSchema: OptionsSchema<Options> = [
	{
		name: 'template',
		type: 'string',
		default: '${basename}',
		title: 'Template',
		rows: 3,
		description: `A JavaScript template literal allowing embedded expressions. See <b>Instructions</b> tab above for detailed documentation and examples.`,
	},
	{
		name: 'expandDirectories',
		type: 'boolean',
		default: false,
		title: 'Expand directories',
		description: `Enable to rename files inside dropped directories instead of the directories themselves. Careful, directories are expanded recursively, so all files in the directory will be renamed, no matter how deep the directory tree goes.`,
	},
	{
		name: 'overwrite',
		type: 'boolean',
		default: false,
		title: 'Overwrite',
		description: `Overwrite potential destination files.<br>This doesn't apply to conflicts within the current batch. If template generates the same path for two or more files in the current batch, it's still considered an error, and renaming won't happen.`,
	},
	{
		name: 'preview',
		type: 'boolean',
		default: false,
		title: 'Preview',
		description: `Preview renaming before anything actually gets renamed. Can also be enabled by holding <kbd>${
			process.platform === 'darwin' ? 'Alt' : 'Ctrl'
		}</kbd> when dropping items into a profile.<br>
		Note: Going through preview enforces <b>On missing meta</b> option to <b>ignore</b>.`,
	},
	{
		name: 'sorting',
		type: 'select',
		default: 'disabled',
		options: ['disabled', 'lexicographical', 'natural'],
		title: 'Sorting',
		description: `Additionally sort dropped files with selected sorting algorithm.<br>
<b>disabled</b> - no sorting, rename files in an order the app received them<br>
<b>lexicographical</b> - ignores number values: <code>1,10,2,20,3</code><br>
<b>natural</b> - respects number values: <code>1,2,3,10,20</code><br>
`,
	},
	{
		name: 'onMissingMeta',
		type: 'select',
		default: 'abort',
		options: {
			abort: `Abort, don't rename anything`,
			skip: `Skip renaming metaless file`,
			ignore: `Ignore, leave values as undefined`,
		},
		title: 'On missing meta',
		description: `What to do when template requires file meta data, but it couldn't be retrieved for any of the files in the batch.<br>Note: When renaming through preview window, this options is forced to <b>ignore</b>, as you can see and approve the result.`,
	},
	{
		name: 'replacement',
		type: 'string',
		default: '!',
		title: 'Replacement',
		cols: 5,
		description: `Character(s) to use in place of filename incompatible ones.<br>On Unix-like systems, <code>/</code> is reserved. On Windows, <code>&lt;&gt;:"/\|?*</code> along with trailing periods are reserved.`,
	},
	{
		name: 'maxLength',
		type: 'number',
		default: 100,
		min: 1,
		max: 255,
		step: 1,
		title: 'Max length',
		description: `Max filename length. Extensions will be preserved when possible.<br>Systems generally allow up to 255 characters, but that is asking for trouble, especially on Windows.`,
	},
	{
		name: 'emit',
		type: 'boolean',
		default: false,
		title: 'Emit renamed files',
		description: `Emit renamed files as outputs. This will flood your output boxes on big batches.`,
	},
];

const acceptsFlags = makeAcceptsFlags<Options>()({
	files: true,
	directories: true,
});

export type Payload = PayloadData<Options, typeof acceptsFlags>;
export interface Dependencies {
	ffprobe: string;
}
export interface PreparatorPayload {
	payload: Payload;
	settings?: AppSettings;
	ffprobePath: string;
	dataPath: string;
}

export default (plugin: Plugin) => {
	plugin.registerProcessor<Payload>('rename', {
		main: 'dist/processor.js',
		description: 'Bulk rename files according to a configured template.',
		instructions: 'instructions.md',
		dependencies: ['@drovp/ffmpeg:ffprobe'],
		accepts: acceptsFlags,
		bulk: true,
		threadType: 'io',
		options: optionsSchema,
		modifierDescriptions: {
			[isMac ? 'Alt' : 'Ctrl']: `show preview/tweaking window before renaming`,
		},
		operationPreparator: async (payload, utils) => {
			if (payload.options.preview || (isMac ? ['alt', 'Alt'] : ['ctrl', 'Ctrl']).includes(utils.modifiers)) {
				const preparatorPayload: PreparatorPayload = {
					payload,
					settings: utils.settings,
					ffprobePath: utils.dependencies.ffprobe as string,
					dataPath: utils.dataPath,
				};
				const result = await utils.openModalWindow<Payload>(
					{path: './dist/preview.html', width: 600, height: 600, minWidth: 420, minHeight: 450},
					preparatorPayload
				);
				return result.canceled ? null : result.payload;
			} else {
				return payload;
			}
		},
		expandDirectory: (_, {expandDirectories}) => expandDirectories,
	});
};
