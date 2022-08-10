import {promises as FSP} from 'fs';
import {h} from 'preact';
import {marked} from 'marked';
import {useState, useEffect, useRef, Ref} from 'preact/hooks';
import type {PreparatorPayload, Payload} from '../';
import {HISTORY_SIZE} from 'config';
import {RenameTable as RenameTableData, createRenameTable} from 'lib/rename';
import {eem, idKey, idModifiers} from 'lib/utils';
import {makeScroller, Scroller} from 'element-scroller';
import {useEventListener, useElementSize, useScrollPosition, useCachedState} from 'lib/hooks';
import {Textarea} from 'components/Textarea';
import {Button} from 'components/Button';
import {Select, SelectOption} from 'components/Select';
import {Spinner} from 'components/Spinner';
import {Icon, Help} from 'components/Icon';
import {Vacant} from 'components/Vacant';
import {Scrollable} from 'components/Scrollable';
import {History} from 'components/History';
import {RenameTable, ItemsCategory, isItemsCategory} from 'components/RenameTable';
import {Tag} from 'components/Tag';

const CTRL_OR_CMD = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
const CTRL_OR_META = process.platform === 'darwin' ? 'Meta' : 'Ctrl';

type SectionName = ItemsCategory | 'history' | 'instructions';

export function App({
	preparatorPayload,
	instructionsPath,
	historyPath,
	onSubmit,
	onCancel,
}: {
	preparatorPayload: PreparatorPayload;
	instructionsPath: string;
	historyPath: string;
	onSubmit: (payload: Payload) => void;
	onCancel: () => void;
}) {
	const {payload, ffprobePath} = preparatorPayload;
	const [template, setTemplate] = useState(payload.options.template);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const contentScrollerRef = useRef<Scroller | null>(null);
	const [section, setSection] = useState<SectionName>('items');
	const [lastItemsCategory, setLastItemsCategory] = useState<ItemsCategory>('items');
	const [renameTable, setRenameTable] = useState<RenameTableData | null>(null);
	const [history, setHistory] = useState<string[]>([]);
	const [isRenameTableLoading, setIsRenameTableLoading] = useState(false);
	const [renameProgress, setRenameProgress] = useState(0);
	const [renameError, setRenameError] = useState<string | null>(null);
	const hasErrors = renameTable != null && renameTable.errors.length > 0;

	// Enforce some options
	payload.options.onMissingMeta = 'ignore';

	async function updateRenameTable(template: string) {
		const {inputs, options} = payload;
		setIsRenameTableLoading(true);
		setRenameProgress(0);
		setRenameError(null);
		setSection('items');
		try {
			const table = await createRenameTable(
				inputs,
				{...options, template},
				{ffprobePath, onProgress: setRenameProgress}
			);
			setRenameTable(table);
		} catch (error) {
			setRenameTable(null);
			setRenameError(eem(error));
		} finally {
			setIsRenameTableLoading(false);
		}
	}

	function changeSection(name: SectionName) {
		if (isItemsCategory(name)) setLastItemsCategory(name);
		setSection(name);
	}

	function selectHistory(value: string) {
		// Simulate immediate input so that textarea resizes itself properly
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.focus();
			textarea.value = value;
			textarea.dispatchEvent(new Event('input'));
		}

		setTemplate(value);
		changeSection('items');
		updateRenameTable(value);
	}

	async function handleSubmit(template: string) {
		if (!renameTable || hasErrors) return;

		const oldTemplate = payload.options.template;
		const newTemplate = template.trim();
		if (newTemplate !== oldTemplate) {
			let newHistory = [newTemplate, ...history.filter((template) => template !== newTemplate)].slice(
				0,
				HISTORY_SIZE
			);
			const historyJson = JSON.stringify(newHistory, null, 2);
			try {
				await FSP.writeFile(historyPath, historyJson);
			} catch (error) {
				console.error(`Couldn't save history file "${historyPath}".`, error);
			}
		}
		onSubmit({...payload, options: {...payload.options, template}});
	}

	// Update content scroller
	useEffect(() => {
		contentScrollerRef.current?.dispose();
		contentScrollerRef.current = contentRef.current ? makeScroller(contentRef.current, {handleWheel: true}) : null;
	}, [section, isRenameTableLoading, renameError]);

	// Initial load
	useEffect(() => {
		updateRenameTable(payload.options.template);
		textareaRef.current?.focus();

		// Load history
		(async () => {
			try {
				const json = await FSP.readFile(historyPath, {encoding: 'utf-8'});
				const data = JSON.parse(json);
				// Validate
				if (Array.isArray(data) && data.findIndex((item) => typeof item !== 'string') === -1) {
					setHistory(data);
				}
			} catch (error) {
				if ((error as any)?.code !== 'ENOENT') {
					console.error('Error loading history file:', historyPath, error);
				}
			}
		})();
	}, []);

	useEventListener<KeyboardEvent>('keydown', (event) => {
		const scroller = contentScrollerRef.current;
		const keyId = idKey(event);
		const modifiers = idModifiers(event);

		switch (keyId) {
			// Cancel
			case `${CTRL_OR_META}+Escape`:
				onCancel();
				break;

			// Toggle history
			case `Alt+h`:
				event.preventDefault();
				if (section !== 'history') changeSection('history');
				else changeSection(lastItemsCategory);
				break;

			// Toggle help
			case `Alt+/`:
				event.preventDefault();
				if (section !== 'instructions') changeSection('instructions');
				else changeSection(lastItemsCategory);
				break;

			// Switch between item categories
			case `Alt+ArrowLeft`:
			case `Alt+ArrowRight`:
				event.preventDefault();
				if (renameTable) {
					const categories = ['items', 'warnings', 'errors', 'history', 'instructions'] as const;
					const currentIndex = categories.indexOf(section);
					const bumpedIndex = currentIndex + (keyId === `Alt+ArrowLeft` ? -1 : 1);
					const index = bumpedIndex < 0 ? categories.length + bumpedIndex : bumpedIndex % categories.length;
					changeSection(categories[index]!);
				}
				break;

			// Content navigation
			case `Alt+Home`:
			case `Alt+End`:
				event.preventDefault();
				scroller?.scrollTo({top: keyId === `Alt+End` ? Infinity : 0});
				break;

			case `Alt+PageUp`:
			case `Alt+PageDown`:
				event.preventDefault();
				if (scroller) {
					const height = scroller.element.clientHeight;
					const scrollAmount = Math.max(height * 0.8, height - 100);
					scroller.scrollBy({top: keyId === `Alt+PageUp` ? -scrollAmount : scrollAmount});
				}
				break;

			case `Alt+ArrowUp`:
			case `Alt+ArrowDown`:
				event.preventDefault();
				if (scroller && !event.repeat) {
					const amount = keyId === `Alt+ArrowUp` ? -600 : 600;
					scroller.glide({top: amount});
					addEventListener('keyup', scroller.stop, {once: true});
				}
				break;
		}

		// Refocus textarea when normal key is pressed while it's not already focused
		if (modifiers === '' && event.key.length === 1 && document.activeElement !== textareaRef.current) {
			event.preventDefault();
			textareaRef.current?.focus();
		}
	});

	return (
		<div class="App">
			<TemplateControls
				template={template}
				textareaRef={textareaRef}
				isRenameTableLoading={isRenameTableLoading}
				onChange={setTemplate}
				onUpdate={updateRenameTable}
				onSubmit={handleSubmit}
				hasErrors={hasErrors}
			/>

			<nav>
				<Select
					class="categories"
					transparent
					value={section}
					onChange={(category) => changeSection(category as ItemsCategory)}
				>
					<SelectOption value="items">
						All {renameTable && <Tag>{renameTable.items.length}</Tag>}
					</SelectOption>
					<SelectOption value="warnings" variant={renameTable?.warnings.length !== 0 ? 'warning' : undefined}>
						Warnings {renameTable && <Tag>{renameTable.warnings.length}</Tag>}
					</SelectOption>
					<SelectOption value="errors" variant={renameTable?.errors.length !== 0 ? 'danger' : undefined}>
						Errors {renameTable && <Tag>{renameTable.errors.length}</Tag>}
					</SelectOption>
				</Select>

				<Help
					tooltip={`Shortcuts:
Alt+/: toggle instructions
Alt+←/→: cycle between sections
Alt+↑/↓: hold to scroll up/down
Alt+PgUp/PgDown: page up/down
Alt+Home/End: top top/bottom
${CTRL_OR_CMD}+Escape: cancel/close window`}
				/>

				<Select transparent value={section} onChange={(category) => changeSection(category as SectionName)}>
					<SelectOption value="history" tooltip="History of custom templates used">
						<Icon name="history" /> History
					</SelectOption>
					<SelectOption value="instructions">
						<Icon name="article" /> Instructions
					</SelectOption>
				</Select>
			</nav>

			{section === 'instructions' ? (
				<MarkdownFile
					key={section}
					innerRef={contentRef}
					class="Instructions"
					path={instructionsPath}
					scrollPositionId="instructions"
				/>
			) : section === 'history' ? (
				<History key={section} history={history} onSelect={selectHistory} />
			) : isRenameTableLoading ? (
				<div key="loading" class="loading">
					<div class="progress">{Math.round(renameProgress * 100)}%</div>
					<Spinner />
				</div>
			) : renameError ? (
				<Vacant key="vacant" variant="danger" title="Error" details={renameError} />
			) : renameTable ? (
				<RenameTable
					key={section}
					innerRef={contentRef}
					data={renameTable}
					category={section}
					scrollPositionId={`RenameTable.${section}`}
				/>
			) : (
				<Vacant key="vacant" variant="danger" title="Error">
					RenameTable is {`${renameTable}`}.
				</Vacant>
			)}
		</div>
	);
}

function TemplateControls({
	textareaRef,
	template,
	onChange,
	onUpdate,
	onSubmit,
	isRenameTableLoading,
	hasErrors,
}: {
	template: string;
	textareaRef: Ref<HTMLTextAreaElement | null>;
	isRenameTableLoading: boolean;
	onChange: (template: string) => void;
	onUpdate: (template: string) => void;
	onSubmit: (template: string) => void;
	hasErrors: boolean;
}) {
	const controlsRef = useRef<HTMLDivElement>(null);
	textareaRef = textareaRef || useRef<HTMLTextAreaElement>(null);
	const [, controlsHeight] = useElementSize(controlsRef);

	useEventListener<KeyboardEvent>('keydown', (event) => {
		switch (idKey(event)) {
			// Update preview
			case 'Shift+Enter':
				onUpdate(template);
				event.preventDefault();
				break;

			// Submit
			case `${CTRL_OR_META}+Enter`:
				if (!isRenameTableLoading && !hasErrors) onSubmit(template);
				event.preventDefault();
				break;
		}
	});

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	return (
		<div class="TemplateControls" ref={controlsRef}>
			<Textarea
				innerRef={textareaRef}
				rows={2}
				transparent
				resizable
				autoResize
				value={template}
				onChange={onChange}
			/>
			<div class={`actions${controlsHeight && controlsHeight > 110 ? ' -column' : ''}`}>
				<Button
					variant="info"
					loading={isRenameTableLoading}
					disabled={isRenameTableLoading}
					tooltip="Update preview table"
					onClick={() => onUpdate(template)}
				>
					<div class="buttonTitle">
						<span>Preview</span>
						<kbd>Shift+Enter</kbd>
					</div>
				</Button>
				<Button
					variant={hasErrors ? 'danger' : 'success'}
					disabled={isRenameTableLoading || hasErrors}
					onClick={() => onSubmit(template)}
					tooltip={hasErrors ? `There are some errors` : `Close the window and rename files`}
				>
					<div class="buttonTitle">
						<span>Rename</span>
						<kbd>{CTRL_OR_CMD}+Enter</kbd>
					</div>
				</Button>
			</div>
		</div>
	);
}

function MarkdownFile({
	path,
	innerRef,
	class: className,
	scrollPositionId,
}: {
	path: string;
	innerRef?: Ref<HTMLDivElement>;
	class?: string;
	scrollPositionId?: string;
}) {
	const containerRef = innerRef || useRef<HTMLDivElement>(null);
	const [contents, setContents] = useCachedState<string | null>(`MarkdownFile.${path}`, null);

	// Load instructions
	useEffect(() => {
		if (contents !== null) return;

		FSP.readFile(path, {encoding: 'utf-8'})
			.then((contents) => {
				setContents(marked.parse(contents));
			})
			.catch((error) => {
				setContents(`Couldn't load or parse instructions file.<br>Error: ${eem(error)}`);
			});
	}, []);

	if (scrollPositionId) useScrollPosition(scrollPositionId, containerRef);

	let classNames = `MarkdownFile TextContent`;
	if (className) classNames += ` ${className}`;

	return (
		<Scrollable
			innerRef={containerRef}
			class={classNames}
			dangerouslySetInnerHTML={{__html: contents === null ? 'Loading...' : contents}}
		/>
	);
}
