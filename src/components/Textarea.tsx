import {h} from 'preact';
import {useRef, Ref, useState} from 'preact/hooks';
import {insertAtCursor, TargetedEvent} from 'lib/utils';

export interface TextareaProps {
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
	/**
	 * Textarea resizes itself to accommodate text inside up to the
	 * --max-auto-size CSS value.
	 */
	autoResize?: boolean;
	onChange?: (value: string) => void;
	onClick?: (event: TargetedEvent<HTMLTextAreaElement, MouseEvent>) => void;
	onKeyDown?: (event: TargetedEvent<HTMLTextAreaElement, KeyboardEvent>) => void;
	disabled?: boolean;
	readonly?: boolean;
	innerRef?: Ref<HTMLTextAreaElement | null>;
}

export function Textarea({
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
	rows,
	autoResize = true,
	transparent,
	onChange,
	disabled,
	innerRef,
	...rest
}: TextareaProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const textareaRef = innerRef || useRef<HTMLTextAreaElement>(null);
	const [minHeight, setMinHeight] = useState(0);

	function handleInput(event: TargetedEvent<HTMLTextAreaElement, Event>) {
		onChange?.(event.currentTarget.value);
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

	/**
	 * Calculates content height
	 */
	function handleFocus() {
		const textarea = textareaRef.current;
		if (!textarea || !autoResize) return;

		const mockArea = document.createElement('textarea');
		const computedStyle = getComputedStyle(textarea);
		Array.from(computedStyle).forEach((key) =>
			mockArea.style.setProperty(key, computedStyle.getPropertyValue(key), computedStyle.getPropertyPriority(key))
		);
		Object.assign(mockArea.style, {
			width: `${textarea.offsetWidth}px`,
			height: '0',
			overflow: 'hidden',
			position: 'fixed',
			right: '200vw',
		});
		document.body.appendChild(mockArea);

		const handleInput = () => {
			const container = containerRef.current;
			if (container) {
				mockArea.value = textarea.value;
				container.style.setProperty('--content-height', `${mockArea.scrollHeight + 2}px`);
			}
		};

		const handleBlur = () => {
			textarea.removeEventListener('input', handleInput);
			textarea.removeEventListener('blur', handleBlur);
			mockArea.remove();
		};

		textarea.addEventListener('input', handleInput);
		textarea.addEventListener('blur', handleBlur);
		handleInput();
	}

	let classNames = `Textarea`;
	if (className) classNames += ` ${className}`;
	if (variant) classNames += ` -${variant}`;
	if (transparent) classNames += ' -transparent';

	return (
		<div ref={containerRef} class={classNames} style={`--rows:${rows};--min-height:${minHeight}px`}>
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
				onFocus={handleFocus}
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
