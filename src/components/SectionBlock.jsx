// Noesis Roads — blocco viewer guidato dal tipo-sezione (cfr. docs/ARCHITECTURE.md).
// Un solo renderer per qualunque materia/modello: il corpo tipizzato decide il blocco.

function GenericWorkThumb({ work }) {
  const [failed, setFailed] = React.useState(false);
  if (failed || !work.imageUrl) {
    return <div className="sim-ph-lg">🖼 immagine non disponibile</div>;
  }
  return <img className="sim-thumb-lg" src={work.imageUrl} alt="" loading="lazy" onError={function () { setFailed(true); }} />;
}

function SectionBlock({ def, corpo, immagini, fontScale }) {
  const contentStyle = { fontSize: (12 * (fontScale || 1)) + 'px', lineHeight: 1.75 };
  const body = corpo || {};
  const imgs = Array.isArray(immagini) ? immagini : [];
  const imgFor = function (ruolo) {
    return imgs.find(function (m) { return String(m.ruolo || '') === String(ruolo || ''); }) || null;
  };

  if (def.type === 'text') {
    if (!String(body.text || '').trim()) return null;
    return <p style={contentStyle}>{body.text}</p>;
  }
  if (def.type === 'epochs') {
    const chapters = Array.isArray(body.chapters) ? body.chapters : [];
    if (!chapters.length) return null;
    return (
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
    );
  }
  if (def.type === 'works') {
    const works = Array.isArray(body.works) ? body.works : [];
    if (!works.length) return null;
    return (
      <div className="sim-carousel">
        <div className="sim-track"><div className="sim-track-inner">
          {works.map(function (work, index) {
            const byline = work.artist || work.author || '';
            const place = work.museum || work.place || '';
            return (
              <figure className="sim-slide" key={String(work.title) + '-' + index}>
                <GenericWorkThumb work={work} />
                <figcaption>
                  <strong>{work.title}</strong>
                  {byline ? <span>{byline}{work.date ? ' · ' + work.date : ''}</span> : null}
                  {place ? <small>{place}</small> : null}
                  {work.caption ? <p style={{ fontSize: (11 * (fontScale || 1)) + 'px', lineHeight: 1.5 }}>{work.caption}</p> : null}
                </figcaption>
              </figure>
            );
          })}
        </div></div>
      </div>
    );
  }
  if (def.type === 'points') {
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return null;
    return (
      <ol className="generic-points">
        {items.map(function (p, index) {
          return (
            <li key={index}>
              <strong>{p.title}</strong>
              <p style={contentStyle}>{p.text}</p>
            </li>
          );
        })}
      </ol>
    );
  }
  if (def.type === 'kv') {
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) return null;
    return (
      <div className="symbol-def">
        {entries.map(function (e, index) {
          return (
            <div className="sym-def-item" key={index}>
              <strong>{e.label || e.term}</strong>
              <span style={contentStyle}>{e.value || e.meaning}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (def.type === 'pair') {
    const a = body.a || {}, b = body.b || {};
    if (!a.title && !a.text && !b.title && !b.text) return null;
    const sideImg = function (letter) {
      return imgFor(def.key + '-' + letter) || imgFor('lato-' + letter) || null;
    };
    const side = function (s, label, letter) {
      const img = sideImg(letter);
      return (
        <div className="overview-col">
          {img && img.url ? <img src={img.url} alt={s.title || label} loading="lazy" style={{ width: '100%', borderRadius: 10, marginBottom: 8 }} /> : null}
          <h3>{s.title || label}</h3>
          {s.text ? <p style={contentStyle}>{s.text}</p> : null}
        </div>
      );
    };
    return <div className="overview-grid">{side(a, 'A', 'a')}{side(b, 'B', 'b')}</div>;
  }
  if (def.type === 'image') {
    const img = imgFor(def.key) || imgs[0] || null;
    if (!img || !img.url) return null;
    return (
      <figure className="generic-figure">
        <img src={img.url} alt={body.caption || def.title} loading="lazy" />
        {body.caption ? <figcaption>{body.caption}</figcaption> : null}
      </figure>
    );
  }
  return null;
}
