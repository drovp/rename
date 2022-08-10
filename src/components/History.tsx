import {h} from 'preact';
import {useState, useEffect, useRef} from 'preact/hooks';
import {idKey, clamp} from 'lib/utils';
import {Scrollable} from 'components/Scrollable';
import {Vacant} from 'components/Vacant';
import {makeScroller} from 'element-scroller';

export interface HistoryProps {
	history: string[];
	onSelect: (value: string) => void;
}

export function History({history, onSelect}: HistoryProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);

	function selectIndex(index: number) {
		const value = history[index];
		if (value == null) {
			throw new Error(`Can't select, history at index ${index} is undefined.`);
		}
		onSelect(value);
	}

	function handleContainerClick(event: MouseEvent) {
		if (event.button !== 0) return;

		const target = (event.target as HTMLElement).closest?.<HTMLButtonElement>('button[data-index]');
		const dataIndex = target?.dataset.index;

		if (dataIndex) selectIndex(parseInt(dataIndex, 10));
	}

	useEffect(() => {
		// Blur any active element as history section takes over navigation
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

		const container = containerRef.current;
		if (!container) return;
		const scroller = makeScroller(container, {handleWheel: true});

		const moveIndex = (delta: number) =>
			setSelectedIndex((index) => {
				const newIndex = clamp(0, index + delta, history.length - 1);

				// Scroll element into view
				const button = container.querySelector<HTMLElement>(`button[data-index="${newIndex}"]`);
				if (button) {
					const containerRect = container.getBoundingClientRect();
					const buttonRect = button.getBoundingClientRect();
					const delta = containerRect.top + containerRect.height / 3 - buttonRect.top - buttonRect.height / 2;
					scroller.stop();
					scroller.scrollBy({top: -delta});
				}

				return newIndex;
			});
		const handleKeyDown = (event: KeyboardEvent) => {
			switch (idKey(event)) {
				case 'ArrowUp':
					event.preventDefault();
					moveIndex(-1);
					break;

				case 'ArrowDown':
					event.preventDefault();
					moveIndex(1);
					break;

				case 'PageUp':
					event.preventDefault();
					moveIndex(-5);
					break;

				case 'PageDown':
					event.preventDefault();
					moveIndex(5);
					break;

				case 'Home':
					event.preventDefault();
					moveIndex(-Infinity);
					break;

				case 'End':
					event.preventDefault();
					moveIndex(Infinity);
					break;

				case 'Enter': {
					event.preventDefault();
					let selectedIndex: number;
					setSelectedIndex((index) => (selectedIndex = index));
					selectIndex(selectedIndex!);
					break;
				}
			}
		};

		addEventListener('keydown', handleKeyDown);

		return () => {
			removeEventListener('keydown', handleKeyDown);
			scroller.dispose();
		};
	}, [history]);

	return (
		<Scrollable innerRef={containerRef} class="History" onClick={handleContainerClick}>
			{history.length === 0 && <Vacant>Custom template history is empty.</Vacant>}
			{history.map((value, index) => (
				<button class={index === selectedIndex ? `-selected` : undefined} data-index={index}>
					<code>{value}</code>
				</button>
			))}
		</Scrollable>
	);
}
