// noesis-roads-creator — renderer testuali dal modello intermedio di esportazione.
// Markdown, JSON, HTML standalone, slideshow HTML, EPUB. Zero dipendenze (solo Node stdlib).
import { deflateRawSync } from 'node:zlib';

const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function imgTag(img, images, alt, style) {
  if (!img || !img.ref || !images[img.ref]) return '';
  const im = images[img.ref];
  return `<img src="data:${im.mime || 'image/jpeg'};base64,${im.data}" alt="${escH(alt || '')}"${style ? ` style="${style}"` : ''} />`;
}

function blocksMd(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.t === 'p' || b.t === 'h2') out.push((b.t === 'h2' ? '### ' : '') + (b.text || '') + '\n');
    else if (b.t === 'image') out.push(`*[Immagine${b.caption ? ': ' + b.caption : ''}]*\n`);
    else if (b.t === 'points') for (const p of (b.items || [])) out.push(`- **${p.title || ''}** ${p.text || ''}\n`.trim() + '\n');
    else if (b.t === 'gallery') for (const w of (b.items || [])) out.push(`- **${w.caption || ''}**${w.meta ? ' — ' + w.meta : ''}\n`);
    else if (b.t === 'kv') { out.push(''); for (const [k, v] of (b.items || [])) out.push(`| ${k} | ${v} |`); out.push(''); }
    else if (b.t === 'pair') {
      for (const side of [b.a, b.b]) {
        if (!side) continue;
        out.push(`**${side.caption || ''}**\n`);
        for (const m of (side.meta || [])) out.push(m + '\n');
      }
    }
  }
  return out.join('\n');
}

export function toMarkdown(m) {
  const L = [];
  L.push(`# ${m.titolo}\n`);
  L.push(`*${m.subtitle}*  ·  Livelli: ${m.livelli.verbosita} / ${m.livelli.istruzione}\n`);
  if (m.coverImage) L.push(`*[Immagine di copertina]*\n`);
  for (const s of m.sections) {
    L.push(`\n## ${s.title}\n`);
    if (s.verifica) L.push(s.verifica.dubbi > 0 ? `> ⚠ ${s.verifica.dubbi} punti da ricontrollare\n` : `> ✓ Verificato sul web\n`);
    L.push(blocksMd(s.blocks));
  }
  if (m.fonti.length) {
    L.push(`\n## Fonti\n`);
    for (const f of m.fonti) L.push(`- [${f.title}](${f.url})\n`);
  }
  L.push(`\n*${m.disclaimer}*\n`);
  return L.join('\n');
}

export function toJson(m) {
  return JSON.stringify(m, null, 2) + '\n';
}

const CSS = `body{font-family:Georgia,serif;max-width:760px;margin:auto;padding:32px 20px;color:#17344a;background:#fffdf9;line-height:1.7}h1{font-size:2em;margin:.2em 0}h2{margin-top:1.8em;border-bottom:2px solid #dc7056;padding-bottom:.2em}img{max-width:100%;height:auto;border-radius:8px}figure{margin:1.2em 0}figcaption{font-size:.85em;color:#6b7a83}table{border-collapse:collapse;width:100%;margin:1em 0}td,th{border:1px solid #dedbd3;padding:6px 10px;text-align:left}.badge{display:inline-block;background:#eef4ea;border:1px solid #d5e2cf;border-radius:20px;padding:2px 10px;font-size:.75em}.warn{background:#fdf3ec;border-color:#eec9b8}.fonti{font-size:.85em;color:#6b7a83}.cover{text-align:center;margin-bottom:2em}.eyebrow{color:#dc7056;text-transform:uppercase;font-size:.75em;letter-spacing:.15em;font-weight:700}`;

function blocksHtml(blocks, images) {
  const out = [];
  for (const b of blocks) {
    if (b.t === 'p') out.push(`<p>${escH(b.text)}</p>`);
    else if (b.t === 'h2') out.push(`<h3>${escH(b.text)}</h3>`);
    else if (b.t === 'image') out.push(`<figure>${imgTag(b.image, images, b.caption)}<figcaption>${escH(b.caption || '')}</figcaption></figure>`);
    else if (b.t === 'points') out.push('<ul>' + (b.items || []).map((p) => `<li><strong>${escH(p.title || '')}</strong> ${escH(p.text || '')}</li>`).join('') + '</ul>');
    else if (b.t === 'gallery') out.push((b.items || []).map((w) => `<figure>${imgTag(w.image, images, w.caption)}<figcaption><strong>${escH(w.caption || '')}</strong>${w.meta ? '<br>' + escH(w.meta) : ''}</figcaption></figure>`).join(''));
    else if (b.t === 'kv') out.push('<table>' + (b.items || []).map(([k, v]) => `<tr><td><strong>${escH(k)}</strong></td><td>${escH(v)}</td>`).join('') + '</table>');
    else if (b.t === 'pair') {
      out.push('<table><tr>' + [b.a, b.b].map((s) => s ? `<td><strong>${escH(s.caption || '')}</strong><br>${imgTag(s.image, images, s.caption)}${(s.meta || []).map((m) => `<p>${escH(m)}</p>`).join('')}</td>` : '<td></td>').join('') + '</tr></table>');
    }
  }
  return out.join('\n');
}

function capoversi(text, per) {
  // Spezza un paragrafo lungo in capoversi da `per` frasi: respiro di lettura.
  per = per || 2;
  const frasi = String(text || '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Þ\u201c\u201c"(])/).map((f) => f.trim()).filter(Boolean);
  if (!frasi.length) return String(text || '').trim() ? [String(text).trim()] : [];
  const out = [];
  for (let i = 0; i < frasi.length; i += per) out.push(frasi.slice(i, i + per).join(' '));
  return out;
}
function verBadge(s) {
  if (!s.verifica) return '';
  return s.verifica.dubbi > 0
    ? ` <span class="badge warn">⚠ ${s.verifica.dubbi} da ricontrollare</span>`
    : ` <span class="badge">✓ Verificato</span>`;
}

export function toHtml(m, { title = null } = {}) {
  const secs = m.sections.map((s) =>
    `<section><h2>${escH(s.title)}${verBadge(s)}</h2>\n${blocksHtml(s.blocks, m.images)}` +
    ((s.verifica && s.verifica.fonti && s.verifica.fonti.length)
      ? `<p class="fonti">Fonti sezione: ` + s.verifica.fonti.map((f) => `<a href="${escH(f.url)}">${escH(f.title || f.url)}</a>`).join(' · ') + `</p>` : '') +
    `</section>`).join('\n');
  const fonti = m.fonti.length ? `<section><h2>Fonti</h2><ul class="fonti">` + m.fonti.map((f) => `<li><a href="${escH(f.url)}">${escH(f.title)}</a></li>`).join('') + `</ul></section>` : '';
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(title || m.titolo)}</title><style>${CSS}</style></head><body>` +
    `<p class="eyebrow">${escH(m.eyebrow)}</p><h1>${escH(m.titolo)}</h1><p><em>${escH(m.subtitle)}</em> · Livelli: ${escH(m.livelli.verbosita)} / ${escH(m.livelli.istruzione)}</p>` +
    (m.coverImage ? `<div class="cover">${imgTag(m.coverImage, m.images, m.titolo, 'max-height:420px')}</div>` : '') +
    secs + fonti + `<hr><p class="fonti"><em>${escH(m.disclaimer)}</em></p></body></html>`;
}

export function toSlidesHtml(m) {
  const slides = [];
  slides.push({ title: m.titolo, html: `<p><em>${escH(m.subtitle)}</em></p><p>Livelli: ${escH(m.livelli.verbosita)} / ${escH(m.livelli.istruzione)}</p>` + (m.coverImage ? imgTag(m.coverImage, m.images, m.titolo, 'max-height:50vh') : '') });
  for (const s of m.sections) {
    // REGOLA: mai più di 2 punti per slide, testo integrale.
    const bullets = [];
    for (const b of s.blocks) {
      if (b.t === 'p' && b.text) for (const cap of capoversi(b.text)) bullets.push(escH(cap));
      else if (b.t === 'h2') bullets.push('<strong>' + escH(b.text) + '</strong>');
      else if (b.t === 'points') for (const p of (b.items || [])) bullets.push('<strong>' + escH(p.title || '') + '</strong> ' + escH(p.text || ''));
      else if (b.t === 'gallery') for (const w of (b.items || [])) bullets.push('<strong>' + escH(w.caption || '') + '</strong>' + (w.meta ? '<br>' + escH(w.meta) : ''));
      else if (b.t === 'kv') for (const [k, v] of (b.items || [])) bullets.push('<strong>' + escH(k) + ':</strong> ' + escH(v));
      else if (b.t === 'pair') for (const side of [b.a, b.b]) if (side) bullets.push('<strong>' + escH(side.caption || '') + ':</strong> ' + escH((side.meta || []).join(' ')));
    }
    let img = null;
    for (const b of s.blocks) {
      const cand = b.t === 'image' ? b.image : b.t === 'gallery' ? (b.items || [])[0]?.image : null;
      if (cand) { img = cand; break; }
    }
    for (let i = 0; i < Math.max(bullets.length, 1); i += 2) {
      const pair = bullets.slice(i, i + 2);
      const suffix = bullets.length > 2 ? ` (${Math.floor(i / 2) + 1}/${Math.ceil(bullets.length / 2)})` : '';
      slides.push({ title: s.title + suffix, html: `<ul>${pair.map((x) => `<li>${x}</li>`).join('')}</ul>` + (i === 0 && img ? `<div>${imgTag(img, m.images, s.title, 'max-height:38vh')}</div>` : '') });
    }
  }
  const fch = m.fonti.length ? m.fonti : [null];
  fch.forEach(function (_, fi, arr) {
    if (fi % 2 !== 0) return;
    const gp = arr.slice(fi, fi + 2).filter(Boolean);
    const suffix = arr.length > 2 && arr[0] ? ` (${Math.floor(fi / 2) + 1}/${Math.ceil(arr.length / 2)})` : '';
    slides.push({ title: 'Fonti' + suffix, html: gp.length ? '<ul>' + gp.map((f) => `<li><a href="${escH(f.url)}">${escH(f.title)}</a></li>`).join('') + '</ul>' : '<p>Nessuna fonte allegata.</p>' });
  });
  const slidesJs = JSON.stringify(slides);
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(m.titolo)} — slide</title><style>
body{font-family:Georgia,serif;background:#102a43;color:#fffdf9;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.slide{max-width:960px;width:92%;padding:48px;max-height:100vh;overflow-y:auto}h1{font-size:2.6em;margin:.2em 0}.eyebrow{color:#e2ac44;text-transform:uppercase;letter-spacing:.15em;font-size:.8em}li{margin:.5em 0;font-size:1.15em}img{max-width:100%;border-radius:8px}.nav{position:fixed;bottom:24px;right:32px;font-size:.9em;color:#e2ac44}.fonti{font-size:.8em;color:#e2ac44}a{color:#e2ac44}.count{position:fixed;bottom:24px;left:32px;color:#e2ac44}
</style></head><body><div class="slide"><p class="eyebrow">${escH(m.eyebrow)}</p><h1 id="t"></h1><div id="b"></div></div>
<div class="count" id="c"></div><div class="nav">← → · ?slide=N</div>
<script>var S=${slidesJs};var i=0;var q=new URLSearchParams(location.search);var n=parseInt(q.get('slide')||'1',10);if(n>=1&&n<=S.length)i=n-1;
function show(){document.getElementById('t').textContent=S[i].title;document.getElementById('b').innerHTML=S[i].html;document.getElementById('c').textContent=(i+1)+' / '+S.length;}
document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'&&i<S.length-1)i++;if(e.key==='ArrowLeft'&&i>0)i--;history.replaceState(null,'','?slide='+(i+1));show();});
document.addEventListener('click',function(){if(i<S.length-1)i++;history.replaceState(null,'','?slide='+(i+1));show();});
show();<\/script></body></html>`;
}

// ---------- EPUB (ZIP manuale, zero dipendenze) ----------
function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c; }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}
function zipFile(name, data, compress) {
  const nameBuf = Buffer.from(name, 'utf8');
  const body = compress ? deflateRawSync(data) : data;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034B50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0, 6);
  h.writeUInt16LE(compress ? 8 : 0, 8);
  h.writeUInt16LE(0, 10); h.writeUInt16LE(0, 12);
  h.writeUInt32LE(crc32(data), 14);
  h.writeUInt32LE(body.length, 18);
  h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(nameBuf.length, 26);
  h.writeUInt16LE(0, 28);
  return { header: Buffer.concat([h, nameBuf]), body, crc: crc32(data), csize: body.length, size: data.length, name: nameBuf };
}
function zipArchive(files) {
  // files: [{name, data: Buffer, compress}]
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const z = zipFile(f.name, f.data, f.compress !== false);
    parts.push(z.header, z.body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014B50, 0);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(z.header[8] === 8 ? 8 : 0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(z.crc, 16);
    ch.writeUInt32LE(z.csize, 20);
    ch.writeUInt32LE(z.size, 24);
    ch.writeUInt16LE(z.name.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, z.name);
    offset += z.header.length + z.body.length;
  }
  const cdStart = offset;
  const cd = Buffer.concat(central);
  offset += cd.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(0, 8); end.writeUInt16LE(0, 10);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...parts, cd, end]);
}

export function toEpub(m) {
  const files = [
    { name: 'mimetype', data: Buffer.from('application/epub+zip'), compress: false },
    { name: 'META-INF/container.xml', data: Buffer.from(`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`) },
  ];
  const items = [];
  const push = (id, href, media, data) => { files.push({ name: 'OEBPS/' + href, data }); items.push(`<item id="${id}" href="${href}" media-type="${media}"/>`); };
  let n = 0;
  const chap = (title, body) => {
    n += 1;
    const xhtml = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escH(title)}</title></head><body><h1>${escH(title)}</h1>${body}</body></html>`;
    push('c' + n, 'ch' + n + '.xhtml', 'application/xhtml+xml', Buffer.from(xhtml, 'utf8'));
    return 'ch' + n + '.xhtml';
  };
  const spine = [];
  const imgFiles = {};
  for (const [key, im] of Object.entries(m.images)) {
    const ext = (im.mime || '').includes('png') ? 'png' : 'jpg';
    const href = 'img/' + key + '.' + ext;
    files.push({ name: 'OEBPS/' + href, data: Buffer.from(im.data, 'base64') });
    items.push(`<item id="img-${key}" href="${href}" media-type="${im.mime || 'image/jpeg'}"/>`);
    imgFiles[key] = href;
  }
  const eimg = (img, alt) => {
    if (!img || !img.ref || !imgFiles[img.ref]) return '';
    return `<p><img src="${imgFiles[img.ref]}" alt="${escH(alt || '')}"/></p>`;
  };
  const eb = (blocks) => blocks.map((b) => {
    if (b.t === 'p') return `<p>${escH(b.text)}</p>`;
    if (b.t === 'h2') return `<h2>${escH(b.text)}</h2>`;
    if (b.t === 'image') return eimg(b.image, b.caption) + `<p><i>${escH(b.caption || '')}</i></p>`;
    if (b.t === 'points') return '<ul>' + (b.items || []).map((p) => `<li><b>${escH(p.title || '')}</b> ${escH(p.text || '')}</li>`).join('') + '</ul>';
    if (b.t === 'gallery') return (b.items || []).map((w) => eimg(w.image, w.caption) + `<p><b>${escH(w.caption || '')}</b>${w.meta ? '<br/>' + escH(w.meta) : ''}</p>`).join('');
    if (b.t === 'kv') return '<table>' + (b.items || []).map(([k, v]) => `<tr><td><b>${escH(k)}</b></td><td>${escH(v)}</td>`).join('') + '</table>';
    if (b.t === 'pair') return [b.a, b.b].map((s) => s ? `<h3>${escH(s.caption || '')}</h3>` + eimg(s.image, s.caption) + (s.meta || []).map((x) => `<p>${escH(x)}</p>`).join('') : '').join('');
    return '';
  }).join('');
  spine.push(chap(m.titolo, `<p><i>${escH(m.subtitle)} — ${escH(m.livelli.verbosita)} / ${escH(m.livelli.istruzione)}</i></p>` + (m.coverImage ? eimg(m.coverImage, m.titolo) : '')));
  const spineTitles = [m.titolo];
  for (const s of m.sections) { spine.push(chap(s.title, eb(s.blocks))); spineTitles.push(s.title); }
  if (m.fonti.length) { spine.push(chap('Fonti', '<ul>' + m.fonti.map((f) => `<li><a href="${escH(f.url)}">${escH(f.title)}</a></li>`).join('') + '</ul>')); spineTitles.push('Fonti'); }
  // NCX (EPUB 2): senza mappa di navigazione i reader non mostrano alcun TOC.
  const uid = 'noesis-' + Date.now();
  const navPoints = spine.map((href, i) =>
    `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escH(spineTitles[i] || ('Capitolo ' + (i + 1)))}</text></navLabel><content src="${escH(href)}"/></navPoint>`).join('');
  const ncx = `<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>${escH(m.titolo)}</text></docTitle><navMap>${navPoints}</navMap></ncx>`;
  files.push({ name: 'OEBPS/toc.ncx', data: Buffer.from(ncx, 'utf8') });
  items.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
  const opf = `<?xml version="1.0" encoding="utf-8"?><package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escH(m.titolo)}</dc:title><dc:language>it</dc:language><dc:identifier id="id">${uid}</dc:identifier></metadata><manifest>${items.join('')}</manifest><spine toc="ncx">${spine.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`;
  files.push({ name: 'OEBPS/content.opf', data: Buffer.from(opf, 'utf8') });
  return zipArchive(files);
}
