import { describe, expect, it } from 'vitest';
import { renderCommentaryHtml } from './commentary-html';
import { sanitizeHtml } from './parse/commentary';

const context = { book: 50, chapter: 4, verseStart: 1, verseEnd: 5 };

describe('commentary paragraph presentation', () => {
	it('starts new paragraphs before standalone verse labels in flattened imports', () => {
		const html = renderCommentaryHtml(
			sanitizeHtml(
				'Einleitung. Phil 4:1. Zunächst ein Gedanke. Phil 4:2. Danach ein anderer.Hier endet er.Phil 4:3. Weiter geht es.'
			),
			context
		);
		expect(html.match(/<br><br>/g)).toHaveLength(3);
		expect(html).toContain('<br><br><a');
		expect(html).toContain('data-verse="3"');
		expect(renderCommentaryHtml(html, context)).toBe(html);
	});

	it.each([
		'Wie Phil 4:1 zeigt, steht die Stelle im Satz.',
		'Das steht in Phil 4:1. Danach ein neuer Satz.',
		'Das steht hier (Phil 4:1). Danach ein neuer Satz.',
		'Das steht hier (vgl. Phil 4:1. Danach mehr).',
		'Das steht z. B. Phil 4:1. Danach mehr.',
		'Das steht hier vgl. Phil 4:1. Danach mehr.',
		'Einleitung. Eph 4:1. Ein anderer Text.',
		'Einleitung. Phil 3:1. Ein anderes Kapitel.',
		'Einleitung. Phil 4:6. Außerhalb des Abschnitts.',
		'Einleitung. Phil 4:1 ist wichtig.',
		'Einleitung. Phil 4:1; 4:2. Beide Stellen.',
		'<p>Einleitung. Phil 4:1. Bewusst im Absatz.</p>',
		'<code>Phil 4:1. Code</code>'
	])('keeps inline or explicitly structured text unchanged: %s', (body) => {
		expect(renderCommentaryHtml(body, context)).not.toContain('<br><br>');
	});

	it('does not put an empty paragraph before the opening verse label', () => {
		expect(renderCommentaryHtml('Phil 4:1. Zunächst.', context)).toMatch(/^<a /);
	});

	it('preserves OSIS paragraph milestones and line breaks on new imports, strips attributes', () => {
		const html = sanitizeHtml(
			'<div type="x-p" sID="p1"/>Einleitung.<div eID="p1" type="x-p"/><lb/><div sID="p2" type="x-p"/>Phil 4:1. Text mit (Phil 4:2).<div type="x-p" eID="p2"/><script>alert(1)</script><p onclick="evil()">Weiter</p>'
		);
		expect(html).toContain('<p>Einleitung.</p><br><p><a');
		expect(html).toContain('</p> alert(1) <p>Weiter</p>');
		expect(html).not.toMatch(/onclick|sID|eID|<script/i);
		expect(renderCommentaryHtml(html, context)).not.toContain('<br><br>');
	});
});
