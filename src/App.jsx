// URL dell'hub lanciato da launcher.mjs: iniettato dal server come APP_DATA.hubUrl,
// con fallback calcolato sulla stessa porta default del launcher (NOESIS_HUB_PORT).
function hubUrl() {
  const injected = window.APP_DATA && window.APP_DATA.hubUrl;
  if (injected) return injected;
  return 'http://' + (location.hostname || '127.0.0.1') + ':18080/';
}

function App() {
  const [activeCard, setActiveCard] = React.useState(null);        // card selezionata in catalogo
  const [activeArtwork, setActiveArtwork] = React.useState(null);  // scheda dipinto completa
  const [activeSubject, setActiveSubject] = React.useState(null);  // scheda soggetto completa
  const [activeComparison, setActiveComparison] = React.useState(null); // scheda confronto completa
  const [activeScheda, setActiveScheda] = React.useState(null); // scheda-lezione generica completa
  const [cards, setCards] = React.useState(null);
  const [libraryStatus, setLibraryStatus] = React.useState('loading');
  const [openingId, setOpeningId] = React.useState(null);
  const [openError, setOpenError] = React.useState(null);

  // La collezione arriva dal DB di noesis-roads-creator: dipinti, soggetti, confronti
  // e schede-lezione generiche pubblicati (stato "ready"). Se non ci sono schede
  // (o il DB non è raggiungibile) si usa la demo inclusa nella pagina (solo dipinti).
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/library')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        const demo = (window.APP_DATA && window.APP_DATA.artworks) ? window.APP_DATA.artworks : [];
        const published = [].concat(payload.artworks || [], payload.subjects || [], payload.comparisons || [], payload.cards || []);
        const list = (payload && published.length) ? published : demo;
        setCards(list);
        setLibraryStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setCards(window.APP_DATA && window.APP_DATA.artworks ? window.APP_DATA.artworks : []);
        setLibraryStatus('ready');
      });
    return function () { cancelled = true; };
  }, []);

  // All'apertura di una card carichiamo la scheda COMPLETA dal server, in base al tipo.
  function openCard(card) {
    setActiveCard(card);
    setOpenError(null);
    setActiveArtwork(null);
    setActiveSubject(null);
    setActiveComparison(null);
    setActiveScheda(null);
    setOpeningId(card.id);
    if (card.cardType === 'scheda') {
      fetch('/api/cards/' + encodeURIComponent(card.id))
        .then((response) => {
          if (!response.ok) throw new Error('Scheda non disponibile (HTTP ' + response.status + ')');
          return response.json();
        })
        .then((payload) => { setOpeningId(null); setActiveScheda(payload); })
        .catch((error) => { setOpeningId(null); setOpenError((error && error.message) || 'Impossibile caricare la scheda.'); });
      return;
    }
    if (card.cardType === 'subject') {
      fetch('/api/subjects/' + encodeURIComponent(card.id))
        .then((response) => {
          if (!response.ok) throw new Error('Scheda non disponibile (HTTP ' + response.status + ')');
          return response.json();
        })
        .then((payload) => { setOpeningId(null); setActiveSubject(payload); })
        .catch((error) => { setOpeningId(null); setOpenError((error && error.message) || 'Impossibile caricare la scheda.'); });
      return;
    }
    if (card.cardType === 'comparison') {
      fetch('/api/comparisons/' + encodeURIComponent(card.id))
        .then((response) => {
          if (!response.ok) throw new Error('Scheda non disponibile (HTTP ' + response.status + ')');
          return response.json();
        })
        .then((payload) => { setOpeningId(null); setActiveComparison(payload); })
        .catch((error) => { setOpeningId(null); setOpenError((error && error.message) || 'Impossibile caricare la scheda.'); });
      return;
    }
    const demo = (window.APP_DATA && window.APP_DATA.artworks || []).find(a => a.id === card.id);
    if (demo && !card.source) {
      setOpeningId(null);
      setActiveArtwork(demo);
      return;
    }
    fetch('/api/artworks/' + encodeURIComponent(card.id))
      .then((response) => {
        if (!response.ok) throw new Error('Scheda non disponibile (HTTP ' + response.status + ')');
        return response.json();
      })
      .then((payload) => { setOpeningId(null); setActiveArtwork(payload); })
      .catch((error) => { setOpeningId(null); setOpenError((error && error.message) || 'Impossibile caricare la scheda.'); });
  }

  function backHome() {
    setActiveCard(null);
    setActiveArtwork(null);
    setActiveSubject(null);
    setActiveComparison(null);
    setActiveScheda(null);
    setOpenError(null);
  }

  const showCatalog = !activeArtwork && !activeSubject && !activeComparison && !activeScheda && !openingId;

  return (
    <div className="app-shell">
      {showCatalog && <header className="site-header"><a href="#top" className="brand" onClick={(event) => { event.preventDefault(); backHome(); }}><span className="brand-mark"><i></i><i></i><i></i></span><span>leggi l’<strong>opera</strong></span></a><nav><a href="#catalogo">La collezione</a><a href="#metodo">Come funziona</a></nav><div className="header-actions"><button className="config-button hub-button" onClick={() => { location.href = hubUrl(); }} title="Torna all'hub di Noesis Roads"><span>←</span> Hub</button></div></header>}
      {showCatalog && libraryStatus === 'loading' && (
        <main className="catalog-page"><section className="catalog-section" style={{ textAlign: 'center', paddingTop: 120 }}><div className="loading-orbit" style={{ margin: '0 auto 22px' }}><span></span><span></span><span></span></div><h2 style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Carico la collezione…</h2></section></main>
      )}
      {showCatalog && libraryStatus === 'ready' && cards && <CatalogPage cards={cards} onOpen={openCard} initialMateria={new URLSearchParams(location.search).get('materia') || undefined} />}
      {openingId && !activeArtwork && !activeSubject && !activeComparison && !activeScheda && (
        <main className="explore-page"><section className="exploration-layout" style={{ paddingTop: 60 }}>
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '70px 20px' }}>
            <div className="loading-orbit" style={{ margin: '0 auto 22px' }}><span></span><span></span><span></span></div>
            <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Carico la scheda didattica…</h2>
          </div>
        </section></main>
      )}
      {openError && !activeArtwork && !activeSubject && !activeComparison && !activeScheda && (
        <main className="explore-page"><section className="exploration-layout" style={{ paddingTop: 60 }}>
          <div className="overview-card overview-error" style={{ gridColumn: '1 / -1' }}>
            <Icon name="info" size={22} />
            <h3>Impossibile aprire la scheda</h3>
            <p>{openError}</p>
            <button className="secondary-button" onClick={backHome}>Torna alla collezione</button>
          </div>
        </section></main>
      )}
      {activeArtwork && <ExplorePage artwork={activeArtwork} onBack={backHome} />}
      {activeSubject && <SubjectView subject={activeSubject} onBack={backHome} />}
      {activeComparison && <ComparisonView comparison={activeComparison} onBack={backHome} />}
      {activeScheda && <GenericCardView card={activeScheda} onBack={backHome} />}
      {showCatalog && <footer className="site-footer" id="metodo"><div className="footer-brand"><span className="brand-mark"><i></i><i></i><i></i></span><span>leggi l’<strong>opera</strong></span></div><p>Un invito a guardare con più attenzione.</p><div className="footer-meta"><span>Progetto educativo · 2026</span><span>Realizzato per imparare dall’arte</span></div></footer>}
    </div>
  );
}