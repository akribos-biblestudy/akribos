import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import type { VerseSegment } from '$lib/bible/segments';
import { splitVerseLead, taggedWordSegments } from '$lib/bible/segments';
import ReaderLexiconTab from './ReaderLexiconTab.svelte';
import StudySourceBadge from './StudySourceBadge.svelte';
import VerseText from './VerseText.svelte';

const props: ComponentProps<typeof ReaderLexiconTab> = {
	lookup: 'H430',
	lexiconId: 'LEX',
	resourceTitle: 'Hebräisches Lexikon',
	entry: {
		strong: 'H430',
		lemma: 'אֱלֹהִים',
		language: 'hbo',
		transliteration: null,
		pronunciation: null,
		definitionHtml: '<p>God.</p>',
		derivationHtml: null,
		kjvDefinitionHtml: null,
		germanTranslation: {
			definitionHtml: '<p>Gott.</p>',
			derivationHtml: null,
			kjvDefinitionHtml: null,
			machineTranslated: true
		},
		seeAlso: [],
		licenseHtml: null,
		usageNotesHtml: null
	},
	sourceResource: {
		id: 'AKRIBOS.ELB',
		kind: 'bible',
		name: 'Alte Version 1.1',
		abbrev: 'Alte Version 1.1',
		coverTitle: 'Elberfelder',
		tabTitle: 'ELB',
		selectionTitle: 'Elberfelder 1932',
		selectionSubtitle: 'Alte Version 1.1',
		sourceRevision: '1.2',
		language: 'de',
		direction: 'ltr',
		canon: 'both',
		sortOrder: 1,
		hasStrongs: true,
		hasMorphology: false,
		licenseHtml: null,
		usageNotesHtml: null
	},
	studyReference: { book: 1, chapter: 1, verse: 5 },
	studyWord: 'und',
	studyWordPosition: 1,
	onLookup: () => {},
	onOpenReference: () => {},
	lookupHref: () => '#lookup',
	referenceHref: () => '#ref'
};

function response(assignmentStatus: 'unconfirmed' | 'ambiguous' | null) {
	return Response.json({
		strong: 'H430',
		assignmentStatus,
		statistics: { occurrences: 0, verseCount: 0 },
		bookCounts: [],
		glosses: [],
		occurrences: { occurrences: [], total: 0, page: 1, pageCount: 1 },
		original: { word: 'אֱלֹהִים', morph: 'HNcmpa', lemma: null, resourceId: 'ORIGINAL' },
		morphology: {
			code: 'HNcmpa',
			partOfSpeech: 'morph.pos.noun',
			features: [{ feature: 'morph.feature.gender', value: 'morph.gender.masculine' }],
			unknown: []
		}
	});
}

afterEach(() => vi.unstubAllGlobals());

it('shows only source-word uncertainty while keeping translation provenance in the original edition', async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(String(input), location.origin);
		return response(url.searchParams.get('wordPosition') === '1' ? 'unconfirmed' : null);
	});
	vi.stubGlobal('fetch', fetchMock);
	const screen = await render(ReaderLexiconTab, props);
	await expect
		.element(screen.getByRole('note'))
		.toHaveTextContent(
			'Die Strong-Zuordnung von „und“ zu H430 in 1Mo 1,5 ist fachlich noch nicht bestätigt.'
		);
	const request = new URL(String(fetchMock.mock.calls.at(-1)![0]), location.origin);
	expect(request.searchParams.get('word')).toBe('und');
	expect(request.searchParams.get('wordPosition')).toBe('1');
	expect(screen.container.textContent).not.toContain('Automatisch vorübersetzt');
	const original = screen.container.querySelector('details')!;
	expect(original.open).toBe(false);
	expect(original.textContent).toContain('nicht die Strong-Zuordnung');
	await screen.getByText('Englisches Original', { exact: true }).click();
	await expect
		.element(screen.getByText(/Der deutsche Lexikontext wurde automatisch/))
		.toBeVisible();
	// The same Strong and spelling at another tagged index must reload, not reuse the warning.
	await screen.rerender({ studyWordPosition: 2 });
	await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
	await expect
		.element(screen.getByRole('heading', { name: 'Grammatik', exact: true }))
		.toBeVisible();
	expect(screen.container.querySelector('.assignment-note')).toBeNull();
	const grammar = screen.container.querySelector('.grammar-details')!.getBoundingClientRect();
	const definition = screen.container.querySelector('.definition-section')!.getBoundingClientRect();
	expect(definition.top - grammar.bottom).toBeGreaterThanOrEqual(16);
});

it('labels an ambiguous legacy link without pretending it identifies the selected occurrence', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => response('ambiguous'))
	);
	const screen = await render(ReaderLexiconTab, { ...props, studyWordPosition: undefined });
	await expect
		.element(screen.getByRole('note'))
		.toHaveTextContent('Der gespeicherte Link bezeichnet keine einzelne Wortposition.');
	expect(screen.container.querySelector('.assignment-note')!.textContent).toContain(
		'mindestens eine dieser Zuordnungen'
	);
});

it('does not let a late response restore another clicked word’s warning', async () => {
	let completeFirst!: (value: Response) => void;
	const fetchMock = vi
		.fn()
		.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					completeFirst = resolve;
				})
		)
		.mockImplementation(async () => response(null));
	vi.stubGlobal('fetch', fetchMock);
	const screen = await render(ReaderLexiconTab, props);
	await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
	await screen.rerender({ studyWordPosition: 2 });
	await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
	await expect
		.element(screen.getByRole('heading', { name: 'Grammatik', exact: true }))
		.toBeVisible();
	completeFirst(response('unconfirmed'));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(screen.container.querySelector('.assignment-note')).toBeNull();
});

it('uses the imported source revision instead of legacy administrative labels', async () => {
	const screen = await render(StudySourceBadge, { source: props.sourceResource! });
	const badge = screen.getByText('Elberfelder 1932', { exact: true });
	await expect
		.element(badge)
		.toHaveAttribute('title', 'Vorkommen aus Elberfelder 1932 · Version 1.2');
	await screen.rerender({ source: { ...props.sourceResource!, sourceRevision: null } });
	await expect
		.element(badge)
		.toHaveAttribute('title', 'Vorkommen aus Elberfelder 1932 · Importversion nicht ermittelt');
});

it('passes tagged positions across a split lead and nested red-letter words independently of highlighting', async () => {
	const segments: VerseSegment[] = [
		{ kind: 'w', strong: 'G2424', text: 'Jesus' },
		' sagte mehrere Worte ',
		{
			kind: 'wj',
			children: [
				{ kind: 'w', strong: 'G2193', text: 'bis', strongs: ['G2193', 'G891'] },
				' ',
				{ kind: 'w', strong: 'G2193', text: 'bis' }
			]
		}
	];
	const [lead, rest] = splitVerseLead(segments);
	const clicked = vi.fn();
	const first = await render(VerseText, { segments: lead, onStrongClick: clicked });
	const remainder = await render(VerseText, {
		segments: rest,
		wordOffset: 1,
		wordPositionOffset: taggedWordSegments(lead).length,
		onStrongClick: clicked
	});
	await first.getByRole('button', { name: 'Jesus', exact: true }).click();
	const buttons = remainder.container.querySelectorAll<HTMLButtonElement>('.strong');
	buttons[0]!.click();
	buttons[1]!.click();
	expect(clicked.mock.calls).toEqual([
		['G2424', 'Jesus', 0],
		['G2193', 'bis', 1],
		['G2193', 'bis', 2]
	]);
});

it('shows occurrence notes only for the studied Strong and explains the affected word', async () => {
	const note = {
		kind: 'note',
		marker: '',
		text: 'Automatische Wortzuordnung; fachlich noch nicht bestätigt.'
	} as const;
	const segments: VerseSegment[] = [
		{ kind: 'w', strong: 'H430', text: 'und' },
		note,
		' ',
		{ kind: 'w', strong: 'H431', text: 'anderes' },
		{ ...note },
		{ kind: 'note', marker: 'a', text: 'Normale Anmerkung.' }
	];
	const screen = await render(VerseText, {
		segments,
		activeStrong: 'H430',
		showStrongAssignmentNotes: true
	});
	expect(screen.container.querySelectorAll('.footnote-marker')).toHaveLength(2);
	await screen.getByRole('button', { name: 'Hinweis * öffnen', exact: true }).click();
	await expect
		.element(screen.getByRole('note'))
		.toHaveTextContent('Die Strong-Zuordnung von „und“ zu H430 ist fachlich noch nicht bestätigt.');
	await screen.rerender({ showStrongAssignmentNotes: false });
	expect(screen.container.querySelectorAll('.footnote-marker')).toHaveLength(1);
	await screen.getByRole('button', { name: 'Hinweis a öffnen', exact: true }).click();
	await expect.element(screen.getByRole('note')).toHaveTextContent('Normale Anmerkung.');
});
