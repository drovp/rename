import * as Path from 'path';
import {h, render} from 'preact';
import {getPayload, resolve} from '@drovp/utils/modal-window';
import {eem} from 'lib/utils';
import {PreparatorPayload} from './';
import {App} from 'components/App';
import {Spinner} from 'components/Spinner';
import {Vacant} from 'components/Vacant';

const container = document.getElementById('app-container')!;
const INSTRUCTIONS_PATH = Path.resolve(__dirname, '../instructions.md');

window.addEventListener('keydown', (event) => {
	switch (event.key) {
		case 'F5':
			window.location.reload();
			break;

		case 'F6':
			const currentTheme = document.documentElement.dataset.theme;
			document.documentElement.dataset.theme = currentTheme === 'dark' ? 'light' : 'dark';
			event.preventDefault();
			break;
	}
});

render(<Spinner />, container);

getPayload<PreparatorPayload>()
	.then((payload) => {
		// Respect app settings
		document.documentElement.style.setProperty('--font-size', `${payload.settings?.fontSize || 13}px`);

		const theme = payload.settings?.theme || 'os';
		if (theme === 'os') {
			const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			document.documentElement.dataset.theme = darkModeMediaQuery.matches ? 'dark' : 'light';
			darkModeMediaQuery.addEventListener('change', (event) => {
				document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
			});
		} else {
			document.documentElement.dataset.theme = theme;
		}

		// Render the app
		render(
			<App
				preparatorPayload={payload}
				instructionsPath={INSTRUCTIONS_PATH}
				onSubmit={(payload) => resolve(payload)}
				onCancel={() => window.close()}
			/>,
			container
		);
	})
	.catch((error) => {
		console.error(error);
		render(<Vacant variant="danger" title="Error:" details={eem(error)} />, container);
	});
