import { spawn, execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import template from './pdf-template.typ?raw';
import { PdfExportError, type PdfDocumentModel } from './pdf-model';

export const PDF_RENDER_LIMITS = {
	inputBytes: 8 * 1024 * 1024,
	outputBytes: 16 * 1024 * 1024,
	timeoutMs: 15_000,
	concurrency: 2,
	queueLength: 8,
	queueTimeoutMs: 10_000
} as const;

/** No inherited database/mail credentials, user code, shell, or user-selected file paths. */
const compilerEnvironment = () => ({ PATH: process.env.PATH, LANG: 'C.UTF-8' });

export async function runPdfCompiler(
	binary: string,
	args: string[],
	cwd: string,
	options: { signal?: AbortSignal; timeoutMs?: number; outputBytes?: number } = {}
): Promise<Buffer> {
	if (options.signal?.aborted) throw new PdfExportError(503, 'Der PDF-Export wurde abgebrochen.');
	return new Promise((resolveResult, reject) => {
		const child = spawn(binary, args, {
			cwd,
			env: compilerEnvironment(),
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const chunks: Buffer[] = [];
		let size = 0;
		let diagnostics = false;
		let failure: PdfExportError | undefined;
		const stop = (error: PdfExportError) => {
			failure ??= error;
			child.kill('SIGKILL');
		};
		const timer = setTimeout(
			() =>
				stop(
					new PdfExportError(
						504,
						'Der PDF-Export dauert zu lange. Bitte kürze das Dokument und versuche es erneut.'
					)
				),
			options.timeoutMs ?? PDF_RENDER_LIMITS.timeoutMs
		);
		const abort = () => stop(new PdfExportError(503, 'Der PDF-Export wurde abgebrochen.'));
		options.signal?.addEventListener('abort', abort, { once: true });
		child.stdout.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > (options.outputBytes ?? PDF_RENDER_LIMITS.outputBytes)) {
				stop(
					new PdfExportError(413, 'Das erzeugte PDF ist zu groß. Bitte teile das Dokument auf.')
				);
			} else if (!failure) chunks.push(chunk);
		});
		// Compiler diagnostics may quote private document text. Consume them without retaining or logging.
		child.stderr.on('data', () => {
			diagnostics = true;
		});
		child.on('error', () => {
			failure ??= new PdfExportError(503, 'Der PDF-Export ist derzeit nicht verfügbar.');
		});
		child.once('close', (code) => {
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', abort);
			if (failure) return reject(failure);
			if (code !== 0 || diagnostics)
				return reject(
					new PdfExportError(
						422,
						'Das Dokument konnte nicht vollständig als PDF gesetzt werden. Bitte prüfe Sonderzeichen, sehr lange Wörter und die Formatierung.'
					)
				);
			const result = Buffer.concat(chunks);
			if (result.subarray(0, 5).toString('ascii') !== '%PDF-')
				return reject(new PdfExportError(503, 'Der PDF-Export hat keine gültige Ausgabe erzeugt.'));
			resolveResult(result);
		});
	});
}

let active = 0;
const queue: (() => void)[] = [];
async function acquireSlot(signal?: AbortSignal): Promise<() => void> {
	if (signal?.aborted) throw new PdfExportError(503, 'Der PDF-Export wurde abgebrochen.');
	if (active >= PDF_RENDER_LIMITS.concurrency) {
		if (queue.length >= PDF_RENDER_LIMITS.queueLength)
			throw new PdfExportError(
				503,
				'Der PDF-Export ist ausgelastet. Bitte versuche es gleich erneut.'
			);
		await new Promise<void>((resolveQueue, reject) => {
			const cleanup = () => {
				clearTimeout(timer);
				signal?.removeEventListener('abort', abort);
			};
			const start = () => {
				cleanup();
				resolveQueue();
			};
			const cancel = () => {
				const index = queue.indexOf(start);
				if (index >= 0) queue.splice(index, 1);
				cleanup();
				reject(
					new PdfExportError(
						503,
						'Der PDF-Export ist ausgelastet oder wurde abgebrochen. Bitte versuche es erneut.'
					)
				);
			};
			const abort = cancel;
			const timer = setTimeout(cancel, PDF_RENDER_LIMITS.queueTimeoutMs);
			signal?.addEventListener('abort', abort, { once: true });
			queue.push(start);
		});
	} else active += 1;
	return () => {
		const next = queue.shift();
		if (next) next();
		else active -= 1;
	};
}

let verifiedCompiler: Promise<void> | undefined;
function verifyCompiler(binary: string, fonts: string): Promise<void> {
	return (verifiedCompiler ??= (async () => {
		try {
			await access(fonts);
			const { stdout } = await promisify(execFile)(binary, ['--version'], {
				timeout: 5_000,
				maxBuffer: 1024,
				env: compilerEnvironment()
			});
			if (!/^typst 0\.15\.1(?:\s|$)/.test(stdout)) throw new Error('version');
		} catch {
			verifiedCompiler = undefined;
			throw new PdfExportError(503, 'Der PDF-Export ist derzeit nicht verfügbar.');
		}
	})());
}

export async function renderPdf(model: PdfDocumentModel, signal?: AbortSignal): Promise<Buffer> {
	const input = JSON.stringify(model);
	if (Buffer.byteLength(input) > PDF_RENDER_LIMITS.inputBytes)
		throw new PdfExportError(413, 'Das Dokument ist für den PDF-Export zu komplex.');
	const release = await acquireSlot(signal);
	let directory: string | undefined;
	try {
		const binary = process.env.PDF_TYPST_BIN || resolve('var/tools/typst/bin/typst');
		const fonts = resolve('data/fonts/pdf');
		await verifyCompiler(binary, fonts);
		directory = await mkdtemp(join(tmpdir(), 'akribos-pdf-'));
		await Promise.all([
			writeFile(join(directory, 'document.json'), input, { mode: 0o600 }),
			writeFile(join(directory, 'document.typ'), template, { mode: 0o600 })
		]);
		return await runPdfCompiler(
			binary,
			[
				'compile',
				'--root',
				directory,
				'--font-path',
				fonts,
				'--ignore-system-fonts',
				'--package-path',
				directory,
				'--package-cache-path',
				directory,
				'--jobs',
				'1',
				'--creation-timestamp',
				'0',
				'--format',
				'pdf',
				'document.typ',
				'-'
			],
			directory,
			{ signal }
		);
	} finally {
		try {
			if (directory) await rm(directory, { recursive: true, force: true });
		} finally {
			release();
		}
	}
}
