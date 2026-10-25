/* =====================================================================
   vista2d.js — Representaciones en 2D (SVG):
     · Fórmula desarrollada: cada átomo con su símbolo y rayas para los
       enlaces (dobles con dos rayas; cuñas = estereoquímica).
     · Semidesarrollada (sin H): los H se agrupan con su átomo (OH, CH₂…).
     · Proyección de Fischer y de Haworth (monosacáridos).
     · Esquema Fischer → Haworth de la ciclación.
   Coordenadas 2D calculadas con RDKit (ver herramientas/complementos.py).
   ===================================================================== */
const Vista2D = (() => {
  const ESC = 34;                     // píxeles por unidad (≈ 1 Å)
  const FUENTE = 16;
  const COLOR = { O: '#e03131', N: '#3b5bdb', P: '#e8590c', S: '#b08900', Fe: '#c2410c' };
  const sub = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
  const colorEl = e => COLOR[e] || (e === 'H' ? 'var(--texto-suave)' : 'var(--texto)');
  const anchoTexto = (t, f = FUENTE) => [...t].reduce((a, c) => a + ('₀₁₂₃₄₅₆₇₈₉⁺⁻'.includes(c) ? 0.42 : 0.62), 0) * f;

  let cont = null, svg = null, vista = null, alPulsar = null;

  /* ---------------- zoom y desplazamiento ---------------- */
  function montar(contenedor) {
    cont = contenedor;
    cont.innerHTML = `<div class="v2d-pie"></div><div class="v2d-lienzo"></div>
      <div class="v2d-botones">
        <button class="btn-icono" data-z="1.25" title="Acercar" aria-label="Acercar">+</button>
        <button class="btn-icono" data-z="0.8" title="Alejar" aria-label="Alejar">−</button>
        <button class="btn-icono" data-z="0" title="Ajustar" aria-label="Ajustar al visor">⤢</button>
      </div>`;
    cont.querySelectorAll('[data-z]').forEach(b => b.onclick = () => {
      const z = +b.dataset.z;
      if (!z) return ajustar();
      zoom(1 / z, vista.x + vista.w / 2, vista.y + vista.h / 2);
    });
    const lienzo = cont.querySelector('.v2d-lienzo');
    lienzo.addEventListener('wheel', e => {
      e.preventDefault();
      const p = aSvg(e.clientX, e.clientY);
      zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    }, { passive: false });
    // arrastrar con ratón o con un dedo; pellizcar con dos
    const punteros = new Map();
    let inicio = null, distIni = 0, moviendo = false;
    lienzo.addEventListener('pointerdown', e => {
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      inicio = { x: e.clientX, y: e.clientY, v: { ...vista } };
      moviendo = false;
      if (punteros.size === 2) { const [a, b] = [...punteros.values()]; distIni = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    lienzo.addEventListener('pointermove', e => {
      if (!punteros.has(e.pointerId) || !inicio) return;
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = lienzo.getBoundingClientRect(), k = inicio.v.w / r.width;
      if (punteros.size === 2) {
        const [a, b] = [...punteros.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (distIni > 0) { const c = aSvg((a.x + b.x) / 2, (a.y + b.y) / 2); zoom(distIni / d, c.x, c.y); distIni = d; }
        moviendo = true; return;
      }
      const dx = e.clientX - inicio.x, dy = e.clientY - inicio.y;
      if (Math.hypot(dx, dy) > 4) moviendo = true;
      if (moviendo) { vista.x = inicio.v.x - dx * k; vista.y = inicio.v.y - dy * k; aplicar(); lienzo.setPointerCapture(e.pointerId); }
    });
    const fin = e => { punteros.delete(e.pointerId); if (!punteros.size) inicio = null; };
    lienzo.addEventListener('pointerup', e => {
      if (!moviendo && alPulsar) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const t = el && el.closest('[data-i],[data-e]');
        if (t) alPulsar(t.dataset.i !== undefined ? { atomo: +t.dataset.i } : { enlace: t.dataset.e });
      }
      fin(e);
    });
    lienzo.addEventListener('pointercancel', fin);
  }
  function aSvg(cx, cy) {
    const r = cont.querySelector('.v2d-lienzo').getBoundingClientRect();
    return { x: vista.x + (cx - r.left) / r.width * vista.w, y: vista.y + (cy - r.top) / r.height * vista.h };
  }
  function zoom(f, px, py) {
    vista.x = px - (px - vista.x) * f; vista.y = py - (py - vista.y) * f; vista.w *= f; vista.h *= f; aplicar();
  }
  function aplicar() { if (svg) svg.setAttribute('viewBox', `${vista.x} ${vista.y} ${vista.w} ${vista.h}`); }
  function ajustar() {
    const caja = svg.getBBox(), r = cont.querySelector('.v2d-lienzo').getBoundingClientRect();
    const m = 30, w = caja.width + 2 * m, h = caja.height + 2 * m;
    const asp = r.width / Math.max(1, r.height);
    vista = w / h > asp ? { x: caja.x - m, y: caja.y - m - (w / asp - h) / 2, w, h: w / asp } : { x: caja.x - m - (h * asp - w) / 2, y: caja.y - m, w: h * asp, h };
    aplicar();
  }
  function poner(svgTexto, pie) {
    const lienzo = cont.querySelector('.v2d-lienzo');
    lienzo.innerHTML = svgTexto;
    svg = lienzo.querySelector('svg');
    cont.querySelector('.v2d-pie').innerHTML = pie || '';
    vista = { x: 0, y: 0, w: 100, h: 100 };
    requestAnimationFrame(ajustar);
  }

  /* ---------------- fórmula desarrollada / semidesarrollada ---------------- */
  /* p: { atomos, xy (lista [x,y] o null por átomo), cunas, conH, mapa (Map átomo→{color}),
         enlacesRes: [{clave, pares, color}], hbonds, numeros, alPulsar } */
  function formula(p) {
    alPulsar = p.alPulsar;
    const A = p.atomos, xy = p.xy;
    const P = i => xy[i] ? { x: xy[i][0] * ESC, y: xy[i][1] * ESC } : null;
    const nH = i => A[i].bonds.filter(j => A[j].elem === 'H').length;
    // texto y tamaño de cada etiqueta
    const etq = A.map((a, i) => {
      if (!xy[i]) return null;
      let t = a.elem, invertir = false;
      if (!p.conH && a.elem !== 'H') {
        const h = nH(i);
        if (h) {
          const pes = a.bonds.filter(j => xy[j] && A[j].elem !== 'H');
          const dx = pes.reduce((s, j) => s + xy[j][0] - xy[i][0], 0);
          invertir = pes.length > 0 && dx > 0.2 && a.elem !== 'C';
          const hs = 'H' + (h > 1 ? sub(h) : '');
          t = pes.length === 0 ? (a.elem === 'O' ? 'H₂O' : a.elem + hs) : (invertir ? hs + a.elem : a.elem + hs);
        }
      }
      return { t, w: anchoTexto(t) / 2 + 2, h: FUENTE * 0.58 };
    });
    const recortar = (a, b, e) => {   // punto del borde de la etiqueta e en dirección a→b
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const s = Math.min(e.w / Math.abs(dx / L || 1e-9), e.h / Math.abs(dy / L || 1e-9));
      return { x: a.x + dx / L * s, y: a.y + dy / L * s };
    };
    const cunas = new Map((p.cunas || []).map(([i, j, t]) => [i + '-' + j, t]));
    const res = [], enl = [], lab = [], hb = [];
    // resaltado de enlaces (debajo)
    (p.enlacesRes || []).forEach((r, k) => r.pares.forEach(([i, j]) => {
      const a = P(i), b = P(j); if (!a || !b) return;
      res.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${r.color}" stroke-width="13" stroke-linecap="round" opacity=".45" data-e="${k}" class="v2d-pulsable"/>`);
    }));
    // enlaces
    const hecho = new Set();
    A.forEach((a, i) => a.bonds.forEach((j, k) => {
      const clave = i < j ? i + '-' + j : j + '-' + i;
      if (hecho.has(clave)) return; hecho.add(clave);
      const pa = P(i), pb = P(j); if (!pa || !pb || !etq[i] || !etq[j]) return;
      const a1 = recortar(pa, pb, etq[i]), b1 = recortar(pb, pa, etq[j]);
      const orden = a.bondOrder ? a.bondOrder[k] : 1;
      const dx = b1.x - a1.x, dy = b1.y - a1.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const cuna = cunas.get(i + '-' + j) ? [i, j, cunas.get(i + '-' + j)] : cunas.get(j + '-' + i) ? [j, i, cunas.get(j + '-' + i)] : null;
      if (cuna && orden === 1) {
        const [s0, s1] = cuna[0] === i ? [a1, b1] : [b1, a1], w = 4.5;
        if (cuna[2] === 'w') enl.push(`<polygon points="${s0.x},${s0.y} ${s1.x + nx * w},${s1.y + ny * w} ${s1.x - nx * w},${s1.y - ny * w}" fill="var(--texto)"/>`);
        else for (let t = 0.15; t <= 1; t += 0.17) {
          const cx = s0.x + (s1.x - s0.x) * t, cy = s0.y + (s1.y - s0.y) * t, ww = w * t;
          enl.push(`<line x1="${cx + nx * ww}" y1="${cy + ny * ww}" x2="${cx - nx * ww}" y2="${cy - ny * ww}" stroke="var(--texto)" stroke-width="1.6"/>`);
        }
        return;
      }
      const linea = off => `<line x1="${a1.x + nx * off}" y1="${a1.y + ny * off}" x2="${b1.x + nx * off}" y2="${b1.y + ny * off}" stroke="var(--texto)" stroke-width="2"/>`;
      if (orden === 2) enl.push(linea(3.2), linea(-3.2));
      else if (orden === 3) enl.push(linea(0), linea(4.5), linea(-4.5));
      else enl.push(linea(0));
    }));
    // puentes de hidrógeno
    (p.hbonds || []).forEach(h => {
      const a = P(h.a), b = P(h.b); if (!a || !b) return;
      const a1 = recortar(a, b, etq[h.a]), b1 = recortar(b, a, etq[h.b]);
      hb.push(`<line x1="${a1.x}" y1="${a1.y}" x2="${b1.x}" y2="${b1.y}" stroke="${h.color}" stroke-width="2.4" stroke-dasharray="5 4" data-e="hb${h.k}" class="v2d-pulsable"/>`);
    });
    // etiquetas de los átomos
    A.forEach((a, i) => {
      const e = etq[i], q = P(i); if (!e || !q) return;
      const r = p.mapa.get(i);
      const fondo = r ? `<rect x="${q.x - e.w - 2}" y="${q.y - e.h - 3}" width="${2 * e.w + 4}" height="${2 * e.h + 6}" rx="8" fill="${r.color}" opacity=".35"/>` : '';
      const num = p.numeros && a._num && a.elem === 'C' ? `<text x="${q.x + e.w + 1}" y="${q.y + e.h + 6}" class="v2d-num">${a._num.slice(1)}</text>` : '';
      lab.push(`<g data-i="${i}" class="v2d-pulsable">${fondo}<rect x="${q.x - e.w}" y="${q.y - e.h}" width="${2 * e.w}" height="${2 * e.h}" fill="transparent"/>` +
        `<text x="${q.x}" y="${q.y}" fill="${r ? r.color : colorEl(a.elem)}" font-weight="${r ? 800 : 600}" class="v2d-at">${e.t}</text>${num}</g>`);
    });
    poner(`<svg xmlns="http://www.w3.org/2000/svg" class="v2d-svg">${res.join('')}${enl.join('')}${hb.join('')}${lab.join('')}</svg>`, p.pie);
  }

  /* ---------------- proyecciones de Fischer y Haworth ---------------- */
  // spec: { tipo: 'aldosa'|'cetosa', oh: ['D'|'I'|'H', ...] (C asimétricos de arriba abajo), anillo, anomero }
  const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" class="v2d-at" fill="${o.color || colorEl(s === 'O' ? 'O' : 'C')}"${o.peso ? ` font-weight="${o.peso}"` : ''}${o.ancla ? ` text-anchor="${o.ancla}"` : ''}>${s}</text>`;
  const l = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.color || 'var(--texto)'}" stroke-width="${o.w || 2}" stroke-linecap="round"/>`;
  const RESALTE = '#7048e8';

  function fischerSVG(spec, x0, y0, marcarCiclo) {
    const paso = 62, ancho = 46, out = [];
    const filas = [];
    if (spec.tipo === 'aldosa') filas.push({ c: 'CHO' });
    else filas.push({ c: 'CH2OH' }, { c: 'CO' });
    spec.oh.forEach(o => filas.push({ c: 'X', o }));
    filas.push({ c: 'CH2OH' });
    const n = filas.length;
    // índice de la fila cuyo –OH cierra el anillo (C5 en hexosas, C4 en pentosas)
    const filaCierre = spec.anillo ? (spec.tipo === 'aldosa' ? (spec.anillo === 'piranosa' ? 4 : 3) : 4) : -1;
    filas.forEach((f, k) => {
      const y = y0 + k * paso, x = x0;
      if (k < n - 1) out.push(l(x, y + 12, x, y + paso - 12));
      const numero = `<text x="${x - 13}" y="${y - 11}" class="v2d-num">${k + 1}</text>`;
      if (f.c === 'CHO') {
        out.push(t(x, y, 'C'), l(x - 12, y, x - ancho + 12, y), t(x - ancho, y, 'H', { color: colorEl('H') }));
        const col = marcarCiclo ? RESALTE : null;
        out.push(l(x + 12, y - 3, x + ancho - 12, y - 3, { color: col }), l(x + 12, y + 3, x + ancho - 12, y + 3, { color: col }), t(x + ancho, y, 'O', { color: col || COLOR.O, peso: col ? 800 : null }));
      } else if (f.c === 'CO') {
        const col = marcarCiclo ? RESALTE : null;
        out.push(t(x, y, 'C'), l(x + 12, y - 3, x + ancho - 12, y - 3, { color: col }), l(x + 12, y + 3, x + ancho - 12, y + 3, { color: col }), t(x + ancho, y, 'O', { color: col || COLOR.O, peso: col ? 800 : null }));
      } else if (f.c === 'CH2OH') {
        out.push(t(x, y, 'CH₂OH'));
      } else {
        const der = f.o === 'D' ? 'OH' : 'H', izq = f.o === 'I' ? 'OH' : 'H';
        const col = marcarCiclo && k === filaCierre ? RESALTE : null;
        out.push(t(x, y, 'C'), l(x - 12, y, x - ancho + 14, y), l(x + 12, y, x + ancho - 14, y, { color: der === 'OH' ? col : null }));
        out.push(t(x - ancho - (izq === 'OH' ? 8 : 0), y, izq, { color: izq === 'OH' ? COLOR.O : colorEl('H') }));
        out.push(t(x + ancho + (der === 'OH' ? 8 : 0), y, der, { color: der === 'OH' ? (col || COLOR.O) : colorEl('H'), peso: col && der === 'OH' ? 800 : null }));
      }
      out.push(numero);
    });
    return { svg: out.join(''), alto: (n - 1) * paso, ancho: 2 * ancho + 40 };
  }

  /* haworthSVG dibuja el anillo cerrado; con abierto = true dibuja el PASO INTERMEDIO de la
     ciclación: la cadena abierta ya plegada con la forma del anillo, el –OH del C5 frente al
     grupo carbonilo y una flecha que indica el ataque (el enlace todavía no existe). */
  function haworthSVG(spec, x0, y0, marcarCiclo, abierto = false) {
    const out = [], L = 58;   // longitud de los sustituyentes
    const pir = spec.anillo === 'piranosa';
    // vértices del anillo (perspectiva): el O del anillo arriba a la derecha (piranosa) o arriba en el centro (furanosa)
    const V = pir
      ? { O: [72, -46], a: [146, 8], b: [80, 62], c: [-80, 62], d: [-146, 8], e: [-72, -46] }
      : { O: [0, -52], a: [128, -6], b: [64, 56], c: [-64, 56], d: [-128, -6] };
    // longitud de los sustituyentes [arriba, abajo]: cortos los que apuntan hacia dentro del anillo
    const LONG = pir ? { a: [L, L], b: [34, L], c: [34, L], d: [L, L], e: [L, 26] } : { a: [L, L], b: [34, L], c: [34, L], d: [L, L] };
    const orden = pir ? ['O', 'a', 'b', 'c', 'd', 'e'] : ['O', 'a', 'b', 'c', 'd'];
    const P = k => [x0 + V[k][0], y0 + V[k][1]];
    const delante = [['a', 'b'], ['b', 'c'], ['c', 'd']];
    orden.forEach((k, i) => {
      const s = orden[(i + 1) % orden.length];
      const [x1, y1] = P(k), [x2, y2] = P(s);
      const frente = delante.some(([u, v]) => (u === k && v === s) || (u === s && v === k));
      const r1 = k === 'O' ? 0.2 : 0, r2 = s === 'O' ? 0.2 : 0;
      if (abierto && ((k === 'O' && s === 'a') || (k === 'a' && s === 'O'))) return;   // enlace aún no formado
      out.push(l(x1 + (x2 - x1) * r1, y1 + (y2 - y1) * r1, x2 - (x2 - x1) * r2, y2 - (y2 - y1) * r2, { w: frente ? 7 : 2.4 }));
    });
    const [ox, oy] = P('O');
    if (abierto) {
      // –OH del C5 (aún con su H) y flecha curva hacia el carbono del carbonilo
      const [ax, ay] = P('a');
      out.push(t(ox + 8, oy, 'OH', { color: RESALTE, peso: 800 }));
      out.push(`<path d="M${ox + 26},${oy - 8} Q${ax + 6},${oy - 34} ${ax - 2},${ay - 12}" fill="none" stroke="${RESALTE}" stroke-width="2.2" stroke-dasharray="5 4" marker-end="url(#v2dFlechaM)"/>`);
    } else {
      out.push(t(ox, oy, 'O', { color: marcarCiclo ? RESALTE : COLOR.O, peso: marcarCiclo ? 800 : null }));
    }
    // sustituyentes por vértice
    const sustituyente = (k, arriba, abajo, num, colArriba, colAbajo) => {
      const [x, y] = P(k), [la, lb] = LONG[k];
      out.push(l(x, y - 2, x, y - la + 11), l(x, y + 2, x, y + lb - 11));
      const color = (g, c) => c || (g === 'H' ? colorEl('H') : 'var(--texto)');
      out.push(t(x, y - la, arriba, { color: color(arriba, colArriba), peso: colArriba ? 800 : null }));
      out.push(t(x, y + lb, abajo, { color: color(abajo, colAbajo), peso: colAbajo ? 800 : null }));
      const dx = V[k][0] > 0 ? 13 : -13;
      out.push(`<text x="${x + dx}" y="${y + 15}" class="v2d-num" text-anchor="middle">${num}</text>`);
    };
    const giro = o => o === 'D' ? ['H', 'OH'] : o === 'I' ? ['OH', 'H'] : ['H', 'H'];
    const ano = spec.anomero === 'β' ? 'arriba' : 'abajo';
    const col = marcarCiclo ? RESALTE : null;
    const carbonilo = (num, abajo) => {   // C=O hacia arriba y el otro sustituyente hacia abajo
      const [x, y] = P('a');
      // C=O hacia la derecha (dos rayas) y el otro sustituyente hacia abajo
      out.push(l(x + 4, y - 3, x + 40, y - 3, { color: RESALTE }), l(x + 4, y + 3, x + 40, y + 3, { color: RESALTE }), l(x, y + 2, x, y + L - 11));
      out.push(t(x + 50, y, 'O', { color: RESALTE, peso: 800 }), t(x, y + L, abajo, { color: abajo === 'H' ? colorEl('H') : 'var(--texto)' }));
      out.push(`<text x="${x + 13}" y="${y + 15}" class="v2d-num" text-anchor="middle">${num}</text>`);
    };
    if (abierto && spec.tipo === 'aldosa') carbonilo(1, 'H');
    else if (abierto) carbonilo(2, 'CH₂OH');
    if (spec.tipo === 'aldosa' && pir) {
      if (!abierto) sustituyente('a', ano === 'arriba' ? 'OH' : 'H', ano === 'arriba' ? 'H' : 'OH', 1, ano === 'arriba' ? col : null, ano === 'abajo' ? col : null);
      sustituyente('b', ...giro(spec.oh[0]), 2); sustituyente('c', ...giro(spec.oh[1]), 3); sustituyente('d', ...giro(spec.oh[2]), 4);
      sustituyente('e', 'CH₂OH', 'H', 5);
      out.push(`<text x="${P('e')[0] - 16}" y="${P('e')[1] - L - 14}" class="v2d-num">6</text>`);
    } else if (spec.tipo === 'aldosa') {   // aldopentosa furanosa (ribosa, desoxirribosa)
      if (!abierto) sustituyente('a', ano === 'arriba' ? 'OH' : 'H', ano === 'arriba' ? 'H' : 'OH', 1, ano === 'arriba' ? col : null, ano === 'abajo' ? col : null);
      sustituyente('b', ...giro(spec.oh[0]), 2); sustituyente('c', ...giro(spec.oh[1]), 3);
      sustituyente('d', 'CH₂OH', 'H', 4);
      out.push(`<text x="${P('d')[0] - 16}" y="${P('d')[1] - L - 14}" class="v2d-num">5</text>`);
    } else {                                // cetohexosa furanosa (fructosa)
      if (!abierto) sustituyente('a', ano === 'arriba' ? 'OH' : 'CH₂OH', ano === 'arriba' ? 'CH₂OH' : 'OH', 2, ano === 'arriba' ? col : null, ano === 'abajo' ? col : null);
      sustituyente('b', ...giro(spec.oh[0]), 3); sustituyente('c', ...giro(spec.oh[1]), 4);
      sustituyente('d', 'CH₂OH', 'H', 5);
      out.push(`<text x="${P('d')[0] - 16}" y="${P('d')[1] - L - 14}" class="v2d-num">6</text>`);
      out.push(`<text x="${P('a')[0] + 16}" y="${P('a')[1] + (abierto || ano !== 'arriba' ? L + 14 : -L - 14)}" class="v2d-num">1</text>`);
    }
    // colorear los OH
    return out.join('').replace(/>OH</g, `>OH<`);
  }

  function proyeccion(spec, modo, nombre) {
    alPulsar = null;
    const etiqueta = (x, y, s) => `<text x="${x}" y="${y}" class="v2d-titulo" text-anchor="middle">${s}</text>`;
    let svgTxt, pie;
    if (modo === 'fischer') {
      const f = fischerSVG(spec, 0, 0, false);
      svgTxt = f.svg + etiqueta(0, f.alto + 50, spec.nombre ? `${spec.nombre} (forma lineal)` : nombre);
      pie = 'Proyección de <b>Fischer</b>: la cadena carbonada en vertical, el C1 arriba. Las líneas horizontales salen hacia el observador. <b>D</b>: el –OH del último C asimétrico está a la <b>derecha</b>.';
    } else if (modo === 'haworth') {
      svgTxt = haworthSVG(spec, 0, 0, false) + etiqueta(0, 160, nombre);
      pie = 'Proyección de <b>Haworth</b>: el anillo se ve en perspectiva (borde grueso = hacia el observador). Lo que está a la derecha en Fischer queda <b>abajo</b>. ' +
        (spec.anomero ? `Anómero <b>${spec.anomero}</b>: el –OH anomérico está <b>${spec.anomero === 'β' ? 'arriba, del mismo lado que el' : 'abajo, en el lado opuesto al'}</b> CH₂OH del último carbono.` : '');
    } else {   // ciclación en tres pasos: Fischer → cadena plegada → Haworth
      const enlace = spec.tipo === 'aldosa' ? 'hemiacetal' : 'hemicetal';
      const c = spec.tipo === 'aldosa' ? 'C1' : 'C2';
      const defs = `<defs>` +
        `<marker id="v2dFlecha" markerUnits="userSpaceOnUse" markerWidth="13" markerHeight="13" refX="10" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--texto)"/></marker>` +
        `<marker id="v2dFlechaM" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${RESALTE}"/></marker></defs>`;
      const flecha = (x1, y1, x2, y2, t1, t2, vertical) => {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--texto)" stroke-width="2.5" marker-end="url(#v2dFlecha)"/>` +
          (vertical
            ? `<text x="${mx + 16}" y="${my - 6}" class="v2d-titulo">${t1}</text><text x="${mx + 16}" y="${my + 14}" class="v2d-num" style="font-size:13px">${t2}</text>`
            : `<text x="${mx}" y="${my - 14}" class="v2d-titulo" text-anchor="middle">${t1}</text><text x="${mx}" y="${my + 22}" class="v2d-num" text-anchor="middle" style="font-size:13px">${t2}</text>`);
      };
      const paso = (x, y, s) => `<text x="${x}" y="${y}" class="v2d-titulo" text-anchor="middle">${s}</text>`;
      const vertical = cont.querySelector('.v2d-lienzo').getBoundingClientRect().width < 640;
      const f = fischerSVG(spec, 0, 0, true);
      const altoF = f.alto;
      const t1 = 'se pliega la cadena', t1b = 'y gira el C5', t2 = `enlace ${enlace}`, t2b = `–OH del C5 + C=O del ${c}`;
      if (vertical) {
        const yI = altoF + 230, yH = yI + 380;
        svgTxt = defs + f.svg + paso(0, altoF + 46, '1. Forma lineal (Fischer)') +
          flecha(0, altoF + 64, 0, altoF + 140, t1, t1b, true) +
          haworthSVG(spec, 0, yI, true, true) + paso(0, yI + 152, '2. Cadena plegada') +
          flecha(0, yI + 172, 0, yI + 250, t2, t2b, true) +
          haworthSVG(spec, 0, yH, true) + paso(0, yH + 152, `3. ${spec.anomero}-${spec.nombreAnillo || ''}`);
      } else {
        const yR = altoF / 2;   // los anillos a media altura de la proyección de Fischer
        const xF = -600, xI = -170, xH = 470;
        svgTxt = defs + `<g transform="translate(${xF},0)">${f.svg}</g>` + paso(xF, altoF + 46, '1. Forma lineal (Fischer)') +
          flecha(xF + 110, yR, xI - 190, yR, t1, t1b) +
          haworthSVG(spec, xI, yR, true, true) + paso(xI, yR + 152, '2. Cadena plegada') +
          flecha(xI + 225, yR, xH - 190, yR, t2, t2b) +
          haworthSVG(spec, xH, yR, true) + paso(xH, yR + 152, `3. ${spec.anomero}-${spec.nombreAnillo || ''}`);
      }
      pie = vertical ? `<b>1</b> forma lineal → <b>2</b> cadena plegada (el –OH del C5 ataca al ${c}) → <b>3</b> anillo. En <b>morado</b>, los átomos que intervienen.` :
        `<b>1.</b> Forma lineal. <b>2.</b> La cadena se pliega y el enlace C4–C5 gira para que el –OH del C5 quede frente al grupo carbonilo (${c}); la flecha discontinua indica el ataque del O. ` +
        `<b>3.</b> Se forma el enlace ${enlace}: el O del C5 queda en el anillo y el O del carbonilo pasa a ser el <b>–OH anomérico</b> (${spec.anomero}: ${spec.anomero === 'β' ? 'arriba' : 'abajo'}). En <b>morado</b>, los átomos que intervienen.`;
    }
    poner(`<svg xmlns="http://www.w3.org/2000/svg" class="v2d-svg">${svgTxt}</svg>`, pie);
  }

  return { montar, formula, proyeccion, ajustar: () => svg && ajustar() };
})();
