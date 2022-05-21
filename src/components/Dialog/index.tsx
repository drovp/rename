import {h, render, ComponentChild, Fragment} from 'preact';

export function openDialog({
	title,
	modal = false,
	align = 'center',
	content,
	onClose,
}: {
	title: string;
	modal?: boolean;
	align?: 'center' | 'top' | 'bottom';
	content: ComponentChild;
	onClose?: () => void;
}) {
	const dialog = document.createElement('dialog') as any; // Missing HTMLDialogElement types

	dialog.className = `Dialog -${align}`;

	dialog.addEventListener('click', (event: MouseEvent) => {
		if ((event.target as HTMLElement).nodeName === 'DIALOG') close();
	});

	function close() {
		dialog.close();
		dialog.remove();
		render(null, dialog);
		onClose?.();
	}

	render(
		<Fragment>
			<header>
				<div class="title">{title}</div>
				<button class="close" onClick={close}>
					×
				</button>
			</header>
			{content}
		</Fragment>,
		dialog
	);

	document.body.appendChild(dialog);

	setTimeout(() => (modal ? dialog.showModal() : dialog.show()), 16);
}
