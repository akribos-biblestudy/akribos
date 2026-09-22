import { afterEach, describe, expect, it } from 'vitest';
import '../../../routes/layout.css';
import { copyEditorReadingPreferences } from './editor-reading-preferences';

const elements: HTMLElement[] = [];
afterEach(() => {
	for (const element of elements.splice(0)) element.remove();
});

describe('the editor reading preferences in the Zen top layer', () => {
	it('keeps 140% text and footnotes at their actual sizes after the DOM leaves its preference wrapper', () => {
		const preferences = document.createElement('div');
		preferences.className = 'reading-preferences';
		preferences.style.setProperty('--reader-font-scale', '1.4');
		const editor = document.createElement('section');
		editor.innerHTML =
			'<div class="document-prose prose-like"><p>Text</p><ol data-footnotes="true"><li data-footnote-id="a"><p>Eine Fußnote</p></li></ol></div>';
		preferences.append(editor);
		document.body.append(preferences);
		const dialog = document.createElement('dialog');
		document.body.append(dialog);
		elements.push(preferences, dialog);
		const prose = editor.firstElementChild!;
		const definition = editor.querySelector('li')!;
		expect(getComputedStyle(prose).fontSize).toBe('23.8px');
		expect(parseFloat(getComputedStyle(definition).fontSize)).toBeCloseTo(22.61, 1);
		copyEditorReadingPreferences(editor, dialog);
		dialog.append(editor);
		dialog.showModal();
		expect(getComputedStyle(prose).fontSize).toBe('23.8px');
		expect(parseFloat(getComputedStyle(definition).fontSize)).toBeCloseTo(22.61, 1);
		expect(dialog.style.getPropertyValue('--reader-font-scale')).toBe('1.4');
		dialog.close();
		preferences.append(editor);
		expect(getComputedStyle(prose).fontSize).toBe('23.8px');
	});
});
