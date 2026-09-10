// Presentazione storico-artistica sopra il viewer.
// Quando l'opera arriva dal DB di noesis-roads-creator porta già overview e opere simili
// (array simile al risultato del servizio AI): li mostriamo senza chiamate live.

function countWords(text) { return String(text || '').split(/\s+/).filter(Boolean).length; }

function SimThumb({ work }) {
  const [failed, setFailed] = React.useState(false);
  if (failed || !work.imageUrl) {
    return <div className="sim-ph-lg">🖼 immagine non disponibile</div>;
  }
  return <img className="sim-thumb-lg" src={work.imageUrl} alt="" loading="lazy" onError={function () { setFailed(true); }} />;
}

function ArtworkOverview({ artwork }) {
  const [activeTab, setActiveTab] = React.useState('overview');
  const [collapsed, setCollapsed] = React.useState(false);
  const trackRef = React.useRef(null);

  // Dati già pronti nell'oggetto opera (schema del DB di noesis-roads-creator)…
  const hasStoredOverview = Boolean(artwork.overview && artwork.overview.painting);
  const overview = hasStoredOverview ? artwork.overview : null;
  // …oppure, per retro-compatibilità, i campi del servizio AI in linea.
  const fallbackOverview = artwork.overviewService ? artwork.overviewService : null;
  const data = overview || fallbackOverview;
  const similarWorks = Array.isArray(artwork.similarWorks) ? artwork.similarWorks : [];
  const sources = (artwork.sources || []).filter(s => s && s.url);
  const disclaimer = hasStoredOverview
    ? 'Presentazione redatta nella scheda didattica di noesis-roads-creator (conoscenza del modello verificata in fase di pubblicazione).'
    : (fallbackOverview && fallbackOverview.disclaimer) || '';

  function scrollSim(dx) {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dx, behavior: 'smooth' });
  }

  const wordCount = data ? countWords(data.painting || data.content?.painting) + countWords(data.artist || data.content?.artist) : 0;
  const painting = data ? (data.painting || data.content?.painting || '') : '';
  const artistText = data ? (data.artist || data.content?.artist || '') : '';

  return (
    <section className="overview-block" aria-label="Presentazione storico-artistica dell’opera e dell’artista">
      <div className="overview-head">
        <div className="overview-heading">
          <span className="eyebrow">Per iniziare</span>
          <h2>L’opera e il suo autore</h2>
        </div>
        {data ? (
          <button className="overview-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? 'Mostra il contesto' : 'Nascondi il contesto'}
            <Icon name="chevron" size={15} />
          </button>
        ) : null}
      </div>

      <div className="overview-tabs" role="tablist" aria-label="Presentazione e opere simili">
        {[['overview', 'Presentazione'], ['similar', 'Opere simili']].map(tab => (
          <button
            key={tab[0]}
            type="button"
            role="tab"
            aria-selected={activeTab === tab[0]}
            className={'overview-tab' + (activeTab === tab[0] ? ' active' : '')}
            onClick={() => setActiveTab(tab[0])}
          >
            {tab[1]}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && !data && (
        <div className="overview-card overview-error" aria-live="polite">
          <Icon name="info" size={22} />
          <h3>Presentazione non disponibile</h3>
          <p>Questa scheda non ha ancora un testo introduttivo. Pubblica l’opera da noesis-roads-creator per vederlo qui.</p>
        </div>
      )}

      {activeTab === 'overview' && data && !collapsed && (
        <div className="overview-card overview-ready">
          <div className="overview-grid">
            {painting ? (
              <div className="overview-col">
                <h3>Il dipinto</h3>
                <p>{painting}</p>
              </div>
            ) : null}
            {artistText ? (
              <div className="overview-col">
                <h3>L’artista</h3>
                <p>{artistText}</p>
              </div>
            ) : null}
          </div>
          <div className="overview-foot">
            <span className="overview-count">{wordCount} parole</span>
            <div className="overview-sources">
              {sources.map(source => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} <Icon name="external" size={11} /></a>
              ))}
            </div>
          </div>
          {disclaimer ? <p className="overview-disclaimer">{disclaimer}</p> : null}
        </div>
      )}

      {activeTab === 'similar' && (
        <div className="overview-card overview-ready">
          {similarWorks.length === 0 ? (
            <p className="overview-loading">Nessuna opera simile nella scheda didattica.</p>
          ) : (
            <div className="sim-carousel">
              <button className="car-arrow" onClick={() => scrollSim(-340)} aria-label="Scorri indietro">‹</button>
              <div className="sim-track" ref={trackRef}>
                <div className="sim-track-inner">
                  {similarWorks.map(work => (
                    <figure className="sim-slide" key={String(work.title) + '-' + String(work.artist) + '-' + String(work.id || '')}>
                      {work.sourceUrl ? (
                        <a href={work.sourceUrl} target="_blank" rel="noreferrer"><SimThumb work={work} /></a>
                      ) : (
                        <SimThumb work={work} />
                      )}
                      <figcaption>
                        <strong>{work.title}</strong>
                        {work.artist ? <span>{work.artist}{work.date ? ' · ' + work.date : ''}</span> : null}
                        {work.museum ? <small>{work.museum}</small> : null}
                        {work.caption ? <p>{work.caption}</p> : null}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
              <button className="car-arrow" onClick={() => scrollSim(340)} aria-label="Scorri avanti">›</button>
            </div>
          )}
          <p className="overview-disclaimer">Opere con lo stesso soggetto nella storia dell’arte, selezionate nella scheda didattica. Immagini in pubblico dominio (Wikimedia Commons / MET).</p>
        </div>
      )}
    </section>
  );
}
