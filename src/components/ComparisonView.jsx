// Scheda "Faccia a faccia" letta dal DB (noesis-roads-creator): due opere affiancate,
// punti in comune, differenze, tecnica/contesto/critica/curiosità a confronto.

function countWords(text) { return String(text || '').split(/\s+/).filter(Boolean).length; }

function SideImage({ side }) {
  const [failed, setFailed] = React.useState(false);
  if (failed || !side.imageUrl) {
    return <div className="cmp-side-ph">🖼 immagine non disponibile</div>;
  }
  return <img src={side.imageUrl} alt={side.title || 'Opera'} loading="lazy" onError={function () { setFailed(true); }} />;
}

function ComparisonView({ comparison, onBack }) {
  const [fontScale, setFontScale] = React.useState(1);
  const sides = Array.isArray(comparison.sides) ? comparison.sides : [];
  const sideA = sides.find(function (s) { return s.side === 'a'; }) || {};
  const sideB = sides.find(function (s) { return s.side === 'b'; }) || {};
  const points = Array.isArray(comparison.points) ? comparison.points : [];
  const similar = points.filter(function (p) { return p.kind === 'similar'; });
  const different = points.filter(function (p) { return p.kind === 'different'; });
  const contentStyle = { fontSize: (12 * fontScale) + 'px', lineHeight: 1.75 };
  const wordCount = countWords(comparison.intro) + countWords(comparison.technique) + countWords(comparison.context) + countWords(comparison.critique) + countWords(comparison.curiosities);

  return (
    <main className="explore-page">
      <header className="explore-header">
        <div className="explore-header-left">
          <a href="#" className="brand" onClick={(event) => { event.preventDefault(); onBack(); }} aria-label="Torna alla collezione"><span className="brand-mark"><i></i><i></i><i></i></span><span>leggi l’<strong>opera</strong></span></a>
          <button className="config-button hub-button" onClick={() => { location.href = hubUrl(); }} title="Torna all’hub di Noesis Roads"><span>←</span> Hub</button>
        </div>
        <div className="explore-progress"><span>03</span><i></i><span>Faccia a faccia</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="back-button" href={'/api/comparisons/' + encodeURIComponent(comparison.id) + '/pdf'} title="Scarica il PDF libro d'arte">⬇ PDF</a>
          <button className="back-button" onClick={onBack}><span className="back-icon">←</span> Torna alla collezione</button>
        </div>
      </header>
      <section className="explore-intro">
        <div>
          <span className="eyebrow">{comparison.comparisonType === 'same-artist' ? 'Stesso artista, fasi diverse' : 'Stesso soggetto, artisti diversi'}</span>
          <h1>{comparison.title || 'Faccia a faccia'}</h1>
          <p>{sideA.title ? sideA.title + (sideA.artist ? ' — ' + sideA.artist : '') : ''} · {sideB.title ? sideB.title + (sideB.artist ? ' — ' + sideB.artist : '') : ''}</p>
        </div>
        <div className="explore-tag"><Icon name="sparkle" size={15} /> Confronto critico dalla scheda didattica</div>
      </section>

      <section className="overview-block" aria-label="Le due opere">
        <div className="overview-head">
          <div className="overview-heading"><span className="eyebrow">A colpo d’occhio</span><h2>Le due opere</h2></div>
          <div className="font-controls" style={{ alignSelf: 'flex-start' }}>
            <span className="font-label">A</span>
            <button type="button" className="font-btn" disabled={fontScale <= 0.8} onClick={() => setFontScale(fontScale - 0.1)} aria-label="Riduci testo">−</button>
            <span className="font-value">{Math.round(fontScale * 100)}%</span>
            <button type="button" className="font-btn" disabled={fontScale >= 1.5} onClick={() => setFontScale(fontScale + 0.1)} aria-label="Aumenta testo">+</button>
          </div>
        </div>
        <div className="overview-card overview-ready">
          <div className="cmp-sides">
            {[{ side: sideA, letter: 'A' }, { side: sideB, letter: 'B' }].map(function (entry) {
              const s = entry.side;
              return (
                <div className="cmp-side" key={entry.letter}>
                  <div className="cmp-side-img"><SideImage side={s} /><span className="cmp-side-letter">{entry.letter}</span></div>
                  <div className="cmp-side-copy">
                    <span className="eyebrow">Opera {entry.letter}</span>
                    <h3>{s.title || 'Opera senza titolo'}</h3>
                    {s.artist ? <p>{s.artist}{s.date ? ' · ' + s.date : ''}</p> : null}
                    {s.museum ? <p className="muted">{s.museum}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {comparison.intro && (
        <section className="overview-block" aria-label="Introduzione al confronto">
          <div className="overview-head"><div className="overview-heading"><span className="eyebrow">Perché</span><h2>Introduzione al confronto</h2></div></div>
          <div className="overview-card overview-ready"><div className="overview-col"><p style={contentStyle}>{comparison.intro}</p></div></div>
        </section>
      )}

      {(similar.length > 0 || different.length > 0) && (
        <section className="overview-block" aria-label="Punti in comune e differenze">
          <div className="overview-head"><div className="overview-heading"><span className="eyebrow">Il confronto</span><h2>Punti in comune e differenze</h2></div></div>
          <div className="overview-grid">
            {similar.length > 0 && (
              <div className="overview-card overview-ready">
                <h3 className="pt-heading similar">Punti in comune</h3>
                {similar.map(function (p, index) {
                  return (
                    <div className="pt-item" key={'sim-' + index}>
                      <strong>{p.title}</strong>
                      <p style={contentStyle}>{p.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {different.length > 0 && (
              <div className="overview-card overview-ready">
                <h3 className="pt-heading different">Differenze</h3>
                {different.map(function (p, index) {
                  return (
                    <div className="pt-item" key={'dif-' + index}>
                      <strong>{p.title}</strong>
                      <p style={contentStyle}>{p.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {(comparison.technique || comparison.context || comparison.critique || comparison.curiosities) && (
        <section className="overview-block" aria-label="Analisi">
          <div className="overview-head"><div className="overview-heading"><span className="eyebrow">In profondità</span><h2>Analisi del confronto</h2></div></div>
          <div className="overview-card overview-ready">
            <div className="overview-grid">
              {comparison.technique ? <div className="overview-col"><h3>Tecnica a confronto</h3><p style={contentStyle}>{comparison.technique}</p></div> : null}
              {comparison.context ? <div className="overview-col"><h3>Contesto storico-artistico</h3><p style={contentStyle}>{comparison.context}</p></div> : null}
              {comparison.critique ? <div className="overview-col"><h3>Interpretazione critica</h3><p style={contentStyle}>{comparison.critique}</p></div> : null}
              {comparison.curiosities ? <div className="overview-col"><h3>Curiosità</h3><p style={contentStyle}>{comparison.curiosities}</p></div> : null}
            </div>
            <div className="overview-foot"><span className="overview-count">{wordCount} parole</span></div>
            <p className="overview-disclaimer">Scheda di confronto generata con intelligenza artificiale (noesis-roads-creator) e verificata in fase di pubblicazione.</p>
          </div>
        </section>
      )}
    </main>
  );
}