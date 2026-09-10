// Pannello di lettura per i contenuti STORED (scheda didattica salvata nel DB di noesis-roads-creator).
// Mostra le sezioni della tab attiva senza chiamate live: le due tab ("Studio del dettaglio"
// e "Approfondimento") sono popolate dai campi corrispondenti del DB.
var LEVELS = ['Scuola secondaria', 'Approfondimento'];
var LEVEL_TITLES = { 'Scuola secondaria': 'Studio del dettaglio', 'Approfondimento': 'Approfondimento' };
var FONT_MIN = 80;
var FONT_MAX = 180;
var FONT_STEP = 10;
var BASE_TEXT = 12;

function clampFont(value) { return Math.max(FONT_MIN, Math.min(FONT_MAX, value)); }

function FontControls({ value, onChange }) {
  return (
    <div className="font-controls" role="group" aria-label="Dimensione del testo">
      <span className="font-label">A</span>
      <button type="button" className="font-btn" aria-label="Riduci la dimensione del testo" onClick={() => onChange(clampFont(value - FONT_STEP))} disabled={value <= FONT_MIN}>−</button>
      <span className="font-value" aria-live="polite">{value}%</span>
      <button type="button" className="font-btn" aria-label="Aumenta la dimensione del testo" onClick={() => onChange(clampFont(value + FONT_STEP))} disabled={value >= FONT_MAX}>+</button>
    </div>
  );
}

function StoredSection({ label, text, textScale, accent }) {
  if (!text || !String(text).trim()) return null;
  return (
    <section className={'analysis-section' + (accent ? ' accent' : '')}>
      <h3>{label}</h3>
      <p style={{ fontSize: Math.round(BASE_TEXT * textScale) + 'px' }}>{text}</p>
    </section>
  );
}

function StoredSources({ sources }) {
  const [open, setOpen] = React.useState(true);
  const list = (sources || []).filter(s => s && s.url);
  if (!list.length) return null;
  return (
    <div className="sources-block">
      <button className="sources-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><Icon name="info" size={16} /> Fonti e riferimenti</span><Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="sources-list">
          {list.map((source, index) => (
            <a key={source.url || index} href={source.url} target="_blank" rel="noreferrer">
              {source.title || source.url}<span>{source.type || 'Fonte'} <Icon name="external" size={13} /></span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function StoredExploreAlso({ artwork, analysis, onHotspotSelect }) {
  if (!analysis) return null;
  const hotspots = (artwork.hotspots || artwork.details || []);
  const others = hotspots.filter(h => h.title !== analysis.title);
  if (!others.length) return null;
  return (
    <div className="explore-also">
      <h3>Esplora anche</h3>
      <div className="explore-also-chips">
        {others.map(hotspot => (
          <button key={hotspot.id} className="explore-also-chip" onClick={() => onHotspotSelect(hotspot)}>
            <span className="chip-category">{hotspot.category}</span>{hotspot.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalysisPanel({ artwork, selectedHotspot, storedAnalyses, missingContent, onHotspotSelect }) {
  const [activeLevel, setActiveLevel] = React.useState(LEVELS[0]);
  const [fontValues, setFontValues] = React.useState({ 'Scuola secondaria': 100, 'Approfondimento': 100 });

  const analysis = (storedAnalyses && storedAnalyses[activeLevel]) || null;
  const fontValue = fontValues[activeLevel];
  const textScale = fontValue / 100;

  const isEssentialsTab = activeLevel === 'Scuola secondaria';
  const sections = analysis
    ? isEssentialsTab
      ? [
          { key: 'observation', label: 'Cosa vedi', text: analysis.content.observation },
          { key: 'meaning', label: 'Cosa significa', text: analysis.content.meaning },
          { key: 'relation', label: 'In relazione all’opera', text: analysis.content.relation }
        ]
      : [
          { key: 'curiosity', label: 'Una curiosità', text: analysis.content.curiosity, accent: true },
          { key: 'comparisons', label: 'Confronti con altre opere', text: analysis.content.comparisons },
          { key: 'openQuestions', label: 'Questioni aperte', text: analysis.content.openQuestions },
          { key: 'technique', label: 'Tecnica e materia', text: analysis.content.technique }
        ]
    : [];

  const visible = sections.filter(s => s.text && String(s.text).trim());
  const lookAgain = analysis ? (analysis.content.lookAgain || '') : '';
  const title = selectedHotspot
    ? selectedHotspot.title
    : 'Scegli un dettaglio';
  const category = selectedHotspot ? selectedHotspot.category : '';

  function changeFont(nextValue) {
    setFontValues(current => Object.assign({}, current, { [activeLevel]: nextValue }));
  }

  const hasSelection = Boolean(selectedHotspot);

  return (
    <aside className="analysis-panel" aria-live="polite">
      <div className="panel-topline">
        <span className="ai-mark"><Icon name="sparkle" size={15} /> SCHEDA DIDATTICA</span>
        <span className="secure-note">Contenuti verificati</span>
      </div>
      <div className="analysis-heading">
        <div>
          <span className="eyebrow">{category || 'Dettaglio selezionato'}</span>
          <h2>{title}</h2>
        </div>
        {hasSelection && <FontControls value={fontValue} onChange={changeFont} />}
      </div>

      {hasSelection && (
        <div className="level-tabs" role="tablist" aria-label="Livello di approfondimento">
          {LEVELS.map(level => {
            const selected = level === activeLevel;
            return (
              <button
                key={level}
                type="button"
                role="tab"
                aria-selected={selected}
                className={'level-tab' + (selected ? ' active' : '')}
                onClick={() => setActiveLevel(level)}
              >
                <span className="tab-mark">{level === 'Scuola secondaria' ? 'S' : 'A'}</span>
                <span className="tab-copy">
                  <strong>{LEVEL_TITLES[level] || level}</strong>
                  <small>{level === 'Scuola secondaria' ? 'Sezioni essenziali' : 'Confronti e questioni aperte'}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!hasSelection && (
        <div className="empty-analysis">
          <div className="empty-orbit"><Icon name="sparkle" size={26} /></div>
          <h3>Guarda più da vicino</h3>
          <p>Scegli uno dei dettagli suggeriti (sotto l’immagine o direttamente sull’opera): si aprono qui le due letture della scheda — “Studio del dettaglio” e “Approfondimento”.</p>
          <div className="empty-tip"><Icon name="info" size={16} /> I contenuti provengono dalla scheda didattica pubblicata in noesis-roads-creator: nessuna generazione al volo.</div>
        </div>
      )}

      {hasSelection && missingContent && (
        <div className="empty-analysis compact">
          <div className="empty-orbit"><Icon name="info" size={26} /></div>
          <h3>Contenuto non disponibile</h3>
          <p>“{missingContent}” non ha una sezione nella scheda didattica. Scegli uno dei dettagli suggeriti per leggere i testi.</p>
        </div>
      )}

      {hasSelection && !missingContent && !analysis && (
        <div className="empty-analysis compact">
          <div className="empty-orbit"><Icon name="sparkle" size={26} /></div>
          <h3>Nessun contenuto per questa tab</h3>
          <p>Questa lettura non è presente nella scheda per il dettaglio scelto. Prova con l’altra tab.</p>
        </div>
      )}

      {hasSelection && analysis && (
        <div className="analysis-result">
          <div className="confidence cool"><span className="confidence-dot"></span>{analysis.confidence.label}</div>
          <div className="analysis-sections">
            {visible.map((section, index) => (
              <StoredSection key={section.key} label={section.label} text={section.text} textScale={textScale} accent={section.accent} />
            ))}
            {lookAgain ? (
              <div className="look-again">
                <Icon name="info" size={16} />
                <p style={{ fontSize: Math.round(BASE_TEXT * textScale) + 'px' }}><strong>Guarda ancora:</strong> {lookAgain}</p>
              </div>
            ) : null}
            {onHotspotSelect && <StoredExploreAlso artwork={artwork} analysis={analysis} onHotspotSelect={onHotspotSelect} />}
          </div>
          <StoredSources sources={analysis.sources} />
          <p className="disclaimer">{analysis.disclaimer}</p>
        </div>
      )}
    </aside>
  );
}
