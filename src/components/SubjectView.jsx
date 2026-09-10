// Scheda "Soggetto nella storia dell'arte" letta dal DB (noesis-roads-creator).
// Sezioni: introduzione/origini, timeline dei capitoli, galleria opere, simboli,
// interpretazioni, curiosità — con comandi A+/A− come nel resto dell'app.

function countWords(text) { return String(text || '').split(/\s+/).filter(Boolean).length; }

function WorkThumb({ work }) {
  const [failed, setFailed] = React.useState(false);
  if (failed || !work.imageUrl) {
    return <div className="sim-ph-lg">{work.imageStatus === 'failed' ? '⚠ immagine non disponibile' : '🖼 immagine non disponibile'}</div>;
  }
  return <img className="sim-thumb-lg" src={work.imageUrl} alt="" loading="lazy" onError={function () { setFailed(true); }} />;
}

function FontControls({ scale, onChange }) {
  return (
    <div className="font-controls" style={{ alignSelf: 'flex-start' }}>
      <span className="font-label">A</span>
      <button type="button" className="font-btn" disabled={scale <= 0.8} onClick={() => onChange(scale - 0.1)} aria-label="Riduci testo">−</button>
      <span className="font-value">{Math.round(scale * 100)}%</span>
      <button type="button" className="font-btn" disabled={scale >= 1.5} onClick={() => onChange(scale + 0.1)} aria-label="Aumenta testo">+</button>
    </div>
  );
}

function SubjectView({ subject, onBack }) {
  const [fontScale, setFontScale] = React.useState(1);
  const trackRef = React.useRef(null);
  const chapters = Array.isArray(subject.chapters) ? subject.chapters : [];
  const works = Array.isArray(subject.works) ? subject.works : [];
  const symbols = Array.isArray(subject.symbols) ? subject.symbols : [];
  const contentStyle = { fontSize: (12 * fontScale) + 'px', lineHeight: 1.75 };

  function scrollSim(dx) {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dx, behavior: 'smooth' });
  }

  return (
    <main className="explore-page">
      <header className="explore-header">
        <div className="explore-header-left">
          <a href="#" className="brand" onClick={(event) => { event.preventDefault(); onBack(); }} aria-label="Torna alla collezione"><span className="brand-mark"><i></i><i></i><i></i></span><span>leggi l’<strong>opera</strong></span></a>
          <button className="config-button hub-button" onClick={() => { location.href = hubUrl(); }} title="Torna all’hub di Noesis Roads"><span>←</span> Hub</button>
        </div>
        <div className="explore-progress"><span>02</span><i></i><span>Il soggetto nella storia dell’arte</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="back-button" href={'/api/subjects/' + encodeURIComponent(subject.id) + '/pdf'} title="Scarica il PDF libro d'arte">⬇ PDF</a>
          <button className="back-button" onClick={onBack}><span className="back-icon">←</span> Torna alla collezione</button>
        </div>
      </header>
      <section className="explore-intro">
        <div>
          <span className="eyebrow">{subject.period || 'Soggetto nella storia dell’arte'}</span>
          <h1>{subject.name}</h1>
          <p>{subject.shortDesc}</p>
        </div>
        <div className="explore-tag"><Icon name="sparkle" size={15} /> Scheda monografica dal database didattico</div>
      </section>

      <section className="overview-block" aria-label="Introduzione e origini del soggetto">
        <div className="overview-head">
          <div className="overview-heading">
            <span className="eyebrow">Per iniziare</span>
            <h2>Il soggetto nella storia</h2>
          </div>
          <FontControls scale={fontScale} onChange={setFontScale} />
        </div>
        {(subject.intro || subject.origins) ? (
          <div className="overview-card overview-ready">
            <div className="overview-grid">
              {subject.intro ? (
                <div className="overview-col"><h3>Introduzione al soggetto</h3><p style={contentStyle}>{subject.intro}</p></div>
              ) : null}
              {subject.origins ? (
                <div className="overview-col"><h3>Origini e fonti iconografiche</h3><p style={contentStyle}>{subject.origins}</p></div>
              ) : null}
            </div>
            <div className="overview-foot"><span className="overview-count">{countWords(subject.intro) + countWords(subject.origins)} parole</span></div>
            <p className="overview-disclaimer">Scheda didattica generata con intelligenza artificiale (noesis-roads-creator) e verificata in fase di pubblicazione.</p>
          </div>
        ) : (
          <div className="overview-card overview-error"><Icon name="info" size={22} /><h3>Contenuti non ancora generati</h3><p>Pubblica la scheda del soggetto da noesis-roads-creator per vedere qui l’evoluzione del soggetto.</p></div>
        )}
      </section>

      {chapters.length > 0 && (
        <section className="overview-block" aria-label="Evoluzione per epoche">
          <div className="overview-head">
            <div className="overview-heading"><span className="eyebrow">Nel tempo</span><h2>L’evoluzione per epoche</h2></div>
          </div>
          <div className="overview-card overview-ready">
            <div className="subject-timeline">
              {chapters.map(function (c, index) {
                return (
                  <div className="tl-item" key={index}>
                    <span className="tl-dot"></span>
                    <h3>{c.era}</h3>
                    <p style={contentStyle}>{c.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {works.length > 0 && (
        <section className="overview-block" aria-label="Opere rappresentative">
          <div className="overview-head">
            <div className="overview-heading"><span className="eyebrow">Le opere</span><h2>Opere rappresentative</h2></div>
          </div>
          <div className="overview-card overview-ready">
            <div className="sim-carousel">
              <button className="car-arrow" onClick={() => scrollSim(-360)} aria-label="Scorri indietro">‹</button>
              <div className="sim-track" ref={trackRef}>
                <div className="sim-track-inner">
                  {works.map(function (work) {
                    return (
                      <figure className="sim-slide" key={String(work.title) + '-' + String(work.artist) + '-' + String(work.id || '')}>
                        {work.sourceUrl ? <a href={work.sourceUrl} target="_blank" rel="noreferrer"><WorkThumb work={work} /></a> : <WorkThumb work={work} />}
                        <figcaption>
                          <strong>{work.title}</strong>
                          {work.artist ? <span>{work.artist}{work.date ? ' · ' + work.date : ''}</span> : null}
                          {work.museum ? <small>{work.museum}</small> : null}
                          {work.caption ? <p style={{ fontSize: (11 * fontScale) + 'px', lineHeight: 1.5 }}>{work.caption}</p> : null}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </div>
              <button className="car-arrow" onClick={() => scrollSim(360)} aria-label="Scorri avanti">›</button>
            </div>
            <p className="overview-disclaimer">Opere che rappresentano questo soggetto nella storia dell’arte, selezionate nella scheda didattica. Immagini in pubblico dominio (Wikimedia Commons / MET).</p>
          </div>
        </section>
      )}

      {symbols.length > 0 && (
        <section className="overview-block" aria-label="Attributi e simboli ricorrenti">
          <div className="overview-head">
            <div className="overview-heading"><span className="eyebrow">Il lessico</span><h2>Attributi e simboli ricorrenti</h2></div>
          </div>
          <div className="overview-card overview-ready">
            <div className="symbol-def">
              {symbols.map(function (sym, index) {
                return (
                  <div className="sym-def-item" key={index}>
                    <strong>{sym.symbol}</strong>
                    <span style={contentStyle}>{sym.meaning}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {(subject.interpretations || subject.curiosities) && (
        <section className="overview-block" aria-label="Interpretazioni e curiosità">
          <div className="overview-head">
            <div className="overview-heading"><span className="eyebrow">Approfondire</span><h2>Interpretazioni e curiosità</h2></div>
          </div>
          <div className="overview-card overview-ready">
            <div className="overview-grid">
              {subject.interpretations ? (
                <div className="overview-col"><h3>Interpretazioni e varianti</h3><p style={contentStyle}>{subject.interpretations}</p></div>
              ) : null}
              {subject.curiosities ? (
                <div className="overview-col"><h3>Curiosità e questioni aperte</h3><p style={contentStyle}>{subject.curiosities}</p></div>
              ) : null}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}