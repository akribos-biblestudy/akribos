import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { tutorialVideos } from '../src/lib/tutorial-videos';

test('the production build serves every tutorial asset', async ({ request }) => {
	test.skip(
		!process.env.CI && !existsSync('static/videos/folge-01.mp4'),
		'Run scripts/install-tutorial-videos.sh to test tutorial assets locally.'
	);

	for (const episode of Object.keys(tutorialVideos)) {
		const path = `/videos/folge-${episode.padStart(2, '0')}`;
		const [video, poster, captions] = await Promise.all([
			request.get(`${path}.mp4`, { headers: { range: 'bytes=0-31' } }),
			request.get(`${path}.webp`),
			request.get(`${path}.vtt`)
		]);

		expect(video.status(), path).toBe(206);
		expect(video.headers()['content-type'], path).toMatch(/^video\/mp4\b/);
		expect(video.headers()['content-range'], path).toMatch(/^bytes 0-31\/\d+$/);
		expect((await video.body()).length, path).toBe(32);
		expect(poster.ok(), path).toBe(true);
		expect(poster.headers()['content-type'], path).toMatch(/^image\/webp\b/);
		expect(captions.ok(), path).toBe(true);
		expect(captions.headers()['content-type'], path).toMatch(/^text\/vtt\b/);
		expect(await captions.text(), path).toMatch(/^WEBVTT/);
	}
});
