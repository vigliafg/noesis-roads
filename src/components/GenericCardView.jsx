// Noesis Roads — viewer generico guidato dallo schema (cfr. docs/ARCHITECTURE.md).
// Un solo renderer per qualunque materia/modello: intestazione + sezioni
// nell'ordine del modello, ciascuna via SectionBlock per tipo-sezione.
// Le viste custom arte restano come renderer d'esempio.

function GenericCardView({ card, onBack }) {
  const [fontScale, setFontScale] = React.useState(1);
  const schema = (card.modello && card.modello.schema) || {};
  const sections = Array.isArray(schema.sections) ? schema.sections : [];
  const corpi = {};
  (Array.isArray(card.sezioni) ? card.sezioni : []).forEach(function (s) { corpi[s.chiave] = s.corpo || {}; });
  const immagini = Array.isArray(card.immagini) ? card.immagini : [];
  const imgKeys = sections.filter(function (d) { return d.type === 'image'; }).map(function (d) { return d.key; });
  const cover = immagini.find(function (m) { return imgKeys.indexOf(m.ruolo) >= 0; }) || immagini[0] || null;
  const heroRole = (schema.cover && schema.cover.heroRole) || 'hero';
  const coverStyle = heroRole === 'ritratto'
    ? { maxWidth: 340, margin: '0 auto 8px' }
    : heroRole === 'thumb' ? { maxWidth: 520, margin: '0 auto 8px' } : { maxWidth: 860, margin: '0 auto 8px' };
  const eyebrow = (schema.cover && schema.cover.eyebrow) || 'Scheda didattica';
  const subtitle = [schema.subject, schema.name].filter(Boolean).join(' · ');
  const lvlLabel = function (v, i) {
    const vv = { essenziale: 'Essenziale', standard: 'Standard', approfondita: 'Approfondita' }[v] || v;
    const ii = { primaria: 'Primaria', secondaria: 'Secondaria', universita: 'Università' }[i] || i;
    return vv + ' · ' + ii;
  };
  const timbri = {};
  (Array.isArray(card.sezioni) ? card.sezioni : []).forEach(function (s) {
    if (s.verbosita || s.istruzione) timbri[s.chiave] = lvlLabel(s.verbosita || card.verbosita, s.istruzione || card.istruzione);
  });

  return (
    <main className="explore-page">
      <header className="explore-header">
        <div className="explore-header-left">
          <a href="#" className="brand" onClick={(event) => { event.preventDefault(); onBack(); }} aria-label="Torna al catalogo"><span className="brand-mark"><i></i><i></i><i></i></span><span>Noesis <strong>Roads</strong></span></a>
          <button className="config-button hub-button" onClick={() => { location.href = hubUrl(); }} title="Torna all’hub di Noesis Roads"><span>←</span> Hub</button>
        </div>
        <div className="explore-progress"><span>02</span><i></i><span>{subtitle}</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="back-button" href={'/api/cards/' + encodeURIComponent(card.id) + '/pdf'} title="Scarica la scheda in PDF">⬇ PDF</a>
          <button className="back-button" onClick={onBack}><span className="back-icon">←</span> Torna al catalogo</button>
        </div>
      </header>
      <section className="explore-intro">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{card.titolo}</h1>
          <p>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div className="explore-tag"><Icon name="sparkle" size={15} /> Scheda didattica dal database</div>
          {(card.verbosita || card.istruzione) && (
            <div className="explore-tag" title="Livelli scelti in testata alla creazione">Livelli: {lvlLabel(card.verbosita, card.istruzione)}</div>
          )}
        </div>
      </section>
      {cover && cover.url ? (
        <section className="overview-block" aria-label="Immagine di copertina">
          <figure className="generic-figure" style={coverStyle}>
            <img src={cover.url} alt={card.titolo} loading="lazy" style={{ width: '100%', borderRadius: 12 }} />
          </figure>
        </section>
      ) : null}
      {sections.map(function (def) {
        return (
          <section className="overview-block" aria-label={def.title} key={def.key}>
            <div className="overview-head">
              <div className="overview-heading"><span className="eyebrow">{subtitle}</span><h2>{def.title}</h2>
                {timbri[def.key] && <span className="type-tag" title="Livelli di generazione della sezione">AI · {timbri[def.key]}</span>}
              </div>
              <div className="font-controls" style={{ alignSelf: 'flex-start' }}>
                <span className="font-label">A</span>
                <button type="button" className="font-btn" disabled={fontScale <= 0.8} onClick={() => setFontScale(fontScale - 0.1)} aria-label="Riduci testo">−</button>
                <span className="font-value">{Math.round(fontScale * 100)}%</span>
                <button type="button" className="font-btn" disabled={fontScale >= 1.5} onClick={() => setFontScale(fontScale + 0.1)} aria-label="Aumenta testo">+</button>
              </div>
            </div>
            <div className="overview-card overview-ready">
              <SectionBlock def={def} corpo={corpi[def.key]} immagini={immagini} fontScale={fontScale} />
            </div>
          </section>
        );
      })}
      <p className="overview-disclaimer">Scheda didattica generata con intelligenza artificiale (noesis-roads-creator) e verificata in fase di pubblicazione.</p>
    </main>
  );
}
