function SubjectCard({ card, onOpen }) {
  return (
    <button className="artwork-card subject-card" onClick={() => onOpen(card)} aria-label={'Apri ' + card.title}>
      <div className="card-image-wrap subject-card-fill">
        <div className="subject-card-inner">
          <span className="subject-ico">{String(card.name || 'S').charAt(0)}</span>
          <strong>{card.title}</strong>
          <small>{card.shortDesc || 'Il soggetto nella storia dell’arte'}</small>
        </div>
        <span className="card-arrow"><Icon name="arrow" size={18} /></span>
      </div>
      <div className="card-copy">
        <div className="eyebrow">{card.period}</div>
        <h3>{card.title}</h3>
        <p>Soggetto nella storia dell’arte</p>
      </div>
    </button>
  );
}

function SchedaCard({ card, onOpen }) {
  return (
    <button className="artwork-card subject-card" onClick={() => onOpen(card)} aria-label={'Apri ' + card.title}>
      <div className="card-image-wrap subject-card-fill">
        {card.image ? (
          <img src={card.image} alt={card.title} className="card-image" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="subject-card-inner">
            <span className="subject-ico">{String(card.title || 'S').charAt(0)}</span>
            <strong>{card.title}</strong>
            <small>{card.subtitle || 'Scheda didattica'}</small>
          </div>
        )}
        <span className="card-arrow"><Icon name="arrow" size={18} /></span>
      </div>
      <div className="card-copy">
        <div className="eyebrow">{card.period}</div>
        <h3>{card.title}</h3>
        <p>{card.subtitle || 'Scheda didattica'}</p>
      </div>
    </button>
  );
}

function ComparisonCard({ card, onOpen }) {
  return (
    <button className="artwork-card" onClick={() => onOpen(card)} aria-label={'Apri ' + card.title}>
      <div className="card-image-wrap">
        {card.image ? (
          <img src={card.image} alt={card.title} className="card-image" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="card-image-wrap comparison-fallback"><span className="subject-ico">⚖</span><strong>Faccia a faccia</strong></div>
        )}
        <span className="card-badge">Confronto</span>
        <span className="card-arrow"><Icon name="arrow" size={18} /></span>
      </div>
      <div className="card-copy">
        <div className="eyebrow">{card.period}</div>
        <h3>{card.title}</h3>
        <p>{card.comparisonType === 'same-artist' ? 'Stesso artista, fasi diverse' : 'Stesso soggetto, artisti diversi'}</p>
      </div>
    </button>
  );
}

function TypeSectionHead({ title, count }) {
  return (
    <div className="type-section-head">
      <div>
        <h3 className="type-title">{title}</h3>
        <p className="type-desc">{count === 1 ? 'Una scheda nel catalogo' : count + ' schede nel catalogo'}</p>
      </div>
      <span className="type-tag">{count}</span>
    </div>
  );
}

function CatalogPage({ cards, onOpen, initialMateria }) {
  const [query, setQuery] = React.useState('');
  const [type, setType] = React.useState('Tutte');
  const [materia, setMateria] = React.useState(initialMateria || 'tutte');
  const [materie, setMaterie] = React.useState([]);
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/materie')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (!cancelled && payload && Array.isArray(payload.materie)) setMaterie(payload.materie); })
      .catch(() => {});
    return function () { cancelled = true; };
  }, []);
  const materiaName = function (id) {
    const found = materie.find(function (m) { return m.id === id; });
    return found ? found.nome : id;
  };
  const schedaMaterie = Array.from(new Set(
    (cards || []).filter(function (c) { return c.cardType === 'scheda' && c.materiaId; }).map(function (c) { return c.materiaId; })
  ));
  const knownIds = materie.map(function (m) { return m.id; });
  const pillIds = (knownIds.length ? knownIds : schedaMaterie)
    .filter(function (id) { return !schedaMaterie.length || schedaMaterie.includes(id); });
  const materiaTabs = [['tutte', 'Tutte le materie']].concat(pillIds.map(function (id) { return [id, materiaName(id)]; }));
  const hero = (cards || []).find(function (c) { return c.image; }) || null;
  const needle = query.toLowerCase();

  // Tre sezioni logiche della collezione, una per tipo di scheda.
  const sections = [
    {
      key: 'artwork', title: 'L’opera', filterKey: 'Dipinti',
      items: (cards || []).filter(function (card) { return !card.cardType || card.cardType === 'artwork'; }),
      render: function (card) { return <ArtworkCard key={card.id} artwork={card} onOpen={onOpen} />; }
    },
    {
      key: 'subject', title: 'Il soggetto', filterKey: 'Soggetti',
      items: (cards || []).filter(function (card) { return card.cardType === 'subject'; }),
      render: function (card) { return <SubjectCard key={card.id} card={card} onOpen={onOpen} />; }
    },
    {
      key: 'comparison', title: 'Il confronto', filterKey: 'Confronti',
      items: (cards || []).filter(function (card) { return card.cardType === 'comparison'; }),
      render: function (card) { return <ComparisonCard key={card.id} card={card} onOpen={onOpen} />; }
    },
    {
      key: 'scheda', title: 'Le schede', filterKey: 'Schede',
      items: (cards || []).filter(function (card) {
        return card.cardType === 'scheda' && (materia === 'tutte' || card.materiaId === materia);
      }),
      render: function (card) { return <SchedaCard key={card.id} card={card} onOpen={onOpen} />; }
    }
  ];

  // Il filtro per tipo mostra/nasconde intere sezioni; la ricerca filtra dentro ciascuna.
  // La sezione Schede resta visibile quando il filtro materia la svuota (per poterlo resettare).
  const schedaTotal = (cards || []).filter(function (card) { return card.cardType === 'scheda'; }).length;
  const visible = sections
    .filter(function (section) { return type === 'Tutte' || type === section.filterKey; })
    .map(function (section) {
      const items = section.items.filter(function (card) {
        const text = ((card.title || '') + ' ' + (card.artist || '') + ' ' + (card.period || '') + ' ' + (card.shortDesc || '') + ' ' + (card.subtitle || '')).toLowerCase();
        return text.includes(needle);
      });
      return { key: section.key, title: section.title, items: items, render: section.render };
    })
    .filter(function (section) { return section.items.length > 0 || (section.key === 'scheda' && schedaTotal > 0); });
  const total = visible.reduce(function (sum, section) { return sum + section.items.length; }, 0);

  return (
    <main className="catalog-page">
      <section className="hero-section">
        <div className="hero-copy">
          <div className="hero-kicker"><span></span> Schede didattiche per ogni materia</div>
          <h1>Ogni argomento<br /><em>racconta</em> una storia.</h1>
          <p>Esplora autori, opere, temi e confronti di ogni materia. Apri una scheda, leggi, fai domande.</p>
          <div className="hero-actions"><a href="#catalogo" className="primary-button">Inizia a esplorare <Icon name="arrow" size={18} /></a><span className="hero-note"><Icon name="sparkle" size={15} /> Guidato dall’intelligenza artificiale</span></div>
        </div>
        {hero ? (
          <div className="hero-art">
            <div className="hero-frame"><img src={hero.image} alt={(hero.artist ? hero.artist + ', ' : '') + hero.title} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = hero.fallbackImage; }} /><span className="hero-spot hero-spot-one"></span><span className="hero-spot hero-spot-two"></span></div>
            <div className="hero-caption"><span>01</span><span>{hero.title}{hero.artist ? ' · ' + hero.artist : (hero.subtitle || hero.period ? ' · ' + (hero.subtitle || hero.period) : '')}</span></div>
          </div>
        ) : null}
        <div className="hero-scribble">leggi<br />più a fondo</div>
      </section>

      <section className="catalog-section" id="catalogo">
        <div className="section-heading"><div><span className="eyebrow">Il catalogo</span><h2>Inizia da una scheda.</h2></div><p>Schede didattiche per materia: autori, opere, temi e confronti.</p></div>
        <div className="catalog-tools"><label className="search-field"><Icon name="search" size={18} /><span className="sr-only">Cerca nell’elenco</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca titolo, autore o argomento…" /></label></div>
        <div className="catalog-tabs" role="tablist" aria-label="Filtra la collezione per tipo">
          {[
            ['Tutte', (cards || []).length],
            ['Dipinti', sections[0].items.length],
            ['Soggetti', sections[1].items.length],
            ['Confronti', sections[2].items.length],
            ['Schede', sections[3].items.length]
          ].filter(function (tab) { return tab[0] === 'Tutte' || tab[1] > 0; }).map(function (tab) {
            return (
              <button key={tab[0]} type="button" role="tab" aria-selected={type === tab[0]} className={'catalog-tab' + (type === tab[0] ? ' active' : '')} onClick={() => setType(tab[0])}>
                {tab[0]}<span className="tab-count">{tab[1]}</span>
              </button>
            );
          })}
        </div>
        {visible.map(function (section) {
          return (
            <div className="type-section" key={section.key}>
              <TypeSectionHead title={section.title} count={section.items.length} />
              {section.key === 'scheda' && materiaTabs.length > 1 && (
                <div className="catalog-tabs" role="tablist" aria-label="Filtra le schede per materia" style={{ marginBottom: 12 }}>
                  {materiaTabs.map(function (tab) {
                    return (
                      <button key={tab[0]} type="button" role="tab" aria-selected={materia === tab[0]} className={'catalog-tab' + (materia === tab[0] ? ' active' : '')} onClick={() => setMateria(tab[0])}>
                        {tab[1]}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="catalog-grid">{section.items.map(section.render)}</div>
              {section.key === 'scheda' && section.items.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 12 }}>Nessuna scheda per questa materia — creala da noesis-roads-creator.</p>
              )}
            </div>
          );
        })}
        {total === 0 && (cards || []).length === 0 && <div className="catalog-empty"><Icon name="search" size={24} /><h3>Nessun contenuto pubblicato</h3><p>Crea e approva schede da noesis-roads-creator per vederle qui.</p></div>}
        {total === 0 && (cards || []).length > 0 && <div className="catalog-empty"><Icon name="search" size={24} /><h3>Nessuna scheda trovata</h3><p>Prova a cambiare la ricerca o il filtro.</p></div>}
      </section>
    </main>
  );
}
