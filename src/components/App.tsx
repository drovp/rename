import {promises as FSP} from 'fs';
import {h} from 'preact';
import {marked} from 'marked';
import {useState, useEffect, useRef, Ref} from 'preact/hooks';
import type {PreparatorPayload, Payload} from '../';
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
import {RenameTable, ItemsCategory, isItemsCategory} from 'components/RenameTable';
import {Tag} from 'components/Tag';

const CTRL_OR_CMD = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
const CTRL_OR_META = process.platform === 'darwin' ? 'Meta' : 'Ctrl';

type SectionName = ItemsCategory | 'instructions';

export function App({
	preparatorPayload,
	instructionsPath,
	onSubmit,
	onCancel,
}: {
	preparatorPayload: PreparatorPayload;
	instructionsPath: string;
	onSubmit: (payload: Payload) => void;
	onCancel: () => void;
}) {
	const {payload, ffprobePath} = preparatorPayload;
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const contentScrollerRef = useRef<Scroller | null>(null);
	const [section, setSection] = useState<SectionName>('items');
	const [lastItemsCategory, setLastItemsCategory] = useState<ItemsCategory>('items');
	const [renameTable, setRenameTable] = useState<RenameTableData | null>(null);
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

	function handleSubmit(template: string) {
		if (renameTable && !hasErrors) onSubmit({...payload, options: {...payload.options, template}});
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

			// Toggle help
			case `Alt+/`:
				if (isItemsCategory(section)) changeSection('instructions');
				else changeSection(lastItemsCategory);
				event.preventDefault();
				break;

			// Switch between item categories
			case `Alt+ArrowLeft`:
			case `Alt+ArrowRight`:
				if (renameTable) {
					const categories = ['items', 'warnings', 'errors', 'instructions'] as const;
					const currentIndex = categories.indexOf(section);
					const bumpedIndex = currentIndex + (keyId === `Alt+ArrowLeft` ? -1 : 1);
					const index = bumpedIndex < 0 ? categories.length + bumpedIndex : bumpedIndex % categories.length;
					changeSection(categories[index]!);
				}
				event.preventDefault();
				break;

			// Content navigation
			case `Alt+Home`:
			case `Alt+End`:
				scroller?.scrollTo({top: keyId === `Alt+End` ? Infinity : 0});
				event.preventDefault();
				break;

			case `Alt+PageUp`:
			case `Alt+PageDown`:
				if (scroller) {
					const height = scroller.element.clientHeight;
					const scrollAmount = Math.max(height * 0.8, height - 100);
					scroller.scrollBy({top: keyId === `Alt+PageUp` ? -scrollAmount : scrollAmount});
				}
				event.preventDefault();
				break;

			case `Alt+ArrowUp`:
			case `Alt+ArrowDown`:
				if (scroller && !event.repeat) {
					const amount = keyId === `Alt+ArrowUp` ? -600 : 600;
					scroller.glide({top: amount});
					addEventListener('keyup', scroller.stop, {once: true});
				}
				event.preventDefault();
				break;
		}

		// Refocus textarea when normal key is pressed while it's not already focused
		if (modifiers === '' && event.key.length === 1 && document.activeElement !== textareaRef.current) {
			textareaRef.current?.focus();
			event.preventDefault();
		}
	});

	return (
		<div class="App">
			<TemplateControls
				template={payload.options.template}
				textareaRef={textareaRef}
				isRenameTableLoading={isRenameTableLoading}
				onUpdate={updateRenameTable}
				onSubmit={handleSubmit}
				hasErrors={hasErrors}
			/>

			<nav>
				{isRenameTableLoading ? (
					<em>Building rename table...</em>
				) : (
					<Select
						class="categories"
						transparent
						value={section}
						onChange={(category) => changeSection(category as ItemsCategory)}
					>
						<SelectOption value="items">
							All {renameTable && <Tag>{renameTable.items.length}</Tag>}
						</SelectOption>
						<SelectOption
							value="warnings"
							variant={renameTable?.warnings.length !== 0 ? 'warning' : undefined}
						>
							Warnings {renameTable && <Tag>{renameTable.warnings.length}</Tag>}
						</SelectOption>
						<SelectOption value="errors" variant={renameTable?.errors.length !== 0 ? 'danger' : undefined}>
							Errors {renameTable && <Tag>{renameTable.errors.length}</Tag>}
						</SelectOption>
					</Select>
				)}

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
	template: passedTemplate,
	onUpdate,
	onSubmit,
	isRenameTableLoading,
	hasErrors,
}: {
	template: string;
	textareaRef: Ref<HTMLTextAreaElement | null>;
	isRenameTableLoading: boolean;
	onUpdate: (template: string) => void;
	onSubmit: (template: string) => void;
	hasErrors: boolean;
}) {
	const controlsRef = useRef<HTMLDivElement>(null);
	textareaRef = textareaRef || useRef<HTMLTextAreaElement>(null);
	const [, controlsHeight] = useElementSize(controlsRef);
	const [template, setTemplate] = useState(passedTemplate);

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
				onChange={setTemplate}
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
