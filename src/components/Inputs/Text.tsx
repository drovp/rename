import {h} from 'preact';
import {useRef, Ref, useState, useMemo} from 'preact/hooks';
import {insertAtCursor, TargetedEvent, clamp} from 'lib/utils';

export interface TextProps {
	id?: string;
	name?: string;
	placeholder?: string;
	value?: string | number;
	spellcheck?: boolean;
	class?: string;
	variant?: Variant;
	transparent?: boolean;
	resizable?: boolean;
	min?: number;
	max?: number;
	rows?: number;
	responsiveRows?: number;
	onChange?: (value: string) => void;
	onClick?: (event: TargetedEvent<HTMLTextAreaElement, MouseEvent>) => void;
	onKeyDown?: (event: TargetedEvent<HTMLTextAreaElement, KeyboardEvent>) => void;
	disabled?: boolean;
	readonly?: boolean;
	innerRef?: Ref<HTMLTextAreaElement | null>;
}

export function Text({
	id,
	name,
	placeholder,
	class: className,
	value,
	spellcheck,
	variant,
	resizable = true,
	min,
	max,
	rows: requestedRows = 2,
	responsiveRows = 0,
	transparent,
	onChange,
	disabled,
	innerRef,
	...rest
}: TextProps) {
	const textareaRef = innerRef || useRef<HTMLTextAreaElement>(null);
	const [minHeight, setMinHeight] = useState(0);
	const initialRows = useMemo(() => calculateRows(value, requestedRows, responsiveRows), []);
	const [rows, setRows] = useState(initialRows);

	function handleInput(event: TargetedEvent<HTMLTextAreaElement, Event>) {
		const value = event.currentTarget.value;
		setRows(calculateRows(value, requestedRows, responsiveRows));
		onChange?.(value);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.shiftKey || event.altKey || event.ctrlKey) return;
		if (event.key === 'Tab') {
			insertAtCursor('\t');
			event.preventDefault();
			event.stopPropagation();
		}
	}

	function initResize(event: TargetedEvent<HTMLDivElement, MouseEvent>) {
		const textarea = textareaRef.current;

		if (!textarea) return;

		const initHeight = textarea.getBoundingClientRect().height;
		const initY = event.clientY;

		function move(event: MouseEvent) {
			setMinHeight(Math.max(0, initHeight + event.clientY - initY));
		}

		function cancel() {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', cancel);
		}

		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', cancel);
	}

	let classNames = `Text`;
	if (className) classNames += ` ${className}`;
	if (variant) classNames += ` -${variant}`;
	if (transparent) classNames += ' -transparent';

	return (
		<div class={classNames} style={`--rows:${rows};--min-height:${minHeight}px;`}>
			<textarea
				{...rest}
				id={id}
				name={name}
				placeholder={placeholder}
				ref={textareaRef}
				minLength={min}
				maxLength={max}
				spellcheck={spellcheck === true}
				onInput={handleInput}
				disabled={disabled}
				onKeyDown={(event) => {
					handleKeyDown(event);
					rest.onKeyDown?.(event);
				}}
				value={value}
			/>
			{resizable && <div class="resize-handle" onMouseDown={initResize} />}
		</div>
	);
}

function calculateRows(value: string | number | null | undefined, rows: number, responsiveRows: number) {
	const lines = `${value}`.split(/\r?\n/).length;
	return clamp(rows, lines, rows + responsiveRows);
}
