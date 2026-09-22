import { isDocumentFootnoteId } from '$lib/notes/document-footnotes';
import { t } from '$lib/i18n';

function attribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/** Only canonical, sanitised document HTML may enter this render-only transformation. */
export function linkDocumentFootnotes(html: string, instance: string): string {
	const definitionIds = new Set<string>();
	for (const match of html.matchAll(/<li\s+data-footnote-id="([^"]+)"/g))
		if (isDocumentFootnoteId(match[1])) definitionIds.add(match[1]);
	if (!definitionIds.size) return html;
	const uses = new Map<string, string[]>();
	const number = new Map<string, number>();
	const definitionId = (id: string) => `footnote-${instance}-${id}`;
	let linked = html.replace(
		/<sup\s+data-footnote-ref="([^"]+)">[^<]*<\/sup>/g,
		(original, id: string) => {
			if (!definitionIds.has(id)) return original;
			if (!number.has(id)) number.set(id, number.size + 1);
			const occurrences = uses.get(id) ?? [];
			const referenceId = `footnote-ref-${instance}-${id}-${occurrences.length + 1}`;
			occurrences.push(referenceId);
			uses.set(id, occurrences);
			return `<sup data-footnote-ref="${attribute(id)}"><a id="${attribute(referenceId)}" href="#${encodeURIComponent(definitionId(id))}" data-footnote-link="true" role="doc-noteref" aria-label="${attribute(t('documents.footnotes.number', { number: number.get(id)! }))}">${number.get(id)}</a></sup>`;
		}
	);
	for (const id of definitionIds) if (!number.has(id)) number.set(id, number.size + 1);
	const stack: (string | null)[] = [];
	linked = linked.replace(/<\/?(?:ol|li)\b[^>]*>/g, (tag) => {
		if (/^<ol\s+data-footnotes="true"/.test(tag))
			return tag.replace(
				'>',
				` role="doc-endnotes" aria-label="${attribute(t('documents.footnotes.list'))}">`
			);
		if (/^<li\b/.test(tag)) {
			const match = /data-footnote-id="([^"]+)"/.exec(tag);
			const id = match?.[1];
			stack.push(id && definitionIds.has(id) ? id : null);
			return id && definitionIds.has(id)
				? tag.replace(
						'>',
						` id="${attribute(definitionId(id))}" value="${number.get(id)}" tabindex="-1">`
					)
				: tag;
		}
		if (tag === '</li>') {
			const id = stack.pop();
			if (!id) return tag;
			const backlinks = (uses.get(id) ?? [])
				.map(
					(referenceId, index) =>
						`<a class="footnote-backlink" href="#${encodeURIComponent(referenceId)}" data-footnote-link="true" role="doc-backlink" aria-label="${attribute(t('documents.footnotes.backlink', { number: number.get(id)!, occurrence: index + 1 }))}">↩${(uses.get(id)?.length ?? 0) > 1 ? index + 1 : ''}</a>`
				)
				.join(' ');
			return `${backlinks}${tag}`;
		}
		return tag;
	});
	return linked;
}
