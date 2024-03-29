import {clipboard} from 'electron';
import {openContextMenu} from '@drovp/utils/modal-window';
import {MenuItemConstructorOptions} from '@drovp/types';
import {h} from 'preact';
import {useRef, useState, useEffect, Ref} from 'preact/hooks';
import {RenameTable as RenameTableData, RenameItem as RenameItemData} from 'lib/rename';
import {clamp} from 'lib/utils';
import {VirtualList} from 'components/VirtualList';
import {Scrollable} from 'components/Scrollable';
import {Button} from 'components/Button';
import {Pre} from 'components/Pre';
import {Icon} from 'components/Icon';
import {openDialog} from 'components/Dialog';

const variantTypeTitle = {warning: 'Warning', danger: 'Error'};

export type ItemsCategory = 'items' | 'errors' | 'warnings';
export const ITEM_CATEGORIES: ItemsCategory[] = ['items', 'errors', 'warnings'];

export function isItemsCategory(name: any): name is ItemsCategory {
	return ITEM_CATEGORIES.includes(name);
}

export function RenameTable({
	innerRef,
	data,
	category = 'items',
	scrollPositionId,
}: {
	innerRef?: Ref<HTMLDivElement | null>;
	data: RenameTableData;
	category?: ItemsCategory;
	scrollPositionId?: string;
}) {
	const containerRef = innerRef || useRef<HTMLDivElement>(null);
	const [inputWidth, setInputWidth] = useState(0.5);

	useEffect(() => {
		const container = containerRef.current;

		if (!container) return;

		const initResize = (event: MouseEvent) => {
			if (!(event.target as HTMLElement)?.classList.contains('divider')) return;

			const containerRect = container.getBoundingClientRect();
			const handleMove = (event: MouseEvent) => {
				setInputWidth(clamp(0.1, (event.clientX - containerRect.left) / containerRect.width, 0.9));
			};
			const handleUp = () => {
				removeEventListener('mousemove', handleMove);
				removeEventListener('mouseup', handleUp);
			};

			addEventListener('mousemove', handleMove);
			addEventListener('mouseup', handleUp);
		};

		addEventListener('mousedown', initResize);

		return () => removeEventListener('mousedown', initResize);
	}, []);

	return (
		<VirtualList
			innerRef={containerRef}
			class="RenameTable"
			style={`--inputWidth:${inputWidth}`}
			items={data[category]}
			scrollPositionId={scrollPositionId}
			render={(item, index) => (
				<RenameItem class={index % 2 === 0 ? '-even' : '-odd'} key={item.inputPath} data={data} item={item} />
			)}
		/>
	);
}

export function RenameItem({
	item,
	data,
	class: className,
}: {
	class?: string;
	item: RenameItemData;
	data: RenameTableData;
}) {
	const {commonDir} = data;
	function showDialog(type: 'meta' | 'message') {
		openDialog({
			title: type === 'meta' ? 'File meta' : variantTypeTitle[item.message!.variant],
			align: type === 'meta' ? 'bottom' : 'center',
			content:
				type === 'meta' ? (
					item.meta ? (
						<MetaTable table={item.meta} />
					) : (
						<Pre>Meta is {`${item.meta}`}.</Pre>
					)
				) : (
					<Pre class="ItemMessage">{item.message?.message}</Pre>
				),
		});
	}

	function handleContext(event: Event) {
		event.preventDefault();

		// Main items
		const items: MenuItemConstructorOptions[] = [
			{label: `Copy input path`, click: () => clipboard.writeText(item.inputPath)},
		];
		if (item.outputPath) {
			items.push({label: `Copy output path`, click: () => clipboard.writeText(item.outputPath!)});
		}

		// Optional items
		const optionalItems: MenuItemConstructorOptions[] = [];
		if (item.meta != null) optionalItems.push({label: `Show meta table`, click: () => showDialog('meta')});
		if (item.message != null) optionalItems.push({label: `Show message`, click: () => showDialog('message')});

		if (optionalItems.length > 0) items.push({type: 'separator'}, ...optionalItems);

		openContextMenu(items);
	}

	let classNames = 'RenameItem';
	if (className) classNames += ` ${className}`;

	return (
		<div class={classNames} onContextMenu={handleContext}>
			<div class="cell -input" title={item.inputPath}>
				<div class="path">&lrm;{commonDir ? item.inputPath.slice(commonDir.length + 1) : item.inputPath}</div>
				{item.meta != null && (
					<Button
						class="showMeta"
						semitransparent
						onClick={() => showDialog('meta')}
						tooltip="Show meta table"
					>
						Ⅿ
					</Button>
				)}
			</div>
			<div class="divider">»</div>
			<div
				class={`cell -output -${item.message?.variant || 'success'}`}
				title={item.message?.message || item.outputPath}
			>
				<div class="path">
					&lrm;{commonDir && item.outputPath ? item.outputPath.slice(commonDir.length + 1) : item.outputPath}
				</div>
				{item.message != null && (
					<Button
						class="showMessage"
						variant={item.message.variant}
						semitransparent
						onClick={() => showDialog('message')}
						tooltip="Show message"
					>
						<Icon name={'error'} />
					</Button>
				)}
			</div>
		</div>
	);
}

function MetaTable({table}: {table: {[key: string]: unknown}}) {
	return (
		<Scrollable class="MetaTable">
			<table>
				{Object.entries(table).map(([prop, value]) => (
					<tr>
						<th>
							<pre>
								<code>{prop}</code>
							</pre>
						</th>
						<td>
							<pre>
								<code>{value == null ? `${value}` : JSON.stringify(value, null, 2)}</code>
							</pre>
						</td>
					</tr>
				))}
			</table>
		</Scrollable>
	);
}
