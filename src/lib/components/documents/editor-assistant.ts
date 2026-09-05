export type EditorAssistantTrigger = {
	kind: 'slash' | 'mention';
	from: number;
	to: number;
	query: string;
};

function matchTrigger(
	textBeforeCursor: string,
	blockStart: number,
	cursor: number,
	kind: EditorAssistantTrigger['kind'],
	pattern: RegExp
): EditorAssistantTrigger | null {
	const match = pattern.exec(textBeforeCursor);
	if (!match) return null;
	const tokenOffset = match.index + (/^\s/u.test(match[0]) ? 1 : 0);
	return {
		kind,
		from: blockStart + tokenOffset,
		to: cursor,
		query: (match[1] ?? '').trim()
	};
}

/** Finds a command/mention which still reaches the caret and was introduced at a word boundary. */
export function editorAssistantTrigger(
	textBeforeCursor: string,
	blockStart: number,
	cursor: number
): EditorAssistantTrigger | null {
	const slash = matchTrigger(
		textBeforeCursor,
		blockStart,
		cursor,
		'slash',
		/(?:^|\s)\/([^/\n]*)$/u
	);
	const mention = matchTrigger(
		textBeforeCursor,
		blockStart,
		cursor,
		'mention',
		/(?:^|\s)@([^@\n]*)$/u
	);
	if (!slash) return mention;
	if (!mention) return slash;
	return slash.from > mention.from ? slash : mention;
}
