// Viewer con pannello immagine "a fasce" come nel creator:
// - fasce 1-4 (sinistra): l'immagine del dipinto, renderizzata su canvas
// - fascia 5 (destra): la colonna verticale delle didascalie dei dettagli
// Quando una didascalia è attiva, SOLO il riquadro di quel dettaglio resta a colori
// (contorno corallo + alone bianco) mentre tutto il resto diventa in scala di grigi.
// Ripremendo la didascalia attiva si torna all'immagine completa a colori.

function ArtworkViewer({ artwork, selectedHotspotId, onHotspotSelect }) {
  const hotspots = artwork.details && artwork.details.length ? artwork.details : (artwork.hotspots || []);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [drag, setDrag] = React.useState(null);
  const [hoveredId, setHoveredId] = React.useState(null);
  const [viewMode, setViewMode] = React.useState('clean'); // 'clean' | 'annotated'
  const canvasRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const imageRef = React.useRef(null); // immagine caricata per il disegno

  const hasAnnotated = Boolean(artwork.annotatedImageUrl);

  // Carica l'immagine (pulita o annotata) e ridisegna lo spotlight.
  const imageLoaded = React.useRef(false);

  function drawSpot() {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    // canvas alle dimensioni pixel dell'immagine: il CSS lo scala al box mostrato
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const sel = hotspots.find(d => String(d.id) === String(effectiveSelId));
    if (!sel || !sel.region) {
      ctx.filter = 'none';
      ctx.drawImage(img, 0, 0, W, H);
      return;
    }
    const r = sel.region;
    const x = Math.max(0, Math.min(W - 1, r.x * W));
    const y = Math.max(0, Math.min(H - 1, r.y * H));
    const w = Math.max(1, Math.min(W - x, r.width * W));
    const h = Math.max(1, Math.min(H - y, r.height * H));
    // base in scala di grigi
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(img, 0, 0, W, H);
    ctx.filter = 'none';
    // ripristino a colori solo dentro la regione
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();
    // alone bianco + contorno colorato
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#dc7056';
    ctx.strokeRect(x, y, w, h);
  }

  React.useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const src = viewMode === 'annotated' ? artwork.annotatedImageUrl : artwork.image;
    if (!src) { imageRef.current = null; return; }
    const img = new Image();
    img.onload = function () {
      imageRef.current = img;
      imageLoaded.current = true;
      // il box immagine (stage) mantiene l'aspect ratio reale del dipinto
      const stage = wrapRef.current;
      if (stage) {
        stage.style.aspectRatio = String(img.naturalWidth / img.naturalHeight);
        stage.style.height = 'auto';
      }
      drawSpot();
    };
    img.onerror = function () {
      imageRef.current = null;
      imageLoaded.current = false;
    };
    img.src = src;
  }, [artwork.id, viewMode]);

  // ridisegna quando cambia la selezione (in vista annotata non c'è spotlight)
  React.useEffect(() => {
    drawSpot();
  }, [selectedHotspotId, hotspots.length, viewMode]);

  // In vista annotata l'immagine mostra già tutti i riquadri e le didascalie
  // disegnati: il box interattivo resta attivo solo in vista pulita.
  const effectiveSelId = viewMode === 'annotated' ? null : selectedHotspotId;

  function toggleViewMode() {
    setViewMode(current => (current === 'clean' ? 'annotated' : 'clean'));
  }

  function changeZoom(delta) {
    setZoom(current => {
      const next = Math.max(1, Math.min(3, Number((current + delta).toFixed(2))));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }); }

  function getNormalizedPoint(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    setDrag({ clientX: event.clientX, clientY: event.clientY, moved: false });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!drag) return;
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      setDrag({ clientX: event.clientX, clientY: event.clientY, moved: true });
      if (zoom > 1) setPan(current => ({ x: current.x + dx, y: current.y + dy }));
    }
  }

  function handlePointerUp(event) {
    if (!drag) return;
    const moved = drag.moved;
    setDrag(null);
    if (!moved && zoom === 1) {
      const point = getNormalizedPoint(event);
      if (!point) return;
      const hit = hotspots.find(d => {
        const r = d.region || {};
        return point.x >= r.x && point.x <= r.x + (r.width || 0) && point.y >= r.y && point.y <= r.y + (r.height || 0);
      });
      if (hit) onHotspotSelect(hit);
    }
  }

  return (
    <section className="viewer-shell" aria-label={'Esplora ' + artwork.title}>
      <div className="viewer-toolbar">
        <span className="viewer-hint"><Icon name="sparkle" size={15} /> Seleziona un dettaglio per iniziare</span>
        <div className="viewer-controls" aria-label="Controlli immagine">
          {hasAnnotated && (
            <button
              className={'view-toggle' + (viewMode === 'annotated' ? ' active' : '')}
              onClick={toggleViewMode}
              aria-pressed={viewMode === 'annotated'}
              title={viewMode === 'annotated' ? 'Mostra l’immagine pulita' : 'Mostra l’immagine con i riquadri e le didascalie dei dettagli'}
            >
              <Icon name={viewMode === 'annotated' ? 'close' : 'sparkle'} size={14} />
              {viewMode === 'annotated' ? 'Vista pulita' : 'Riquadri e didascalie'}
            </button>
          )}
          <button className="icon-button" onClick={() => changeZoom(-0.25)} disabled={zoom <= 1} aria-label="Riduci zoom"><Icon name="minus" /></button>
          <span className="zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button className="icon-button" onClick={() => changeZoom(0.25)} disabled={zoom >= 3} aria-label="Aumenta zoom"><Icon name="plus" /></button>
          <button className="icon-button reset-button" onClick={resetView} aria-label="Ripristina vista"><Icon name="reset" /></button>
        </div>
      </div>

      <div className="img-panel">
        <div
          className={'spot-stage ' + (zoom > 1 ? 'is-zoomed' : '')}
          ref={wrapRef}
          tabIndex="0"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setDrag(null)}
          role="application"
          aria-label="Area interattiva dell’immagine. Usa la colonna delle didascalie a destra per selezionare un dettaglio."
        >
          <div className="spot-canvas-wrap" style={{ transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoom + ')' }}>
            <canvas ref={canvasRef} className="spot-canvas" />
          </div>
        </div>
        <div className="cap-rail" aria-label="Didascalie dei dettagli">
          <span className="rail-title">Dettagli · {hotspots.length}</span>
          {hotspots.map((d, i) => {
            const on = viewMode === 'clean' && String(d.id) === String(selectedHotspotId);
            return (
              <button
                key={d.id}
                type="button"
                className={'cap' + (on ? ' on' : '') + (hoveredId === d.id ? ' hover' : '')}
                onClick={() => { if (viewMode === 'annotated') setViewMode('clean'); onHotspotSelect(d); }}
                onMouseEnter={() => setHoveredId(d.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(d.id)}
                onBlur={() => setHoveredId(null)}
                aria-pressed={on}
              >
                <span className="num">{i + 1}</span>
                <span><span className="cap-t">{d.title}</span>{d.category ? <span className="cap-c">{d.category}</span> : null}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="spot-hint">L’immagine occupa le fasce 1–4; la fascia 5 a destra elenca le didascalie dei dettagli. Premi una didascalia: quel dettaglio resta a colori, il resto dell’immagine diventa in scala di grigi. Ripremi la didascalia attiva per tornare all’immagine completa. Con “Riquadri e didascalie” vedi l’immagine annotata con tutti i riquadri e le didascalie disegnati.</p>
    </section>
  );
}