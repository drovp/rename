export const IS_MAC = process.platform === 'darwin';
export const Ctrl_OR_Meta = IS_MAC ? 'Meta' : 'Ctrl';
export const Ctrl_OR_Cmd = IS_MAC ? 'Cmd' : 'Ctrl';
export const Control_OR_Command = IS_MAC ? 'Control' : 'Command';

// Drop modifiers
export const openPreview = `Ctrl`;

// Preview shortcuts
export const updatePreview = `Shift+Enter`;
export const submit = `${Ctrl_OR_Meta}+Enter`;
export const cancel = `${Ctrl_OR_Meta}+Escape`;

export const showItems = `Alt+1`;
export const showWarnings = `Alt+2`;
export const showErrors = `Alt+3`;
export const toggleHistory = `Alt+h`;
export const toggleInstructions = `Alt+i`;

export const switchCategoryLeft = `Alt+ArrowLeft`;
export const switchCategoryRight = `Alt+ArrowRight`;

export const contentTop = `Alt+Home`;
export const contentBottom = `Alt+End`;
export const contentPageUp = `Alt+PageUp`;
export const contentPageDown = `Alt+PageDown`;
export const contentScrollUp = `Alt+ArrowUp`;
export const contentScrollDown = `Alt+ArrowDown`;

// Helpers

/** Converts shortcut into a string user's can understand. */
export const humanShortcut = (modifiers: string) =>
	(IS_MAC ? modifiers.replaceAll('Meta', 'Cmd') : modifiers).replaceAll('Arrow', '');
