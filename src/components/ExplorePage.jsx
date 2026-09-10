// Presenta la scheda didattica salvata nel database (noesis-roads-creator): le sezioni
// vengono lette dal contenuto pubblicato, senza chiamate live al modello.
// I due livelli (Scuola secondaria / Approfondimento) mostrano solo le proprie sezioni.

var LEVELS = ['Scuola secondaria', 'Approfondimento'];

function stripLookPrefix(text) {
  // I testi del DB aprono spesso con un invito completo ("Guarda ancora…",
  // "Torna a guardare…", "Guarda di nuovo…"): il box aggiunge già l'etichetta
  // "Guarda ancora:", quindi rimuoviamo il preambolo per non duplicarlo.
  return String(text || '')
    .replace(/^[\"'\u2019\u2018 ]*guarda ancora[\"'\u2019\u2018 :.!-]*/i, '')
    .replace(/^[\"'\u2019\u2018 ]*torna a guardare[\"'\u2019\u2018 ]*(ancora)?[\"'\u2019\u2018 :.!-]*/i, '')
    .replace(/^[\"'\u2019\u2018 ]*guarda di nuovo[\"'\u2019\u2018 :.!-]*/i, '')
    .trim();
}

function ExplorePage({ artwork, onBack }) {
  var detailsById = React.useMemo(function () {
    var map = {};
    (artwork.details || []).forEach(function (d) { map[String(d.id)] = d; });
    return map;
  }, [artwork.id]);

  var [selected, setSelected] = React.useState(null);           // hotspot selezionato
  var [analyses, setAnalyses] = React.useState({});             // { 'Scuola secondaria': result, 'Approfondimento': result }
  var [missingContent, setMissingContent] = React.useState(null); // hotspot senza contenuto nel DB

  function buildStoredResult(detail) {
    var levels = {};
    LEVELS.forEach(function (level) {
      var tab = level === 'Approfondimento' ? 'approfondimento' : 'studio';
      var row = detail[tab];
      var c = row || {};
      var label = level === 'Approfondimento'
        ? 'Approfondimento · scheda didattica'
        : 'Studio del dettaglio · scheda didattica';
      var content = {
        observation: String(c.observation || '').trim(),
        meaning: String(c.meaning || '').trim(),
        relation: String(c.relation || '').trim(),
        curiosity: String(c.curiosity || '').trim(),
        comparisons: level === 'Approfondimento' ? String(c.comparisons || '').trim() : '',
        openQuestions: level === 'Approfondimento' ? String(c.openQuestions || '').trim() : '',
        technique: level === 'Approfondimento' ? String(c.technique || '').trim() : '',
        lookAgain: stripLookPrefix(String(c.lookAgain || '').trim())
      };
      levels[level] = {
        id: 'stored-' + detail.id + '-' + tab,
        status: 'completed',
        stored: true,
        title: detail.title,
        confidence: { level: 'high', label: label, tone: 'cool' },
        content: content,
        sources: (artwork.sources || []).filter(function (s) { return s && s.url; }),
        disclaimer: level === 'Approfondimento'
          ? 'Testi della scheda didattica (noesis-roads-creator): confronti, questioni aperte e tecnica pittorica specifici di questo dettaglio, verificati in fase di pubblicazione.'
          : 'Testi della scheda didattica (noesis-roads-creator): cosa vedi, cosa significa e il legame con gli altri dettagli dell’opera, verificati in fase di pubblicazione.'
      };
    });
    return levels;
  }

  function selectDetail(hotspot) {
    if (!hotspot) return;
    var detail = detailsById[String(hotspot.id || hotspot.hotspotId || hotspot.title)] || null;
    if (!detail) detail = (artwork.details || []).find(function (d) { return d.title === hotspot.title; }) || null;
    setSelected(hotspot);
    setMissingContent(null);
    if (detail) {
      setAnalyses(buildStoredResult(detail));
    } else {
      setAnalyses({});
      setMissingContent(hotspot.title || 'Questo dettaglio');
    }
  }

  // La didascalia attiva funziona come toggle (come nel creator): ripremendola
  // si torna all'immagine completa a colori, senza box e senza selezione.
  function chooseHotspot(hotspot) {
    if (selected && String(selected.id) === String(hotspot.id)) {
      setSelected(null);
      setMissingContent(null);
      setAnalyses({});
      return;
    }
    selectDetail(hotspot);
  }

  var headerNote = artwork.overview && artwork.overview.painting ? '' : '';

  return (
    <main className="explore-page">
      <header className="explore-header">
        <div className="explore-header-left">
          <a href="#" className="brand" onClick={(event) => { event.preventDefault(); onBack(); }} aria-label="Torna alla collezione"><span className="brand-mark"><i></i><i></i><i></i></span><span>leggi l’<strong>opera</strong></span></a>
          <button className="config-button hub-button" onClick={() => { location.href = hubUrl(); }} title="Torna all’hub di Noesis Roads"><span>←</span> Hub</button>
        </div>
        <div className="explore-progress"><span>01</span><i></i><span>Esplorazione guidata</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {String(artwork.image || '').indexOf('/api/') === 0 && (
            <a className="back-button" href={'/api/artworks/' + encodeURIComponent(artwork.id) + '/pdf'} title="Scarica il PDF libro d'arte">⬇ PDF</a>
          )}
          <button className="back-button" onClick={onBack}><span className="back-icon">←</span> Torna alla collezione</button>
        </div>
      </header>
      <section className="explore-intro">
        <div>
          <span className="eyebrow">{artwork.period || 'Scheda didattica'}</span>
          <h1>{artwork.title}</h1>
          <p>{artwork.artist}{artwork.date ? <span>·</span> : null}{artwork.date}{artwork.institution ? <span>·</span> : null}{artwork.institution}</p>
        </div>
        <div className="explore-tag"><Icon name="sparkle" size={15} /> Contenuti dalla scheda didattica{headerNote}</div>
      </section>

      <ArtworkOverview artwork={artwork} />

      <section className="exploration-layout">
        <div className="viewer-column">
          <ArtworkViewer
            artwork={artwork}
            selectedHotspotId={selected && selected.id}
            onHotspotSelect={chooseHotspot}
          />
          <div className="rights-line">{artwork.rights}</div>
        </div>
        <AnalysisPanel
          artwork={artwork}
          selectedHotspot={selected}
          storedAnalyses={analyses}
          storedOnly={true}
          missingContent={missingContent}
          onHotspotSelect={chooseHotspot}
        />
      </section>
    </main>
  );
}
