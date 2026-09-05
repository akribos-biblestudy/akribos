import { describe, expect, it } from 'vitest';
import { editorAssistantTrigger } from './editor-assistant';

describe('editor assistant triggers', () => {
	it('opens both assistants immediately after their trigger', () => {
		expect(editorAssistantTrigger('/', 1, 2)).toEqual({
			kind: 'slash',
			from: 1,
			to: 2,
			query: ''
		});
		expect(editorAssistantTrigger('@', 4, 5)).toEqual({
			kind: 'mention',
			from: 4,
			to: 5,
			query: ''
		});
	});

	it('opens slash commands at a word boundary and retains a multiword query', () => {
		expect(editorAssistantTrigger('Text /bibel text', 20, 36)).toEqual({
			kind: 'slash',
			from: 25,
			to: 36,
			query: 'bibel text'
		});
		expect(editorAssistantTrigger('https://example.com/', 1, 21)).toBeNull();
	});

	it('opens mentions after whitespace, including searches for hierarchical tags', () => {
		expect(editorAssistantTrigger('Siehe @Predigt/Gnade', 1, 21)).toEqual({
			kind: 'mention',
			from: 7,
			to: 21,
			query: 'Predigt/Gnade'
		});
		expect(editorAssistantTrigger('mail@example.com', 1, 17)).toBeNull();
	});
});
