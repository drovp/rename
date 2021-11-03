import {Plugin, PayloadData, OptionsSchema, makeAcceptsFlags} from '@drovp/types';

type Options = {
	template: string;
	expandDirectories: boolean;
	sorting: 'disabled' | 'lexicographical' | 'natural';
	overwrite: boolean;
	emit: boolean;
	onMissingMeta: 'abort' | 'skip' | 'ignore';
	simulate: boolean;
	verbose: boolean;
};

const optionsSchema: OptionsSchema<Options> = [
	{
		name: 'template',
		type: 'string',
		default: '${basename}',
		title: 'Template',
		rows: 3,
		description: `<p>A JavaScript template literal allowing embedded expressions. Example:<br><code>string \${expression} string</code><br>Relative paths are resolved from the file's current directory. New lines are removed before the template is used. See plugin's instructions for examples.</p>

<h5>Current file variables</h5>

<p>
<code>path</code> - full file/folder path → <code>/foo/bar/baz.jpg</code><br>
<code>basename</code> - file basename → <code>bar.jpg</code><br>
<code>filename</code> - file name without the extension → <code>bar</code><br>
<code>extname</code> - file extension with the dot → <code>.jpg</code><br>
<code>ext</code> - file extension without the dot → <code>jpg</code><br>
<code>dirname</code> - directory path → <code>/foo/bar</code><br>
<code>dirbasename</code> - name of a parent directory → <code>bar</code><br>
<code>size</code> - file size in bytes, 0 for folders<br>
<code>atime</code> - last access time in unix epoch milliseconds<br>
<code>mtime</code> - last modification time in unix epoch milliseconds<br>
<code>ctime</code> - last status change time (permission, rename, ...) in unix epoch milliseconds<br>
<code>birthtime</code> - file creation time in unix epoch milliseconds<br>
<code>isfile</code> - boolean if item is a file<br>
<code>isdirectory</code> - boolean if items is a directory<br>
<code>crc32/md5/sha1/sha256/sha512</code> - lowercase file checksums<br>
<code>CRC32/MD5/SHA1/SHA256/SHA512</code> - uppercase file checksums<br>
<code>i</code> - 0 based index in current batch<br>
<code>I</code> - automatically padded 0 based index in current batch *<br>
<code>n</code> - 1 based index in current batch<br>
<code>N</code> - automatically padded 1 based index in current batch *<br>
</p>

<em>* These number are automatically padded with zeroes when necessary. If batch is between 1-9 files, there's no padding, if batch is between 10-99 files, 0-9 numbers are padded with 1 zero, etc...</em>

<h5>Common variables</h5>

<code>commondir</code> - common directory of all dropped files in current batch<br>
<code>starttime</code> - time when renaming started in unix epoch milliseconds<br>
<code>tmp</code>, <code>home</code>, <code>downloads</code>, <code>documents</code>, <code>pictures</code>, <code>music</code>, <code>videos</code>, <code>desktop</code> - paths to platform folders<br>
<code>files</code> - an array of files in current batch, each item being an object with these properties:<br>

<pre><code>path</code>, <code>basename</code>, <code>filename</code>, <code>extname</code>, <code>ext</code>, <code>dirname</code>, <code>dirbasename</code>, <code>size</code>, <code>atime</code>, <code>mtime</code>, <code>ctime</code>, <code>birthtime</code>, <code>isFile</code>, <code>isDirectory</code></pre>

Access with <code>files[0].basename</code>.

<h5>Utilities</h5>

<code>Path</code> - Reference to <a href="https://nodejs.org/api/path.html">Node.js' <code>path</code> module</a>. Example: <code>Path.relative(foo, bar)</code><br>
<code>time()</code> - <a href="https://day.js.org/docs/en/display/format">day.js</a> constructor to help with time. Example: <code>time().format('YY')</code><br>
<code>uid(size? = 10)</code> - Unique string generator. Size argument is optional, default is 10. This is a way faster alternative to generating file checksums.<br>
`,
	},
	{
		name: 'expandDirectories',
		type: 'boolean',
		default: false,
		title: 'Expand directories',
		description: `Enable to rename files inside dropped directories instead of the directories themselves. Careful, directories are expanded recursively, so all files in the directory will be renamed, no matter how deep the directory tree goes.`,
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
		name: 'overwrite',
		type: 'boolean',
		default: false,
		title: 'Overwrite',
		description: `Overwrite potential destination files.<br>This doesn't apply to conflicts within the current batch. If template generates the same path for two or more files in the current batch, it's still considered an error, and renaming won't happen.`,
	},
	{
		name: 'onMissingMeta',
		type: 'select',
		default: 'disabled',
		options: {
			abort: `Abort, don't rename anything`,
			skip: `Skip renaming current file`,
			ignore: `Ignore, leave values as undefined`,
		},
		title: 'On missing meta',
		description: `What to do when template requires file meta data, but it couldn't be retrieved for any file in a batch.`,
	},
	{
		name: 'emit',
		type: 'boolean',
		default: false,
		title: 'Emit renamed files',
		description: `Emit renamed files as outputs. This will flood your output boxes on big batches.`,
	},
	{
		name: 'simulate',
		type: 'boolean',
		default: false,
		title: 'Simulate',
		description: `This will only log what renames would happen, but won't actually execute any file operations.`,
	},
	{
		name: 'verbose',
		type: 'boolean',
		default: false,
		title: 'Verbose',
		description: `Log every meta object and every rename that is happening, even when not simulating. Will absolutely flood your logs. Only use for debugging and inspecting meta data.`,
	},
];

const acceptsFlags = makeAcceptsFlags<Options>()({
	files: true,
	directories: true,
});

export type Payload = PayloadData<Options, typeof acceptsFlags>;

export default (plugin: Plugin) => {
	plugin.registerProcessor<Payload>('rename', {
		main: 'dist/processor.js',
		description: 'Bulk rename files according to a configured template.',
		dependencies: ['@drovp/ffmpeg:ffprobe'],
		accepts: acceptsFlags,
		bulk: true,
		threadType: 'io',
		options: optionsSchema,
		expandDirectory: (_, {expandDirectories}) => expandDirectories,
	});
};
