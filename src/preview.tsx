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
	if (event.key === 'F5') window.location.reload();
});

render(<Spinner />, container);

getPayload<PreparatorPayload>()
	.then((payload) => {
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
