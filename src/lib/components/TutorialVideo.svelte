<script lang="ts">
	import { tick } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { tutorialVideos } from '$lib/tutorial-videos';

	let {
		episode,
		eager = false,
		class: className = ''
	}: { episode: number; eager?: boolean; class?: string } = $props();

	const mediaBase = env.PUBLIC_TUTORIAL_VIDEO_BASE_URL?.replace(/\/+$/, '') || '/videos';
	let tutorial = $derived(tutorialVideos[episode]);
	let mediaPath = $derived(`${mediaBase}/folge-${String(episode).padStart(2, '0')}`);
	let started = $state(false);
	let failed = $state(false);
	let player = $state<HTMLVideoElement>();

	async function startVideo(event: SubmitEvent) {
		event.preventDefault();
		started = true;
		await tick();
		player?.focus();
		// Keep the native play button available if the browser blocks script-initiated playback.
		void player?.play().catch(() => undefined);
	}
</script>

{#if tutorial}
	<div class={`tutorial-player ${className}`}>
		{#if started}
			<video
				bind:this={player}
				aria-label={tutorial.title}
				controls
				playsinline
				crossorigin="anonymous"
				preload="metadata"
				poster={`${mediaPath}.webp`}
				src={`${mediaPath}.mp4`}
				onerror={() => (failed = true)}
			>
				<track kind="captions" srclang="de" label="Deutsch" src={`${mediaPath}.vtt`} />
			</video>
			{#if failed}
				<div class="playback-error" role="status">
					<p>Das Video konnte nicht geladen werden.</p>
					<a href={`${mediaPath}.mp4`}>Videodatei öffnen</a>
				</div>
			{/if}
		{:else}
			<form action={`${mediaPath}.mp4`} onsubmit={startVideo}>
				<button type="submit" class="play-poster" aria-label={`Video abspielen: ${tutorial.title}`}>
					<img
						alt=""
						width="1280"
						height="720"
						loading={eager ? 'eager' : 'lazy'}
						src={`${mediaPath}.webp`}
					/>
					<span class="play-icon" aria-hidden="true"></span>
					<span class="duration" aria-hidden="true">{tutorial.duration}</span>
				</button>
			</form>
		{/if}
	</div>
{/if}

<style>
	.tutorial-player {
		position: relative;
		isolation: isolate;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: var(--tutorial-radius, 0.75rem);
		background: #10291e;
		color: #fff;
	}

	video,
	form,
	.play-poster,
	.play-poster img {
		display: block;
		width: 100%;
		height: 100%;
	}

	.play-poster {
		position: relative;
		border: 0;
		padding: 0;
		background: none;
		color: inherit;
		cursor: pointer;
	}

	.play-poster img {
		object-fit: cover;
	}

	.play-poster:focus-visible {
		outline: none;
	}

	.play-poster:focus-visible::after {
		position: absolute;
		inset: 0;
		border: 4px solid #caefaa;
		border-radius: inherit;
		content: '';
		pointer-events: none;
	}

	.play-icon {
		position: absolute;
		inset: 50% auto auto 50%;
		display: grid;
		width: clamp(2.75rem, 12%, 4.75rem);
		aspect-ratio: 1;
		place-items: center;
		transform: translate(-50%, -50%);
		border: 1px solid #f5ffe0;
		border-radius: 50%;
		background: #ddf5b5;
		box-shadow:
			0 0 0 0.45rem #0d241c55,
			0 0.35rem 1.5rem #091d15a6;
		color: #163624;
		transition:
			background 160ms ease,
			transform 160ms ease;
	}

	.play-icon::after {
		width: 26%;
		height: 29%;
		margin-inline-start: 6%;
		background: currentColor;
		clip-path: polygon(0 0, 100% 50%, 0 100%);
		content: '';
	}

	.play-poster:hover .play-icon,
	.play-poster:focus-visible .play-icon {
		transform: translate(-50%, -50%) scale(1.08);
		background: #f0ffda;
	}

	.duration {
		position: absolute;
		right: 0.65rem;
		bottom: 0.65rem;
		border-radius: 0.35rem;
		padding: 0.2rem 0.45rem;
		background: #122a20e6;
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}

	.playback-error {
		position: absolute;
		inset: 0;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 0.6rem;
		padding: 1rem;
		background: #10291e;
		text-align: center;
	}

	.playback-error a {
		color: #ddf5b5;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	@media (prefers-reduced-motion: reduce) {
		.play-icon {
			transition: none;
		}
	}
</style>
