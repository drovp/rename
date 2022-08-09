import {h} from 'preact';

export interface SpinnerProps {
	class?: string;
	variant?: Variant;
	frozen?: boolean;
}

export function Spinner({class: className, variant, frozen}: SpinnerProps) {
	let classNames = 'Spinner';
	if (variant) classNames += ` -${variant}`;
	if (frozen) classNames += ' -frozen';
	if (className) classNames += ` ${className}`;

	return <div className={classNames} />;
}
