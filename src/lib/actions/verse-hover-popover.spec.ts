import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBibleQuotation } from './verse-hover-popover';

afterEach(() => vi.unstubAllGlobals());

describe('Bible quotation loading', () => {
	it('loads and joins an inclusive cross-chapter passage from the public Bible API', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/v1/bibles/QUOTE-CROSS/1/1') {
				return Response.json({
					verses: [
						{ verse: 30, segments: ['dreißig'] },
						{ verse: 31, segments: ['sehr gut'] }
					]
				});
			}
			if (url === '/api/v1/bibles/QUOTE-CROSS/1/2') {
				return Response.json({
					verses: [
						{ verse: 1, segments: ['vollendet'] },
						{ verse: 2, segments: ['ruhte'] },
						{ verse: 3, segments: ['segnete'] },
						{ verse: 4, segments: ['außerhalb'] }
					]
				});
			}
			if (url === '/api/v1/resources') {
				return Response.json({ resources: [{ id: 'QUOTE-CROSS', tabTitle: 'Testübersetzung' }] });
			}
			return new Response(null, { status: 404 });
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(loadBibleQuotation('QUOTE-CROSS', '1Mo 1,31-2,3')).resolves.toEqual({
			reference: '1.Mose 1,31-2,3',
			translation: 'Testübersetzung',
			text: 'sehr gut vollendet ruhte segnete'
		});
		expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/bibles/QUOTE-CROSS/1/2?anything');
	});

	it('rejects text that is not a passage before issuing a request', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		await expect(loadBibleQuotation('QUOTE-INVALID', 'nur Wörter')).rejects.toThrow(
			'invalid reference'
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('copies a complete chapter with a chapter label instead of a synthetic verse range', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) =>
				String(input) === '/api/v1/bibles/QUOTE-CHAPTER/1/1'
					? Response.json({
							verses: [
								{ verse: 1, segments: ['Anfang'] },
								{ verse: 2, segments: ['Erde'] }
							]
						})
					: Response.json({ resources: [] })
			)
		);
		await expect(loadBibleQuotation('QUOTE-CHAPTER', '1Mo 1')).resolves.toMatchObject({
			reference: '1.Mose 1',
			text: 'Anfang Erde'
		});
	});
});
