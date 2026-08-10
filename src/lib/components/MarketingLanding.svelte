<script lang="ts">
	import './marketing-landing.css';

	const searches = [
		['liebe', 'findet auch „lieben“, „liebt“ und „Liebe“'],
		['"am Anfang"', 'findet genau diese Wortfolge'],
		['gnade -gesetz', 'findet Gnade, schließt Gesetz aus']
	];
</script>

<svelte:head>
	<title>Akribos — Bibel lesen. Tiefer verstehen.</title>
	<meta
		name="description"
		content="Akribos verbindet parallele Bibelübersetzungen, Kommentare, Strong-Lexikon, Urtextanalyse, Suche, Notizen und Verslisten in einem modernen Bibelstudium."
	/>
</svelte:head>

<div class="landing">
	<header class="topbar">
		<a class="brand" href="/" aria-label="Akribos – zum Bibelleser">
			<img src="/icon.png" alt="" /><span>Akribos</span>
		</a>
		<nav aria-label="Landingpage-Navigation">
			<a href="#entdecken">Entdecken</a><a href="#studieren">Studieren</a><a href="#merken"
				>Organisieren</a
			>
		</nav>
		<a class="nav-cta" href="/Johannes3">Jetzt lesen <span>↗</span></a>
	</header>

	<main>
		<section class="hero">
			<div class="hero-image" aria-hidden="true"></div>
			<div class="hero-shade" aria-hidden="true"></div>
			<div class="hero-grid" aria-hidden="true"></div>
			<div class="hero-content">
				<p class="eyebrow"><span></span>Bibelstudium, neu gedacht</p>
				<h1>Lies den Text.<br /><em>Entdecke die Tiefe.</em></h1>
				<p class="hero-copy">
					Mehrere Übersetzungen, der griechische und hebräische Urtext und deine eigenen Gedanken —
					verbunden in einem ruhigen Arbeitsraum für sorgfältiges Bibelstudium.
				</p>
				<div class="actions">
					<a class="button primary hero-cta" href="/Johannes3">Jetzt lesen <span>→</span></a>
					<a class="button ghost" href="#entdecken">Akribos entdecken</a>
				</div>
				<div class="proof">
					<span><i>✓</i> Ohne Installation</span><span><i>✓</i> Ohne Werbung</span><span
						><i>✓</i> Kostenloses Konto</span
					>
				</div>
			</div>
			<div class="name-note">
				<b>ἀκριβῶς</b><i></i>
				<p><strong>akribōs</strong><br />sorgfältig · genau · gründlich</p>
			</div>
		</section>

		<section class="reader section" id="entdecken">
			<p class="kicker">Ein Text. Viele Perspektiven.</p>
			<div class="split-heading">
				<h2>Alles, was du brauchst,<br /><em>ohne den Blick zu verlieren.</em></h2>
				<p>
					Akribos bringt Lesen und Forschen zusammen. Keine Fensterflut, kein Springen zwischen
					Werkzeugen — deine Quellen bleiben genau dort, wo du liest.
				</p>
			</div>

			<figure class="product-shot reader-shot">
				<img
					src="/landing/reader.webp"
					alt="Akribos-Reader mit zwei parallel geöffneten Bibelübersetzungen"
					width="1440"
					height="900"
					loading="lazy"
					decoding="async"
				/>
				<figcaption>
					Der echte Akribos-Reader: zwei Übersetzungen, synchron am selben Vers.
				</figcaption>
			</figure>

			<div class="benefits">
				<div>
					<span>01</span>
					<h3>Parallel lesen</h3>
					<p>Übersetzungen, Kommentare und Verweisstellen direkt nebeneinander.</p>
				</div>
				<div>
					<span>02</span>
					<h3>Verse synchron halten</h3>
					<p>Zeilengenau ausgerichtet oder als frei scrollender Fließtext.</p>
				</div>
				<div>
					<span>03</span>
					<h3>Einfach weiterlesen</h3>
					<p>Kapitel laden nahtlos nach. Deine Leseposition bleibt erhalten.</p>
				</div>
			</div>
		</section>

		<section class="study" id="studieren">
			<div class="study-copy">
				<p class="kicker light">Vom Wort zur Bedeutung</p>
				<h2>Der Urtext ist<br /><em>nur einen Klick entfernt.</em></h2>
				<p class="lead">
					Klicke auf ein markiertes Wort und verfolge es bis ins Griechische oder Hebräische.
					Akribos macht Sprachwissen zugänglich, ohne es zu vereinfachen.
				</p>
				<ol>
					<li>
						<span>01</span>
						<div>
							<strong>Form wirklich verstehen</strong><small
								>Originalwort, Aussprache, Umschrift, Grundform und Grammatik im Vers.</small
							>
						</div>
					</li>
					<li>
						<span>02</span>
						<div>
							<strong>Jede Verwendung sehen</strong><small
								>Alle Vorkommen derselben Strong-Nummer im biblischen Kontext.</small
							>
						</div>
					</li>
					<li>
						<span>03</span>
						<div>
							<strong>Übersetzungen durchschauen</strong><small
								>Erkenne, mit welchen deutschen Wörtern ein Begriff wiedergegeben wird.</small
							>
						</div>
					</li>
				</ol>
			</div>

			<figure class="product-shot study-shot">
				<img
					src="/landing/strong-study.webp"
					alt="Geöffnete Strong-Seitenleiste im Akribos-Reader"
					width="1440"
					height="900"
					loading="lazy"
					decoding="async"
				/>
				<figcaption>Ein echter Strong-Eintrag mit Bedeutung, Übersetzung und Vorkommen.</figcaption>
			</figure>
		</section>

		<section class="search section">
			<div class="search-demo">
				<header><span>⌕</span> Suche in allen Übersetzungen</header>
				{#each searches as example, index (example[0])}
					<div class:active={index === 1} class="search-row">
						<code>{example[0]}</code><span>{example[1]}</span>
					</div>
				{/each}
				<div class="result">
					<small>Johannes 1,1</small>
					<p><mark>Im Anfang</mark> war das Wort, und das Wort war bei Gott …</p>
				</div>
			</div>
			<div class="search-copy">
				<p class="kicker">Finden, was du suchst</p>
				<h2>Eine Suche, die<br /><em>deine Sprache versteht.</em></h2>
				<p>
					Suche nach Wortstämmen, mehreren Begriffen oder exakten Wortfolgen. Schließe Wörter aus,
					filtere nach Buch und vergleiche Treffer über Übersetzungen hinweg.
				</p>
				<a href="/search?q=liebe">Suche ausprobieren <span>→</span></a>
			</div>
		</section>

		<section class="organize section" id="merken">
			<p class="kicker center">Dein Studium. Deine Spuren.</p>
			<h2>Vom Lesen zum <em>Weiterdenken.</em></h2>
			<p class="center-copy">Halte fest, was dir wichtig wird — direkt dort, wo du es entdeckst.</p>
			<figure class="product-shot menu-shot">
				<img
					src="/landing/verse-menu.webp"
					alt="Geöffnetes Versmenü im Akribos-Reader mit Markierungen, Kommentaren und Verslisten"
					width="1440"
					height="900"
					loading="lazy"
					decoding="async"
				/>
				<figcaption>Das echte Versmenü bündelt Markierungen, Kommentare und Verslisten.</figcaption>
			</figure>
			<div class="feature-grid">
				<article class="highlights">
					<span>Highlights</span>
					<h3>Gedanken sichtbar machen</h3>
					<p>
						Markiere Verse mit eigenen Farben und finde deine Hervorhebungen gesammelt im Konto
						wieder.
					</p>
				</article>
				<article class="notes">
					<div class="round-icon">✎</div>
					<span>Notizen</span>
					<h3>Direkt am Vers notieren</h3>
					<p>
						Private Kommentare bleiben mit Vers und Übersetzung verbunden — sicher und jederzeit
						griffbereit.
					</p>
				</article>
				<article class="lists">
					<div class="round-icon">☆</div>
					<span>Verslisten</span>
					<h3>Sammeln & teilen</h3>
					<p>
						Ordne Verse nach Thema, ergänze Notizen und teile ausgewählte Listen per Link — auch
						ohne Konto.
					</p>
				</article>
				<article class="personal">
					<span>Dein Leseraum</span>
					<h3>So lesen, wie es für dich passt</h3>
					<p>
						Schriftgröße, Hell- oder Dunkelmodus, Quellen und Spalten merkt sich Akribos für den
						nächsten Besuch.
					</p>
				</article>
			</div>
		</section>

		<section class="api">
			<div class="api-copy">
				<span class="code-mark">&#123; &#125;</span>
				<div>
					<p class="kicker light">Offen für neue Ideen</p>
					<h2>Auch für deine Projekte.</h2>
					<p>
						Die öffentliche API liefert Bibeltexte, Ressourcen, Suche und Strong-Lexikon. Mit
						persönlichem Schlüssel erreichst du auch deine Listen und Notizen.
					</p>
				</div>
			</div>
			<div class="code">
				<header><i></i><i></i><i></i><span>Strong-Lexikon abfragen</span></header>
				<pre><code>curl /api/v1/strong/G3056</code></pre>
			</div>
			<a href="/api">API entdecken <span>↗</span></a>
		</section>

		<section class="final">
			<div class="orbit one"></div>
			<div class="orbit two"></div>
			<img src="/icon.png" alt="" />
			<p class="kicker light center">Bereit für den nächsten Vers?</p>
			<h2>Lies nicht nur weiter.<br /><em>Sieh genauer hin.</em></h2>
			<p>Öffne Akribos und beginne dort, wo du gerade bist.</p>
			<div class="actions centered">
				<a class="button primary" href="/Johannes3">Jetzt Bibel lesen <span>→</span></a>
				<a class="button ghost" href="/register">Kostenlos registrieren</a>
			</div>
		</section>
	</main>

	<footer>
		<a class="brand" href="/"><img src="/icon.png" alt="" /><span>Akribos</span></a>
		<p>Sorgfältig lesen. Gründlich verstehen.</p>
		<nav>
			<a href="/help">Hilfe</a><a href="/api">API</a><a href="/impressum">Impressum</a><a
				href="/datenschutz">Datenschutz</a
			>
		</nav>
	</footer>
</div>
