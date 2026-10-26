/* =====================================================================
   vista-estudio.js — «Forma de estudio»: dibuja en SVG los dibujos de
   js/estudio.js (fondo blanco, trazo negro) y los relaciona átomo a átomo
   con la estructura 3D para sincronizar los resaltados.
     · emparejar(dib, atomos, an): correspondencia dibujo → átomos 3D
       (comprueba elementos, enlaces, H escritos, estereoquímica y puentes de H)
     · montar(contenedor) / dibujar(opciones)
   ===================================================================== */
const VistaEstudio = (() => {
  const ESC = 44;
  const SUB = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
  const COLOR_EL = { O: '#c92a2a', N: '#1c4fd6', P: '#d9480f', S: '#a37200' };

  /* =============== CORRESPONDENCIA DIBUJO ↔ 3D =============== */
  function emparejar(dib, A, an) {
    const S = dib.at, nS = S.length;
    const adj = S.map(() => []);
    dib.en.forEach(b => { adj[b.a].push({ j: b.b, o: b.o, agn: b.agn }); adj[b.b].push({ j: b.a, o: b.o, agn: b.agn }); });
    const real = S.map(s => s.el !== '*');
    const grado = u => adj[u].length + S[u].h;
    const orden3 = (i, j) => { const k = A[i].bonds.indexOf(j); return k < 0 ? 0 : (A[i].bondOrder ? A[i].bondOrder[k] || 1 : 1); };
    // orden de búsqueda: en anchura, empezando por los elementos menos frecuentes
    const rareza = { P: 0, S: 1, N: 2, O: 3, C: 4, H: 5 };
    const ordenBusq = [], padre = new Array(nS).fill(-1), visto = new Array(nS).fill(false);
    while (true) {
      const libres = S.map((s, i) => i).filter(i => real[i] && !visto[i]);
      if (!libres.length) break;
      libres.sort((a, b) => (rareza[S[a].el] ?? 9) - (rareza[S[b].el] ?? 9) || grado(b) - grado(a));
      const cola = [libres[0]]; visto[libres[0]] = true;
      while (cola.length) {
        const u = cola.shift(); ordenBusq.push(u);
        for (const { j } of adj[u]) if (real[j] && !visto[j]) { visto[j] = true; padre[j] = u; cola.push(j); }
      }
    }
    const map = new Array(nS).fill(-1), usado = new Set();
    let pasos = 0;
    const LIMITE = 3e6;

    const compatible = (u, i) => {
      if (A[i].elem !== S[u].el || A[i].bonds.length !== grado(u) || usado.has(i)) return false;
      for (const { j, o, agn } of adj[u]) {
        if (!real[j] || map[j] < 0) continue;
        const o3 = orden3(i, map[j]);
        if (!o3) return false;
        if (!agn && o !== o3) return false;
      }
      return true;
    };
    const vec = (a, b) => [A[a].x - A[b].x, A[a].y - A[b].y, A[a].z - A[b].z];
    const prod = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cruz = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

    function validar() {
      // 1) los H escritos junto al símbolo y los enlaces no dibujados
      const implicitos = new Array(nS).fill(null).map(() => []);
      const asignado = new Set(map.filter(x => x >= 0));
      for (let u = 0; u < nS; u++) {
        if (!real[u]) continue;
        const vecinosDib = new Set(adj[u].filter(x => real[x.j]).map(x => map[x.j]));
        const extra = A[map[u]].bonds.filter(i => !vecinosDib.has(i));
        const pseudo = adj[u].filter(x => !real[x.j]).length;
        if (extra.length !== pseudo + S[u].h) return null;
        // «···» representa la continuación de la cadena: debe ser un átomo pesado, no un H
        if (extra.filter(i => A[i].elem !== 'H').length !== pseudo) return null;
        const hs = extra.filter(i => A[i].elem === 'H' && !asignado.has(i));
        if (hs.length < S[u].h) return null;
        // un átomo dibujado no puede estar unido a otro dibujado sin que se dibuje el enlace
        if (extra.some(i => asignado.has(i))) return null;
        implicitos[u] = hs.slice(0, S[u].h);
      }
      // 2) Haworth: cada sustituyente en su cara del anillo
      for (const r of dib.anillos) {
        const P = r.ciclo.map(u => A[map[u]]);
        let n = [0, 0, 0];
        const c = [0, 0, 0]; P.forEach(p => { c[0] += p.x; c[1] += p.y; c[2] += p.z; }); c.forEach((v, k) => c[k] = v / P.length);
        for (let k = 0; k < P.length; k++) {
          const a = [P[k].x - c[0], P[k].y - c[1], P[k].z - c[2]], b = [P[(k + 1) % P.length].x - c[0], P[(k + 1) % P.length].y - c[1], P[(k + 1) % P.length].z - c[2]];
          const q = cruz(a, b); n = n.map((v, t) => v + q[t]);
        }
        let ref = null;
        for (const s of r.subs) {
          if (!real[s.x]) continue;
          const v = Math.sign(prod(vec(map[s.x], map[s.c]), n)) * (s.arriba ? 1 : -1);
          if (ref === null) ref = v; else if (v !== ref) return null;
        }
      }
      // 3) Fischer: horizontales hacia el observador, verticales hacia atrás
      for (const f of dib.fischer) {
        const C = map[f.c], U = vec(map[f.arriba], C), R = vec(map[f.der], C), L = vec(map[f.izq], C);
        if (prod(U, cruz(R, L)) >= 0) return null;
      }
      // 4) puentes de hidrógeno dibujados = puentes reales
      for (const [h, acc] of dib.hb) {
        if (!an.hbonds.some(x => (x.a === map[h] && x.b === map[acc]) || (x.b === map[h] && x.a === map[acc]))) return null;
      }
      return implicitos;
    }

    let resultado = null;
    function buscar(k) {
      if (++pasos > LIMITE) return true;
      if (k === ordenBusq.length) { const imp = validar(); if (imp) { resultado = { map: map.slice(), implicitos: imp }; return true; } return false; }
      const u = ordenBusq[k];
      const cand = padre[u] < 0 ? A.map((_, i) => i) : A[map[padre[u]]].bonds;
      for (const i of cand) {
        if (!compatible(u, i)) continue;
        map[u] = i; usado.add(i);
        if (buscar(k + 1)) return true;
        map[u] = -1; usado.delete(i);
      }
      return false;
    }
    buscar(0);
    return resultado;
  }

  /* =============== ZOOM Y DESPLAZAMIENTO =============== */
  let cont = null, svg = null, vista = null, clave = null, alPulsar = null;
  function montar(c) {
    cont = c;
    cont.innerHTML = `<div class="est-barra"></div><div class="est-lienzo"></div>
      <div class="v2d-botones est-zoom">
        <button class="btn-icono" data-z="1.25" title="Acercar" aria-label="Acercar">+</button>
        <button class="btn-icono" data-z="0.8" title="Alejar" aria-label="Alejar">−</button>
        <button class="btn-icono" data-z="0" title="Ajustar" aria-label="Ajustar">⤢</button>
      </div>`;
    cont.querySelectorAll('[data-z]').forEach(b => b.onclick = () => {
      const z = +b.dataset.z; if (!z) return ajustar();
      zoom(1 / z, vista.x + vista.w / 2, vista.y + vista.h / 2);
    });
    const lienzo = cont.querySelector('.est-lienzo');
    lienzo.addEventListener('wheel', e => { e.preventDefault(); const p = aSvg(e.clientX, e.clientY); zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });
    const punteros = new Map(); let inicio = null, distIni = 0, moviendo = false;
    lienzo.addEventListener('pointerdown', e => {
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY }); inicio = { x: e.clientX, y: e.clientY, v: { ...vista } }; moviendo = false;
      if (punteros.size === 2) { const [a, b] = [...punteros.values()]; distIni = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    lienzo.addEventListener('pointermove', e => {
      if (!punteros.has(e.pointerId) || !inicio) return;
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = lienzo.getBoundingClientRect(), k = inicio.v.w / r.width;
      if (punteros.size === 2) {
        const [a, b] = [...punteros.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (distIni > 0) { const c2 = aSvg((a.x + b.x) / 2, (a.y + b.y) / 2); zoom(distIni / d, c2.x, c2.y); distIni = d; }
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
        const t = el && el.closest('[data-n],[data-b],[data-h],[data-t]');
        if (t) alPulsar(t.dataset);
      }
      fin(e);
    });
    lienzo.addEventListener('pointercancel', fin);
  }
  function aSvg(cx, cy) {
    const r = cont.querySelector('.est-lienzo').getBoundingClientRect();
    return { x: vista.x + (cx - r.left) / r.width * vista.w, y: vista.y + (cy - r.top) / r.height * vista.h };
  }
  function zoom(f, px, py) { vista.x = px - (px - vista.x) * f; vista.y = py - (py - vista.y) * f; vista.w *= f; vista.h *= f; aplicar(); }
  function aplicar() { if (svg && vista) svg.setAttribute('viewBox', `${vista.x} ${vista.y} ${vista.w} ${vista.h}`); }
  function ajustar() {
    if (!svg) return;
    const caja = svg.querySelector('.est-contenido').getBBox(), r = cont.querySelector('.est-lienzo').getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const m = 26, w = caja.width + 2 * m, h = caja.height + 2 * m, asp = r.width / Math.max(1, r.height);
    vista = w / h > asp ? { x: caja.x - m, y: caja.y - m - (w / asp - h) / 2, w, h: w / asp } : { x: caja.x - m - (h * asp - w) / 2, y: caja.y - m, w: h * asp, h };
    aplicar();
  }

  /* =============== DIBUJO =============== */
  // texto de cada átomo: símbolo + H escritos (los H a la izquierda si el átomo enlaza hacia la derecha)
  function etiqueta(dib, u) {
    const s = dib.at[u];
    if (s.el === '*') return '···';
    const carga = s.carga === '+' ? '⁺' : s.carga ? '⁻' : '';
    if (!s.h) return s.el + carga;
    const vec = dib.en.filter(b => b.a === u || b.b === u).map(b => dib.at[b.a === u ? b.b : b.a]);
    const dx = vec.reduce((t, v) => t + v.x - s.x, 0) / Math.max(1, vec.length);
    const hs = 'H' + (s.h > 1 ? SUB(s.h) : '');
    return (vec.length && dx > 0.3 ? hs + s.el : s.el + hs) + carga;
  }
  const ancho = t => [...t].reduce((a, c) => a + ('₀₁₂₃₄₅₆₇₈₉⁺⁻'.includes(c) ? 0.42 : c === '·' ? 0.3 : 0.62), 0) * 17;

  /* p: { dib, res (correspondencia), atomos, an, mapa, sel, practica, enlacesActivos, gruposActivos, alPulsar, clave } */
  function dibujar(p) {
    alPulsar = p.alPulsar;
    const { dib, res } = p, A = p.atomos;
    const pos = u => ({ x: dib.at[u].x * ESC, y: dib.at[u].y * ESC });
    // átomos 3D de cada nodo del dibujo y nodo de cada átomo 3D
    const atomosNodo = u => res ? [res.map[u], ...(res.implicitos[u] || [])].filter(i => i >= 0) : [];
    const nodoDe = new Map();
    if (res) dib.at.forEach((s, u) => atomosNodo(u).forEach(i => nodoDe.set(i, u)));
    const etq = dib.at.map((s, u) => { const t = etiqueta(dib, u); return { t, w: ancho(t) / 2 + 2, h: 10 }; });
    const recortar = (a, b, e) => {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const s = Math.min(e.w / Math.abs(dx / L || 1e-9), e.h / Math.abs(dy / L || 1e-9));
      return { x: a.x + dx / L * s, y: a.y + dy / L * s };
    };
    const capas = { fondo: [], cajas: [], enl: [], hb: [], at: [], tags: [], txt: [] };
    const etiquetas = [];   // para los clics en las etiquetas
    // enlaces
    dib.en.forEach((b, k) => {
      const pa = pos(b.a), pb = pos(b.b), a1 = recortar(pa, pb, etq[b.a]), b1 = recortar(pb, pa, etq[b.b]);
      const par = res ? [res.map[b.a], res.map[b.b]] : [];
      const resalte = p.enlacesActivos.find(x => x.pares.some(([i, j]) => (i === par[0] && j === par[1]) || (i === par[1] && j === par[0])));
      const sel = par.length && p.sel.has(par[0]) && p.sel.has(par[1]);
      if (resalte || sel) capas.fondo.push(`<line x1="${a1.x}" y1="${a1.y}" x2="${b1.x}" y2="${b1.y}" stroke="${sel ? '#fab005' : resalte.color}" stroke-width="12" stroke-linecap="round" opacity="${sel ? 0.75 : 0.45}"/>`);
      const dx = b1.x - a1.x, dy = b1.y - a1.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const linea = off => `<line x1="${a1.x + nx * off}" y1="${a1.y + ny * off}" x2="${b1.x + nx * off}" y2="${b1.y + ny * off}"/>`;
      const g = b.o === 2 ? linea(3) + linea(-3) : linea(0);
      capas.enl.push(`<g class="est-enlace" data-b="${k}"><line class="est-diana" x1="${a1.x}" y1="${a1.y}" x2="${b1.x}" y2="${b1.y}"/>${g}</g>`);
    });
    // puentes de hidrógeno
    const hbActivo = p.puentesActivos;
    dib.hb.forEach(([h, acc], k) => {
      const pa = pos(h), pb = pos(acc), a1 = recortar(pa, pb, etq[h]), b1 = recortar(pb, pa, etq[acc]);
      const sel = res && p.sel.has(res.map[h]) && p.sel.has(res.map[acc]);
      capas.hb.push(`<g class="est-hb" data-h="${k}"><line class="est-diana" x1="${a1.x}" y1="${a1.y}" x2="${b1.x}" y2="${b1.y}"/>` +
        `<line x1="${a1.x}" y1="${a1.y}" x2="${b1.x}" y2="${b1.y}" stroke="${sel ? '#e67700' : hbActivo ? '#0c8599' : '#222'}" stroke-width="2.2" stroke-dasharray="5 4"/></g>`);
    });
    // átomos
    dib.at.forEach((s, u) => {
      const q = pos(u), e = etq[u];
      const ats = atomosNodo(u);
      const col = ats.map(i => p.mapa.get(i)).find(Boolean);
      const sel = ats.some(i => p.sel.has(i));
      const fondo = sel ? `<rect x="${q.x - e.w - 3}" y="${q.y - e.h - 4}" width="${2 * e.w + 6}" height="${2 * e.h + 8}" rx="8" fill="#ffe066" stroke="#f59f00" stroke-width="2"/>`
        : col ? `<rect x="${q.x - e.w - 2}" y="${q.y - e.h - 3}" width="${2 * e.w + 4}" height="${2 * e.h + 6}" rx="7" fill="${col.color}" opacity=".3"/>` : '';
      const color = s.el === '*' ? '#868e96' : (col && !sel ? col.color : COLOR_EL[s.el] || '#111');
      capas.at.push(`<g class="est-atomo" data-n="${u}">${fondo}<rect x="${q.x - e.w}" y="${q.y - e.h}" width="${2 * e.w}" height="${2 * e.h}" fill="#fff"/>` +
        `<text x="${q.x}" y="${q.y}" fill="${color}">${e.t}</text></g>`);
    });
    // cajas (éster y peptídico) y etiquetas con el nombre de los enlaces característicos
    const CAJA = ['ester', 'peptidico'];
    const NOMBRAR = ['glucosidico', 'n_glucosidico', 'ester', 'peptidico', 'fosfoester', 'fosfodiester', 'fosfoanhidrido', 'hemiacetal', 'disulfuro'];
    const pendientes = [];
    const tag = (x, y, texto, color, info, lugar = 'abajo') => pendientes.push({ x, y, texto, color, info, lugar });
    if (res) {
      Object.entries(p.an.enlaces).forEach(([k, lista]) => {
        if (!NOMBRAR.includes(k)) return;
        lista.forEach(inst => {
          const ats = inst.pares.flat();
          if (!ats.every(i => nodoDe.has(i))) return;
          const nodos = [...new Set(ats.map(i => nodoDe.get(i)))];
          const color = (CATALOGO[k] || {}).color || '#333';
          const titulo = (inst.titulo || CATALOGO[k].nombre).replace(/^Enlace /, 'enlace ');
          if (CAJA.includes(k)) {
            // la caja rodea –CO–O– (éster) o –CO–NH– (peptídico): el C del carbonilo con su =O
            // y el O o el N; no incluye el carbono del alcohol
            const [ci, xi] = inst.pares[0];
            const base = [nodoDe.get(ci), nodoDe.get(xi)];
            const extra = [];
            base.forEach(u => dib.en.forEach(b => {
              const v = b.a === u ? b.b : b.b === u ? b.a : -1;
              if (v < 0) return;
              if ((dib.at[v].el === 'O' && b.o === 2) || (dib.at[u].el === 'N' && dib.at[v].el === 'H')) extra.push(v);
            }));
            const todos = [...new Set([...base, ...extra])].map(pos);
            const x0 = Math.min(...todos.map(q => q.x)) - 20, x1 = Math.max(...todos.map(q => q.x)) + 20;
            const y0 = Math.min(...todos.map(q => q.y)) - 16, y1 = Math.max(...todos.map(q => q.y)) + 16;
            capas.cajas.push(`<rect class="est-caja" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="8" stroke="${color}"/>`);
            // etiqueta pegada encima de su caja
            const texto = p.practica ? '?' : titulo, w = ancho(texto) * 0.68 + 14, cx = (x0 + x1) / 2, ty = y0 - 15;
            etiquetas.push({ tipo: 'enlace', k, inst });
            capas.tags.push(`<g class="est-tag" data-t="${etiquetas.length - 1}"><rect x="${cx - w / 2}" y="${ty - 11}" width="${w}" height="22" rx="11" fill="#fff" stroke="${color}" stroke-width="1.6"/>` +
              `<text x="${cx}" y="${ty + 0.5}" fill="${color}">${texto}</text></g>`);
          } else {
            const q = nodos.map(pos), cx = q.reduce((t, v) => t + v.x, 0) / q.length, cy = q.reduce((t, v) => t + v.y, 0) / q.length;
            tag(cx, cy, titulo, color, { tipo: 'enlace', k, inst });
          }
        });
      });
      // grupos funcionales resaltados con los botones de «Resaltar»
      p.gruposActivos.forEach(({ k, inst, color, nombre }) => {
        const nodos = [...new Set(inst.atomos.filter(i => nodoDe.has(i)).map(i => nodoDe.get(i)))];
        if (!nodos.length) return;
        const q = nodos.map(pos), x = q.reduce((t, v) => t + v.x, 0) / q.length, y = Math.min(...q.map(v => v.y));
        tag(x, y, nombre, color, { tipo: 'grupo', k, inst }, 'cerca');
      });
    }
    // carriles de etiquetas: debajo (enlaces) y encima (grupos) del dibujo, con una línea guía
    const xs = dib.at.map(a => a.x * ESC), ys = dib.at.map(a => a.y * ESC).concat(dib.textos.map(t => t.y * ESC));
    const yMin = Math.min(...ys) - 34, yMax = Math.max(...ys) + 40;
    // las etiquetas de grupo van al carril (arriba o abajo) más cercano
    pendientes.forEach(t => { if (t.lugar === 'cerca') t.lugar = (t.y - yMin) < (yMax - t.y) ? 'arriba' : 'abajo'; });
    ['abajo', 'arriba'].forEach(lugar => {
      const filas = [];
      pendientes.filter(t => t.lugar === lugar).sort((a, b) => a.x - b.x).forEach(t => {
        const texto = p.practica ? '?' : t.texto, w = ancho(texto) * 0.68 + 14;
        let fila = filas.findIndex(f => f < t.x - w / 2 - 6);
        if (fila < 0) { filas.push(0); fila = filas.length - 1; }
        filas[fila] = t.x + w / 2;
        const ty = lugar === 'abajo' ? yMax + fila * 30 : yMin - fila * 30;
        etiquetas.push(t.info);
        capas.tags.push(`<g class="est-tag" data-t="${etiquetas.length - 1}">` +
          `<line x1="${t.x}" y1="${t.y}" x2="${t.x}" y2="${ty + (lugar === 'abajo' ? -11 : 11)}" stroke="${t.color}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".8"/>` +
          `<rect x="${t.x - w / 2}" y="${ty - 11}" width="${w}" height="22" rx="11" fill="#fff" stroke="${t.color}" stroke-width="1.6"/>` +
          `<text x="${t.x}" y="${ty + 0.5}" fill="${t.color}">${texto}</text></g>`);
      });
    });
    dib.textos.forEach(t => capas.txt.push(`<text class="est-nota" x="${t.x * ESC}" y="${t.y * ESC}">${t.t}</text>`));
    const svgTxt = `<svg xmlns="http://www.w3.org/2000/svg" class="est-svg"><g class="est-contenido">${capas.fondo.join('')}${capas.cajas.join('')}${capas.tags.join('')}${capas.enl.join('')}${capas.hb.join('')}${capas.at.join('')}${capas.txt.join('')}</g></svg>`;
    const lienzo = cont.querySelector('.est-lienzo');
    lienzo.innerHTML = svgTxt;
    svg = lienzo.querySelector('svg');
    if (clave !== p.clave || !vista) { clave = p.clave; requestAnimationFrame(ajustar); } else aplicar();
    return etiquetas;
  }

  return { emparejar, montar, dibujar, barra: () => cont && cont.querySelector('.est-barra'), ajustar };
})();
