import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPdfCompiler } from './pdf-renderer';

const run = (script: string, options: Parameters<typeof runPdfCompiler>[3] = {}) =>
	runPdfCompiler(process.execPath, ['-e', script], tmpdir(), options);

afterEach(() => vi.unstubAllEnvs());

describe('isolated PDF compiler process', () => {
	it('passes no application secrets to the child', async () => {
		vi.stubEnv('DATABASE_URL', 'PRIVATE_DATABASE_SECRET');
		vi.stubEnv('SESSION_SECRET', 'PRIVATE_SESSION_SECRET');
		const result = await run('process.stdout.write("%PDF-" + JSON.stringify(process.env))');
		expect(result.toString()).not.toContain('PRIVATE_');
		expect(Object.keys(JSON.parse(result.toString().slice(5))).sort()).toEqual(['LANG', 'PATH']);
	});

	it('kills an overlong process and returns a bounded, explained timeout', async () => {
		await expect(run('setInterval(() => {}, 1000)', { timeoutMs: 80 })).rejects.toMatchObject({
			status: 504
		});
	});

	it('kills oversized output instead of retaining an unbounded buffer', async () => {
		await expect(
			run('process.stdout.write("%PDF-" + "x".repeat(100000))', { outputBytes: 1024 })
		).rejects.toMatchObject({ status: 413 });
	});

	it('does not return a partial document or private compiler diagnostics after a warning', async () => {
		const result = run(
			'process.stdout.write("%PDF-valid"); process.stderr.write("PRIVATE_NOTE_BODY")'
		);
		await expect(result).rejects.toMatchObject({ status: 422 });
		await expect(result).rejects.not.toThrow(/PRIVATE_NOTE_BODY/);
	});

	it('cancels a running process when the download is aborted', async () => {
		const controller = new AbortController();
		const result = run('setInterval(() => {}, 1000)', { signal: controller.signal });
		controller.abort();
		await expect(result).rejects.toMatchObject({ status: 503 });
	});

	it('fails closed for missing binaries and non-PDF output', async () => {
		await expect(runPdfCompiler('/does/not/exist/typst', [], tmpdir())).rejects.toMatchObject({
			status: 503
		});
		await expect(run('process.stdout.write("not a PDF")')).rejects.toMatchObject({ status: 503 });
	});
});
