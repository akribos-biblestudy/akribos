import { describe, expect, it } from 'vitest';
import { createPublicDownloadGate } from './public-download-gate';

describe('public Bible download gate', () => {
	it('limits simultaneous exports until response bodies are consumed or cancelled', async () => {
		const gate = createPublicDownloadGate(2);
		const signal = new AbortController().signal;
		const first = await gate(signal, async () => new Response('json'));
		const second = await gate(signal, async () => new Response('usx'));
		const denied = await gate(signal, async () => new Response('unexpected'));
		expect(denied.status).toBe(503);
		expect(denied.headers.get('retry-after')).toBe('30');
		expect(await first.text()).toBe('json');
		const next = await gate(signal, async () => new Response('next'));
		expect(next.status).toBe(200);
		await second.body!.cancel();
		await next.body!.cancel();
		const last = await gate(signal, async () => new Response('last'));
		expect(await last.text()).toBe('last');
	});

	it('keeps the slot while a response chunk is awaiting transport drain', async () => {
		const gate = createPublicDownloadGate(1);
		const signal = new AbortController().signal;
		const response = await gate(signal, async () => new Response('large chunk'));
		const reader = response.body!.getReader();
		expect((await reader.read()).done).toBe(false);
		// Give streams a turn to prefetch: the transport has not asked for the next chunk yet.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect((await gate(signal, async () => new Response('unexpected'))).status).toBe(503);
		expect((await reader.read()).done).toBe(true);
		const next = await gate(signal, async () => new Response('available'));
		expect(await next.text()).toBe('available');
	});

	it('releases the slot after build failures and non-success responses', async () => {
		const gate = createPublicDownloadGate(1);
		const signal = new AbortController().signal;
		await expect(
			gate(signal, async () => {
				throw new Error('failed');
			})
		).rejects.toThrow('failed');
		expect((await gate(signal, async () => new Response('missing', { status: 404 }))).status).toBe(
			404
		);
		const response = await gate(signal, async () => new Response('ok'));
		expect(await response.text()).toBe('ok');
	});

	it('keeps the slot until an aborted in-flight build finishes', async () => {
		const gate = createPublicDownloadGate(1);
		const controller = new AbortController();
		let finish!: (response: Response) => void;
		const building = gate(
			controller.signal,
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		controller.abort();
		expect(
			(await gate(new AbortController().signal, async () => new Response('busy'))).status
		).toBe(503);
		finish(new Response('finished'));
		const cancelled = await building;
		await cancelled.body!.cancel();
		const available = await gate(
			new AbortController().signal,
			async () => new Response('available')
		);
		expect(await available.text()).toBe('available');
	});

	it('releases the slot when the client aborts after response creation', async () => {
		const gate = createPublicDownloadGate(1);
		const controller = new AbortController();
		await gate(controller.signal, async () => new Response('large export'));
		controller.abort();
		await new Promise((resolve) => setTimeout(resolve, 0));
		const available = await gate(
			new AbortController().signal,
			async () => new Response('available')
		);
		expect(await available.text()).toBe('available');
	});
});
