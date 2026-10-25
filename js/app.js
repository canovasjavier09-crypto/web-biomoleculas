/* =====================================================================
   app.js — Interfaz y visor 3D (3Dmol.js)
   Partes:  1. Carga de estructuras   2. Estado y menú   3. Pintado 3D
            4. Resaltados y etiquetas 5. Descomponer     6. Paneles
            7. Test                   8. Arranque
   ===================================================================== */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const PALETA = ['#4c6ef5', '#f76707', '#37b24d', '#e64980', '#15aabf', '#fab005', '#7950f2', '#82c91e', '#fa5252', '#1098ad', '#be4bdb', '#fd7e14', '#20c997', '#5c7cfa'];
  const NOMBRE_ELEMENTO = { C: 'Carbono', O: 'Oxígeno', N: 'Nitrógeno', H: 'Hidrógeno', P: 'Fósforo', S: 'Azufre', Fe: 'Hierro', Mg: 'Magnesio', Mn: 'Manganeso', Zn: 'Cinc' };
  const coma = (x, d = 1) => x.toFixed(d).replace('.', ',');

  /* ================= 1. CARGA DE ESTRUCTURAS =================
     Cada estructura es un archivo estructuras/<clave>.js que llama a
     registrarEstructura(). Se cargan con <script> para que funcione
     también abriendo index.html directamente (file://).            */
  window.ESTRUCTURAS = window.ESTRUCTURAS || {};
  const esperando = {};
  window.registrarEstructura = (clave, datos) => {
    window.ESTRUCTURAS[clave] = datos;
    (esperando[clave] || []).forEach(f => f(datos));
    delete esperando[clave];
  };
  const esIdPDB = k => /^[0-9][A-Za-z0-9]{3}$/.test(k);

  function descargarRCSB(id) {
    return fetch(`https://files.rcsb.org/download/${id.toUpperCase()}.pdb`)
      .then(r => { if (!r.ok) throw new Error(`RCSB respondió con el código ${r.status}`); return r.text(); })
      .then(t => ({ formato: 'pdb', datos: t.split('\n').filter(l => !(/^(HETATM|ATOM)/.test(l) && l.substr(17, 3) === 'HOH') && !l.startsWith('ANISOU')).join('\n'), remoto: true }));
  }

  function cargarEstructura(clave, soloRemoto) {
    if (window.ESTRUCTURAS[clave]) return Promise.resolve(window.ESTRUCTURAS[clave]);
    if (soloRemoto) return descargarRCSB(clave).then(d => (window.ESTRUCTURAS[clave] = d));
    return new Promise((ok, mal) => {
      (esperando[clave] = esperando[clave] || []).push(ok);
      const s = document.createElement('script');
      s.src = `estructuras/${clave}.js`;
      s.onerror = () => {
        delete esperando[clave];
        // si no está la copia local de un PDB, se intenta descargar de RCSB
        if (esIdPDB(clave)) descargarRCSB(clave).then(d => { window.ESTRUCTURAS[clave] = d; ok(d); }, e => mal(new Error(`No se encontró la copia local y falló la descarga desde RCSB (${e.message}).`)));
        else mal(new Error(`No se encontró el archivo estructuras/${clave}.js`));
      };
      document.head.appendChild(s);
    });
  }

  /* ================= 2. ESTADO Y MENÚ ================= */
  const estado = {
    mol: null, variante: 0, vista: 0,
    modelo: null, atomos: [], an: null, visibles: null,
    rep: 'bolas', color: 'elemento',
    resaltes: new Set(), etqAtomos: false, etqRes: false,
    descompuesto: false, marcar: null, resSel: null,
    // ajustes de vista elegidos por el usuario: se conservan al cambiar de molécula
    pref: { rep: null, rep3d: null, color: null, etqAtomos: false, etqRes: false, modo2d: null },
  };
  let visor = null;

  // molécula "efectiva": la ficha con los campos de la variante sobrescritos
  const molEfectiva = () => {
    const m = estado.mol, v = m.variantes ? m.variantes[estado.variante] : null;
    return v ? { ...m, ...v, nombreVariante: v.nombre } : m;
  };

  function construirMenu() {
    const nav = $('#menu');
    nav.innerHTML = '';
    BLOQUES.forEach((b, k) => {
      const div = document.createElement('div');
      div.className = 'bloque-menu' + (k === 0 ? ' abierto' : '');
      div.dataset.bloque = b.id;
      const items = MOLECULAS.filter(m => m.bloque === b.id);
      div.innerHTML = `<button aria-expanded="${k === 0}"><span>${b.icono}</span>${k + 1}. ${b.nombre}<span class="flecha">›</span></button>
        <ul>${items.map(m => `<li><button data-mol="${m.id}">${m.nombre}</button></li>`).join('')}</ul>`;
      div.firstElementChild.onclick = () => { div.classList.toggle('abierto'); div.firstElementChild.setAttribute('aria-expanded', div.classList.contains('abierto')); };
      nav.appendChild(div);
    });
    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-mol]');
      if (!b) return;
      seleccionar(b.dataset.mol, 0);
      cerrarMenuMovil();
    });
  }
  const cerrarMenuMovil = () => { $('#menu').classList.remove('abierto'); $('#velo').classList.remove('visible'); };

  async function seleccionar(id, variante = 0, opciones = {}) {
    const mol = MOLECULAS.find(m => m.id === id) || (estado.mol && estado.mol.id === id ? estado.mol : null);
    if (!mol) return;
    const cambiaMol = !estado.mol || estado.mol.id !== id;
    if (estado.cicl) { clearInterval(estado.cicl.anim); estado.cicl = null; }
    estado.mol = mol; estado.variante = variante; estado.vista = 0;
    estado.descompuesto = false; estado.marcar = opciones.marcar || null; estado.resSel = null;
    const me = molEfectiva();
    aplicarPreferencias(me);
    estado.guia = !!me.guia;
    // menú
    $$('#menu [data-mol]').forEach(b => b.classList.toggle('activa', b.dataset.mol === id));
    const bloque = $(`#menu [data-bloque="${mol.bloque}"]`);
    if (bloque) bloque.classList.add('abierto');
    try { history.replaceState(null, '', `#${id}${variante ? '/' + variante : ''}`); } catch (e) { /* file:// en algunos navegadores */ }
    $('#tituloMol').textContent = mol.nombre;
    pintarVariantes();
    pintarInfo();
    if (cambiaMol && !opciones.desdeTest) reiniciarTest();
    if (!opciones.desdeTest) mostrarTab('info');
    $('#tab-detalle').innerHTML = '<p class="vacio">Pulsa sobre un átomo, un grupo o un enlace resaltado del visor para ver aquí su ficha.</p>';
    if (mol.esquema) return mostrarEsquema();
    ocultarEsquema();
    await construirModelo(me);
  }

  /* Representación, color y etiquetas: los que eligió el usuario si valen para esta
     molécula; si no (p. ej. «Cinta» en una molécula pequeña), los de la ficha. */
  const repPorDefecto = me => me.vista || (me.macro ? 'cartoon' : 'bolas');
  function aplicarPreferencias(me) {
    const p = estado.pref;
    let rep = p.rep || repPorDefecto(me);
    if (rep === 'cartoon' && !me.macro) rep = p.rep3d || repPorDefecto(me);
    if (rep === '2d' && me.macro) rep = repPorDefecto(me);
    estado.rep = rep;
    let col = p.color || me.colorInicial || 'elemento';
    if ((col === 'cadena' || col === 'ss') && !me.macro) col = 'elemento';
    estado.color = col;
    estado.etqAtomos = p.etqAtomos; estado.etqRes = p.etqRes;
  }

  function pintarVariantes() {
    const m = estado.mol, cont = $('#variantes');
    cont.innerHTML = '';
    (m.variantes || []).forEach((v, i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (i === estado.variante ? ' activo' : '');
      b.textContent = v.nombre;
      b.onclick = () => seleccionar(m.id, i);
      cont.appendChild(b);
    });
  }

  /* ================= 3. PINTADO 3D ================= */
  function crearVisor() {
    visor = $3Dmol.createViewer($('#visor'), { backgroundColor: colorFondo(), antialias: true });
    window.addEventListener('resize', () => { visor.resize(); visor.render(); });
  }
  const colorFondo = () => getComputedStyle(document.documentElement).getPropertyValue('--visor').trim() || '#ffffff';
  const oscuro = () => document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

  function aviso(texto, tipo) {
    const a = $('#aviso');
    if (!texto) { a.hidden = true; return; }
    a.hidden = false; a.className = 'aviso' + (tipo ? ' ' + tipo : ''); a.innerHTML = texto;
  }

  async function construirModelo(me) {
    aviso(null);
    $('#cargando').hidden = false;
    visor.removeAllModels(); visor.removeAllShapes(); visor.removeAllLabels();
    // mientras carga, no se muestra nada de la molécula anterior
    estado.modelo = null; estado.an = null; estado.atomos = []; estado.datos = null;
    $('#barraCicl').hidden = true;
    pintarBarra(); pintarResaltar(); pintarLeyenda(); pintarInfo(); $('#secuencia').hidden = true; $('#selVista').hidden = true;
    let datos;
    try {
      datos = await cargarEstructura(me.estructura, me.soloRemoto);
    } catch (e) {
      $('#cargando').hidden = true;
      aviso(`<b>No se ha podido cargar la estructura.</b> ${e.message}<br>Si estás sin conexión, las estructuras incluidas en la web siguen funcionando; las de RCSB necesitan internet.`);
      visor.render();
      estado.atomos = []; estado.an = null; pintarResaltar(); pintarLeyenda();
      return;
    }
    if (me !== molEfectiva() && me.estructura !== molEfectiva().estructura) return; // el usuario cambió de molécula mientras cargaba
    const opts = datos.formato === 'sdf' ? { multimodel: true, onemol: true, keepH: true } : { keepH: true };
    estado.modelo = visor.addModel(datos.datos, datos.formato, opts);
    estado.datos = datos;
    if (estado.rep === '2d' && !hay2D(me)) estado.rep = repPorDefecto(me);
    estado.atomos = estado.modelo.selectedAtoms({});
    estado.atomos.forEach((a, i) => { a._i = i; });
    estado.an = Analisis.analizar(estado.atomos, me);
    if (datos.remoto && me.macro) aviso('Estructura descargada en este momento desde RCSB PDB.', 'info');
    // resaltados automáticos de la ficha
    estado.resaltes = new Set();
    (me.autoResaltar || []).forEach(k => tieneResalte(k) && estado.resaltes.add(k));
    (me.autoResaltarGrupos || []).forEach(k => estado.resaltes.add('g:' + k));
    if (estado.marcar) estado.resaltes.delete(estado.marcar);
    prepararVistas(me);
    calcularVisibles();
    visor.setClickable({}, true, alPulsarAtomo);
    pintarBarra();
    pintarResaltar();
    pintarSecuencia();
    if (me.ciclacion && datos.ciclacion) prepararCiclacion(datos.ciclacion);
    pintar();
    if (me.rotacion) visor.rotate(me.rotacion[0], me.rotacion[1]); else orientarVista();
    visor.zoomTo(selVisible());
    ajustarZoom();
    visor.render();
    $('#cargando').hidden = true;
    pintarInfo();
  }

  /* Gira la cámara para que el eje más largo de la estructura quede horizontal
     (así la doble hélice o una cadena larga se ven de lado). */
  function orientarVista() {
    const pts = estado.atomos.filter(a => visible(a._i) && a.elem !== 'H');
    if (pts.length < 10) return;
    const c = [0, 0, 0];
    pts.forEach(a => { c[0] += a.x; c[1] += a.y; c[2] += a.z; });
    c.forEach((v, k) => c[k] = v / pts.length);
    // matriz de covarianza y sus dos vectores propios principales (método de la potencia)
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    pts.forEach(a => { const d = [a.x - c[0], a.y - c[1], a.z - c[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += d[i] * d[j]; });
    const potencia = (A, v) => {
      for (let k = 0; k < 80; k++) { const w = A.map(f => f[0] * v[0] + f[1] * v[1] + f[2] * v[2]); const n = Math.hypot(...w) || 1; v = w.map(x => x / n); }
      const Av = A.map(f => f[0] * v[0] + f[1] * v[1] + f[2] * v[2]);
      return { v, l: v[0] * Av[0] + v[1] * Av[1] + v[2] * Av[2] };
    };
    const e1 = potencia(M, [1, 0.3, 0.2]);
    const M2 = M.map((f, i) => f.map((x, j) => x - e1.l * e1.v[i] * e1.v[j]));
    const e2 = potencia(M2, [0.2, 1, 0.3]);
    let v1 = e1.v; if (v1[0] < 0) v1 = v1.map(x => -x);
    // rotación de Rodrigues que lleva v1 al eje x
    const ang1 = Math.acos(Math.min(1, v1[0]));
    let eje = [0, v1[2], -v1[1]]; const n = Math.hypot(...eje);
    const rot = (v, k, t) => {
      const [kx, ky, kz] = k, c_ = Math.cos(t), s_ = Math.sin(t), d = kx * v[0] + ky * v[1] + kz * v[2];
      const cr = [ky * v[2] - kz * v[1], kz * v[0] - kx * v[2], kx * v[1] - ky * v[0]];
      return v.map((x, i) => x * c_ + cr[i] * s_ + k[i] * d * (1 - c_));
    };
    // Se prueban los dos sentidos de giro y se elige el que muestra la molécula más «abierta»
    // en pantalla (mayor área proyectada, con el lado largo en horizontal).
    const muestra = pts.filter((_, k) => k % Math.ceil(pts.length / 250) === 0);
    const area = () => {
      visor.render();
      const P = muestra.map(a => visor.modelToScreen({ x: a.x, y: a.y, z: a.z }));
      const xs = P.map(p => p.x), ys = P.map(p => p.y);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      return w * h * (w >= h ? 1 : 0.5);
    };
    const caja = $('#visor').getBoundingClientRect(), apaisado = caja.width >= caja.height;
    const inicial = visor.getView();
    let mejor = { a: -1 };
    for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      visor.setView(inicial);
      let v2 = e2.v;
      if (n > 1e-6) {
        const k = eje.map(x => x / n);
        visor.rotate(s1 * ang1 * 180 / Math.PI, { x: k[0], y: k[1], z: k[2] });
        v2 = rot(v2, k, -s1 * ang1);
      }
      visor.rotate(s2 * Math.atan2(v2[2], v2[1]) * 180 / Math.PI, { x: 1, y: 0, z: 0 });
      const a = area();
      if (a > mejor.a) mejor = { a, vista: visor.getView() };
    }
    visor.setView(mejor.vista);
    if (!apaisado) {
      // pantalla vertical: se gira en el plano de la pantalla hasta que el eje largo quede vertical
      let mejorZ = { r: -1 };
      const base = visor.getView();
      for (const g of [0, 30, 60, 90, 120, 150]) {
        visor.setView(base); if (g) visor.rotate(g, { x: 0, y: 0, z: 1 });
        visor.render();
        const P = muestra.map(a => visor.modelToScreen({ x: a.x, y: a.y, z: a.z }));
        const w = Math.max(...P.map(p => p.x)) - Math.min(...P.map(p => p.x)), h = Math.max(...P.map(p => p.y)) - Math.min(...P.map(p => p.y));
        if (h / w > mejorZ.r) mejorZ = { r: h / w, vista: visor.getView() };
      }
      visor.setView(mejorZ.vista);
    }
  }

  /* Tras centrar, si algún átomo queda fuera del visor, se aleja la cámara */
  function ajustarZoom() {
    const pts = estado.atomos.filter(a => visible(a._i));
    if (!pts.length) return;
    const caja = $('#visor').getBoundingClientRect();
    const muestra = pts.filter((_, k) => k % Math.ceil(pts.length / 300) === 0);
    for (let i = 0; i < 6; i++) {
      visor.render();
      const P = muestra.map(a => visor.modelToScreen({ x: a.x, y: a.y, z: a.z }));
      const xs = P.map(p => p.x), ys = P.map(p => p.y);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      const f = Math.min((caja.width * 0.9) / w, (caja.height * 0.85) / h);
      if (!isFinite(f) || f >= 1) break;
      visor.zoom(Math.max(0.5, f * 0.98));
    }
  }

  function prepararVistas(me) {
    const sel = $('#selVista');
    sel.innerHTML = '';
    (me.vistas || []).forEach((v, i) => sel.add(new Option(v.nombre, i)));
    sel.hidden = !(me.vistas && me.vistas.length);
    sel.value = estado.vista;
  }
  const selVisible = () => { const v = molEfectiva().vistas; return v ? v[estado.vista].sel : {}; };
  function calcularVisibles() {
    const sel = selVisible();
    estado.visibles = new Set(Object.keys(sel).length ? estado.modelo.selectedAtoms(sel).map(a => a._i) : estado.atomos.map(a => a._i));
  }
  const visible = i => estado.visibles.has(i);

  // índice átomo → color del resaltado de grupo activo
  function mapaResaltado() {
    const mapa = new Map(), an = estado.an, me = molEfectiva();
    if (!an) return mapa;
    for (const k of estado.resaltes) {
      if (k.startsWith('g:')) {
        const g = (me.grupos || []).find(x => x.id === k.slice(2));
        if (g) atomosGrupo(g).forEach(i => mapa.set(i, { color: g.color, soloC: true, clave: k }));
      } else if (CATALOGO[k] && CATALOGO[k].tipo === 'grupo') {
        (an.grupos[k] || []).forEach(inst => inst.atomos.forEach(i => mapa.set(i, { color: CATALOGO[k].color, clave: k })));
      }
    }
    // en moléculas pequeñas, los átomos de los enlaces resaltados toman el color del enlace (si no tienen ya un grupo)
    if (!me.macro) {
      Object.keys(an.enlaces).forEach(k => {
        const marcado = estado.marcar === k, activo = estado.resaltes.has(k);
        if (!marcado && !activo) return;
        an.enlaces[k].forEach(inst => inst.pares.flat().forEach(i => {
          if (!mapa.has(i) && estado.atomos[i].elem !== 'H') mapa.set(i, { color: marcado && !activo ? '#ff00ff' : CATALOGO[k].color, clave: k, enlace: inst });
        }));
      });
    }
    if (estado.marcar && estado.marcar.startsWith('g:')) {
      const g = (me.grupos || []).find(x => x.id === estado.marcar.slice(2));
      if (g) atomosGrupo(g).forEach(i => mapa.set(i, { color: '#ff00ff', soloC: true, clave: estado.marcar }));
    } else if (estado.marcar && CATALOGO[estado.marcar] && CATALOGO[estado.marcar].tipo === 'grupo') {
      (an.grupos[estado.marcar] || []).forEach(inst => inst.atomos.forEach(i => mapa.set(i, { color: '#ff00ff', clave: estado.marcar })));
    }
    return mapa;
  }

  // átomos de un grupo especial definido por selección en moleculas.js
  function atomosGrupo(g) {
    if (g._cache && g._cache.modelo === estado.modelo) return g._cache.lista;
    let lista = [];
    if (g.cerca) {
      const lig = new Set(estado.modelo.selectedAtoms(g.cerca).map(a => a._i));
      lista = estado.modelo.selectedAtoms({ within: { distance: 4, sel: g.cerca }, byres: true }).map(a => a._i).filter(i => !lig.has(i));
    } else {
      const sels = Array.isArray(g.sel) ? g.sel : [g.sel];
      sels.forEach(s => lista.push(...estado.modelo.selectedAtoms(s).map(a => a._i)));
    }
    g._cache = { modelo: estado.modelo, lista };
    return lista;
  }

  function funcionColor(mapa) {
    const an = estado.an;
    return atom => {
      const r = mapa.get(atom._i);
      if (r && (!r.soloC || atom.elem === 'C')) return r.color;
      // en la vista de cinta los ligandos (hemo, NAG…) se colorean siempre por elemento para que destaquen
      if (atom.hetflag && estado.rep === 'cartoon' && !esNucleotidoModificado(atom)) return COLORES_ELEMENTO[atom.elem] || '#ff1493';
      if (estado.resSel && atom.chain === estado.resSel.chain && atom.resi === estado.resSel.resi && atom.elem === 'C') return '#ff00ff';
      switch (estado.color) {
        case 'monomero': return PALETA[an.monomero[atom._i] % PALETA.length];
        case 'cadena': return PALETA[(atom.chain || 'A').charCodeAt(0) % PALETA.length];
        case 'ss': return atom.ss === 'h' ? '#e64980' : atom.ss === 's' ? '#fab005' : (oscuro() ? '#ced4da' : '#adb5bd');
        default: return COLORES_ELEMENTO[atom.elem] || '#ff1493';
      }
    };
  }

  function estiloRep(rep, cf, macro) {
    switch (rep) {
      case 'varillas': return { stick: { radius: macro ? 0.18 : 0.16, colorfunc: cf } };
      case 'esferas': return { sphere: { scale: 1.0, colorfunc: cf } };
      case 'cartoon': return { cartoon: { colorfunc: cf, arrows: true, thickness: 0.6 } };
      default: return { stick: { radius: 0.13, colorfunc: cf }, sphere: { scale: 0.24, colorfunc: cf } };
    }
  }

  function pintar(rapido) {
    if (!estado.modelo) return;
    const me = molEfectiva(), an = estado.an;
    const mapa = mapaResaltado(), cf = funcionColor(mapa);
    $('#vista2d').hidden = estado.rep !== '2d';
    if (estado.rep === '2d') {
      pintar2D(mapa); pintarLeyenda(mapa);
      $('#leyenda').hidden = ['fischer', 'haworth', 'ciclacion'].includes(estado.modo2d);
      return;
    }
    $('#leyenda').hidden = false;
    const vis = { predicate: a => visible(a._i) };
    visor.setStyle({}, {});
    visor.setStyle(vis, estiloRep(estado.rep, cf, me.macro));
    if (me.macro && estado.rep === 'cartoon') {
      // ligandos e iones siempre visibles en la vista de cinta
      visor.addStyle({ predicate: a => visible(a._i) && a.hetflag && a.elem !== 'H' && !['MG', 'MN', 'ZN'].includes(a.resn) && !esNucleotidoModificado(a) }, { stick: { radius: 0.28, colorfunc: cf } });
      visor.addStyle({ predicate: a => visible(a._i) && a.elem === 'Fe' }, { sphere: { scale: 0.6, colorfunc: cf } });
      visor.addStyle({ predicate: a => visible(a._i) && ['MG', 'MN', 'ZN'].includes(a.resn) }, { sphere: { scale: 0.5, colorfunc: cf } });
      // grupos especiales resaltados: se muestran como varillas sobre la cinta
      visor.addStyle({ predicate: a => visible(a._i) && mapa.has(a._i) && !['h', 's'].includes(mapaClaveSS(mapa.get(a._i))) }, { stick: { radius: 0.22, colorfunc: cf } });
      if (estado.resaltes.has('disulfuro') || estado.marcar === 'disulfuro') {
        const cys = new Set();
        (an.enlaces.disulfuro || []).forEach(e => e.pares[0].forEach(i => { const a = estado.atomos[i]; cys.add(a.chain + a.resi); }));
        visor.addStyle({ predicate: a => visible(a._i) && a.resn === 'CYS' && cys.has(a.chain + a.resi) && a.atom !== 'N' && a.atom !== 'C' && a.atom !== 'O' }, { stick: { radius: 0.22, colorfunc: cf } });
      }
      if (estado.resSel) visor.addStyle({ chain: estado.resSel.chain, resi: estado.resSel.resi }, { stick: { radius: 0.24, colorfunc: cf } });
    } else if (estado.rep === 'bolas' && mapa.size && mapa.size < 3000) {
      // en bolas y varillas, los átomos resaltados se agrandan un poco
      visor.addStyle({ predicate: a => visible(a._i) && mapa.has(a._i) }, { sphere: { scale: 0.32, colorfunc: cf } });
    }
    if (rapido) { visor.render(); return; }
    visor.removeAllShapes();
    visor.removeAllLabels();
    if (!estado.descompuesto) { dibujarEnlaces(); dibujarPuentesH(); if (estado.guia && me.guia) dibujarGuia(); }
    if (me.ciclacion && estado.cicl) lineaAtaque();
    dibujarEtiquetas();
    pintarLeyenda(mapa);
    visor.render();
  }
  const mapaClaveSS = r => { const g = (molEfectiva().grupos || []).find(x => 'g:' + x.id === r.clave); return g && g.sel && g.sel.ss; };
  const MODIFICADOS = ['2MG', 'H2U', 'M2G', 'OMC', 'OMG', 'YYG', 'PSU', '5MC', '7MG', '5MU', '1MA'];
  const esNucleotidoModificado = a => a.hetflag && MODIFICADOS.includes(a.resn);

  /* ================= VISTA 2D ================= */
  const hay2D = me => !me.macro && !!(me.proyeccion || me.plano2d || (estado.datos && estado.datos.d2));
  let montado2D = false;

  // proyección de las coordenadas 3D sobre su plano principal (pares de bases, agua)
  function proyeccionPlano() {
    const A = estado.atomos, c = centroide(A.map(a => a._i));
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    A.forEach(a => { const d = [a.x - c.x, a.y - c.y, a.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += d[i] * d[j]; });
    const pot = (B, v) => { for (let k = 0; k < 80; k++) { const w = B.map(f => f[0] * v[0] + f[1] * v[1] + f[2] * v[2]); const n = Math.hypot(...w) || 1; v = w.map(x => x / n); } const Bv = B.map(f => f[0] * v[0] + f[1] * v[1] + f[2] * v[2]); return { v, l: v[0] * Bv[0] + v[1] * Bv[1] + v[2] * Bv[2] }; };
    const e1 = pot(M, [1, 0.2, 0.1]);
    const e2 = pot(M.map((f, i) => f.map((x, j) => x - e1.l * e1.v[i] * e1.v[j])), [0.1, 1, 0.3]);
    return A.map(a => { const d = [a.x - c.x, a.y - c.y, a.z - c.z]; return [d[0] * e1.v[0] + d[1] * e1.v[1] + d[2] * e1.v[2], -(d[0] * e2.v[0] + d[1] * e2.v[1] + d[2] * e2.v[2])]; });
  }

  function pintar2D(mapa) {
    const me = molEfectiva(), an = estado.an, d2 = estado.datos && estado.datos.d2;
    if (!montado2D) { Vista2D.montar($('#cont2d')); montado2D = true; }
    const modos = [];
    if (me.ciclacion) modos.push(['ciclacion', 'Ciclación paso a paso']);
    if ((d2 || me.plano2d) && !me.ciclacion) modos.push(['desarrollada', 'Fórmula desarrollada'], ['semi', 'Sin hidrógenos']);
    if (me.proyeccion) { modos.push(['fischer', 'Proyección de Fischer']); if (me.proyeccion.anillo && me.proyeccion.anomero) modos.push(['haworth', 'Proyección de Haworth']); }
    if (!modos.length) return;
    if (modos.some(m => m[0] === estado.pref.modo2d)) estado.modo2d = estado.pref.modo2d;
    if (!modos.some(m => m[0] === estado.modo2d)) estado.modo2d = modos[0][0];
    const cm = $('#modos2d');
    cm.innerHTML = modos.map(([k, n]) => `<button class="chip${k === estado.modo2d ? ' activo' : ''}" data-m2="${k}">${n}</button>`).join('');
    cm.querySelectorAll('[data-m2]').forEach(b => b.onclick = () => { estado.modo2d = estado.pref.modo2d = b.dataset.m2; pintar(); });
    const nombre = me.nombreVariante || estado.mol.nombre;
    if (['fischer', 'haworth', 'ciclacion'].includes(estado.modo2d)) return Vista2D.proyeccion(me.proyeccion, estado.modo2d, nombre);
    const conH = estado.modo2d === 'desarrollada';
    let xy, cunas = [];
    if (me.plano2d) {
      xy = proyeccionPlano();
      if (!conH) xy = xy.map((p, i) => estado.atomos[i].elem === 'H' ? null : p);
    } else {
      xy = conH ? d2.conH : d2.sinH;
      cunas = conH ? d2.cunasH : d2.cunasSinH;
    }
    const lista = [];
    Object.keys(an.enlaces).forEach(k => {
      const activo = estado.resaltes.has(k), marcado = estado.marcar === k;
      if (!activo && !marcado) return;
      an.enlaces[k].forEach(inst => lista.push({ clave: k, inst, pares: inst.pares, color: marcado && !activo ? '#ff00ff' : CATALOGO[k].color, neutro: marcado && !activo }));
    });
    const hb = (me.plano2d && (estado.resaltes.has('puente_h') || estado.marcar === 'puente_h'))
      ? an.hbonds.map((h, k) => ({ ...h, k, color: estado.resaltes.has('puente_h') ? CATALOGO.puente_h.color : '#ff00ff' })) : [];
    Vista2D.formula({
      atomos: estado.atomos, xy, cunas, conH, mapa, enlacesRes: lista, hbonds: hb, numeros: estado.etqAtomos,
      pie: conH ? 'Fórmula <b>desarrollada</b>: cada átomo con su símbolo y cada enlace con una raya (doble enlace = dos rayas). ' + (cunas.length ? 'Cuña negra: enlace hacia el observador; cuña rayada: hacia atrás.' : '')
        : 'Sin hidrógenos: cada H se escribe junto al átomo al que está unido (–OH, –CH₂–, –NH₂). ' + (estado.etqAtomos ? '' : 'Activa «Etiquetas de átomos» para numerar los carbonos.'),
      alPulsar: r => {
        if (r.atomo !== undefined) return alPulsarAtomo(estado.atomos[r.atomo]);
        if (r.enlace.startsWith('hb')) return detallePuenteH(an.hbonds[+r.enlace.slice(2)]);
        const x = lista[+r.enlace]; if (!x) return;
        x.neutro ? detalleOculto() : detalleEnlace(x.clave, x.inst);
      },
    });
  }

  /* ================= CICLACIÓN (animación) ================= */
  function prepararCiclacion(c) {
    estado.cicl = { c, k: 0, n: c.fotogramas.length - 1, cerrada: false, anim: null };
    const r = $('#rangoCicl'); r.max = estado.cicl.n; r.value = 0;
    $('#barraCicl').hidden = false;
    textoCiclacion();
  }
  function aplicarEnlaces(lista) {
    const A = estado.atomos;
    A.forEach(a => { a.bonds = []; a.bondOrder = []; });
    lista.forEach(([i, j, o]) => { A[i].bonds.push(j); A[i].bondOrder.push(o); A[j].bonds.push(i); A[j].bondOrder.push(o); });
  }
  function reanalizar() {
    estado.atomos.forEach(a => { delete a._num; delete a._numero; delete a._calfa; });
    estado.an = Analisis.analizar(estado.atomos, molEfectiva());
    pintarResaltar(); pintarInfo();
  }
  function irFotograma(k, final) {
    const cc = estado.cicl; if (!cc) return;
    const F = cc.c.fotogramas[k];
    estado.atomos.forEach((a, i) => { a.x = F[3 * i]; a.y = F[3 * i + 1]; a.z = F[3 * i + 2]; });
    const cerrada = k === cc.n;
    if (cerrada !== cc.cerrada) { aplicarEnlaces(cerrada ? cc.c.enlacesCerrada : cc.c.enlacesAbierta); cc.cerrada = cerrada; reanalizar(); }
    cc.k = k; $('#rangoCicl').value = k; textoCiclacion();
    if (estado.rep === '2d') return;
    if (final) { pintar(); return; }
    pintar(true); visor.removeAllShapes(); visor.removeAllLabels(); lineaAtaque(); visor.render();
  }
  function lineaAtaque() {
    const cc = estado.cicl; if (!cc || cc.k < cc.c.plegado || cc.k >= cc.n) return;
    discontinua(estado.atomos[cc.c.anomerico], estado.atomos[cc.c.oAnillo], 0.09, '#ff00ff', () => {});
  }
  function textoCiclacion() {
    const cc = estado.cicl, me = molEfectiva(), pasos = me.pasos || {};
    if (!cc) return;
    const ano = me.proyeccion && me.proyeccion.anomero;
    let t = cc.k === 0 ? pasos.abierta : cc.k < cc.c.plegado ? pasos.plegando : cc.k < cc.n ? pasos.ataque : pasos.cerrada;
    if (cc.k === cc.n && ano) t += ` El –OH anomérico ha quedado en posición <b>${ano}</b> (en Haworth, ${ano === 'β' ? 'arriba: del mismo lado que el CH₂OH del C6' : 'abajo: en el lado opuesto al CH₂OH del C6'}).`;
    $('#pasoCicl').innerHTML = t || '';
    $('#btnCiclar').textContent = (cc.k === cc.n ? '↺ Repetir' : '▶ Ciclar') + (estado.rep === '2d' ? ' (en 3D)' : '');
  }
  // la animación es en 3D: si se está viendo en 2D, se cambia a la última vista 3D elegida
  function verEn3D() {
    if (estado.rep !== '2d') return;
    estado.rep = estado.pref.rep3d || 'bolas';
    pintarBarra(); pintar();
  }
  function animarCiclacion(hasta) {
    const cc = estado.cicl; if (!cc) return;
    clearInterval(cc.anim);
    if (hasta === cc.n && cc.k === cc.n) irFotograma(0, false);
    const paso = hasta > cc.k ? 1 : -1;
    cc.anim = setInterval(() => {
      const k = cc.k + paso;
      if ((paso > 0 && k > hasta) || (paso < 0 && k < hasta)) { clearInterval(cc.anim); irFotograma(cc.k, true); return; }
      irFotograma(k, k === hasta);
      if (k === hasta) clearInterval(cc.anim);
    }, 90);
  }

  /* ================= 4. RESALTADOS, ENLACES Y ETIQUETAS ================= */
  function tieneResalte(k) {
    const an = estado.an;
    if (!an) return false;
    if (k === 'puente_h') return an.hbonds.length > 0;
    if (CATALOGO[k].tipo === 'grupo') return (an.grupos[k] || []).length > 0;
    return (an.enlaces[k] || []).length > 0;
  }

  const pos = a => ({ x: a.x, y: a.y, z: a.z });
  function cilindro(a, b, radio, color, alPulsar, opacidad = 0.9) {
    visor.addCylinder({ start: pos(a), end: pos(b), radius: radio, color, opacity: opacidad, fromCap: 1, toCap: 1, clickable: !!alPulsar, callback: alPulsar });
  }
  function discontinua(a, b, radio, color, alPulsar) {
    const d = Analisis.dist(a, b), n = Math.max(3, Math.round(d / 0.32));
    for (let k = 0; k < n; k += 2) {
      const t0 = k / n, t1 = Math.min(1, (k + 1) / n);
      visor.addCylinder({
        start: { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0, z: a.z + (b.z - a.z) * t0 },
        end: { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1, z: a.z + (b.z - a.z) * t1 },
        radius: radio, color, fromCap: 1, toCap: 1, clickable: true, callback: alPulsar,
      });
    }
  }

  function dibujarEnlaces() {
    const an = estado.an, A = estado.atomos, me = molEfectiva();
    const tipos = Object.keys(an.enlaces).filter(k => estado.resaltes.has(k) || estado.marcar === k);
    tipos.forEach(k => {
      const neutro = estado.marcar === k && !estado.resaltes.has(k);
      const color = neutro ? '#ff00ff' : CATALOGO[k].color;
      const r = me.macro ? 0.32 : (estado.rep === 'esferas' ? 0.5 : 0.27);
      an.enlaces[k].forEach(inst => {
        if (!inst.pares.every(([i, j]) => visible(i) && visible(j))) return;
        const cb = () => neutro ? detalleOculto() : detalleEnlace(k, inst);
        inst.pares.forEach(([i, j]) => cilindro(A[i], A[j], r, color, cb, neutro ? 0.95 : 0.85));
      });
    });
  }

  function dibujarPuentesH() {
    const an = estado.an, A = estado.atomos;
    if (!(estado.resaltes.has('puente_h') || estado.marcar === 'puente_h')) return;
    const neutro = estado.marcar === 'puente_h' && !estado.resaltes.has('puente_h');
    const color = neutro ? '#ff00ff' : CATALOGO.puente_h.color;
    const r = molEfectiva().macro ? 0.09 : 0.07;
    an.hbonds.forEach(h => {
      if (!visible(h.a) || !visible(h.b)) return;
      discontinua(A[h.a], A[h.b], estado.rep === 'esferas' ? 0.15 : r, color, () => neutro ? detalleOculto() : detallePuenteH(h));
    });
  }

  // «forma de la cadena»: une los centros de los monosacáridos enlazados
  function dibujarGuia() {
    const an = estado.an, cent = new Map();
    const c = m => { if (!cent.has(m)) cent.set(m, centroide(an.monomeros[m].atomos)); return cent.get(m); };
    (an.enlaces.glucosidico || []).forEach(e => {
      const a = an.monomero[e.donador], b = an.monomero[e.aceptor];
      visor.addCylinder({ start: c(a), end: c(b), radius: 0.55, color: '#ff6b00', opacity: 0.75, fromCap: 1, toCap: 1 });
      [a, b].forEach(m => visor.addSphere({ center: c(m), radius: 0.75, color: '#ff6b00', opacity: 0.75 }));
    });
  }

  function etiqueta(texto, p, opciones = {}) {
    const osc = oscuro();
    visor.addLabel(texto, {
      position: p, fontSize: opciones.tam || 12, fontColor: opciones.color || (osc ? '#f1f3f5' : '#1d232b'),
      backgroundColor: opciones.fondo || (osc ? '#1b2129' : '#ffffff'), backgroundOpacity: opciones.opacidad ?? 0.75,
      borderThickness: 0, inFront: true, showBackground: opciones.sinFondo ? false : true, alignment: 'center', bold: !!opciones.negrita,
    });
  }

  function dibujarEtiquetas() {
    const me = molEfectiva(), an = estado.an, A = estado.atomos;
    const visibles = A.filter(a => visible(a._i));
    // etiquetas de átomos
    if (estado.etqAtomos && !estado.descompuesto) {
      let lista = visibles;
      if (me.macro) lista = lista.filter(a => a.elem !== 'H');
      if (lista.length > 60) lista = lista.filter(a => a.elem !== 'H');
      if (lista.length > 450) {
        // sólo se avisa cuando el usuario acaba de pulsar el botón, no al cambiar de molécula
        if (estado.avisoEtq) aviso('Hay demasiados átomos para etiquetarlos todos. Usa las etiquetas de monómeros o una vista más pequeña.', 'info');
      } else {
        lista.forEach(a => {
          let t = a._num || (me.macro ? a.atom : a.elem);
          if (a._calfa) t = 'Cα';
          etiqueta(t, pos(a), { tam: 11, opacidad: 0.6 });
        });
      }
    }
    // etiquetas de monómeros / residuos
    if (estado.etqRes || estado.descompuesto) {
      const lista = an.monomeros.filter(m => m.atomos.some(visible));
      if (lista.length <= 600) lista.forEach((m, k) => {
        const idx = an.monomeros.indexOf(m);
        let p;
        if (me.macro) {
          const ref = m.atomos.map(i => A[i]).find(a => a.atom === 'CA' || a.atom === "C1'") || A[m.atomos[0]];
          p = pos(ref);
        } else p = centroide(m.atomos);
        etiqueta(me.macro ? m.etiqueta : m.etiqueta, p, { tam: me.macro ? 10 : 12, color: '#ffffff', fondo: PALETA[idx % PALETA.length], opacidad: 0.9, negrita: true });
      });
    }
    // cargas parciales del agua
    if (me.cargas && !estado.descompuesto) {
      visibles.forEach(a => {
        if (a.elem === 'O' && estado.an.G.vecEl(a._i, 'H').length === 2) {
          const hs = estado.an.G.vecEl(a._i, 'H').map(i => A[i]);
          const v = [2 * a.x - hs[0].x - hs[1].x, 2 * a.y - hs[0].y - hs[1].y, 2 * a.z - hs[0].z - hs[1].z];
          const n = Math.hypot(...v) || 1;
          etiqueta('δ⁻', { x: a.x + v[0] / n * 0.75, y: a.y + v[1] / n * 0.75, z: a.z + v[2] / n * 0.75 }, { color: '#e03131', sinFondo: true, tam: 17, negrita: true });
          hs.forEach(h => {
            const w = [h.x - a.x, h.y - a.y, h.z - a.z], m = Math.hypot(...w);
            etiqueta('δ⁺', { x: h.x + w[0] / m * 0.5, y: h.y + w[1] / m * 0.5, z: h.z + w[2] / m * 0.5 }, { color: '#1971c2', sinFondo: true, tam: 15, negrita: true });
          });
        }
      });
    }
    // ángulo H-O-H
    if (me.angulo && !estado.descompuesto) {
      const o = visibles.find(a => a.elem === 'O');
      const hs = estado.an.G.vecEl(o._i, 'H').map(i => A[i]);
      if (hs.length === 2) {
        const u = [hs[0].x - o.x, hs[0].y - o.y, hs[0].z - o.z], v = [hs[1].x - o.x, hs[1].y - o.y, hs[1].z - o.z];
        const ang = Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI;
        const m = { x: o.x + (u[0] + v[0]) * 0.35, y: o.y + (u[1] + v[1]) * 0.35, z: o.z + (u[2] + v[2]) * 0.35 };
        etiqueta(`${coma(ang)}°`, m, { tam: 13, negrita: true });
        estado.anguloAgua = ang;
      }
    }
    // extremos 5′ y 3′ de los ácidos nucleicos
    if (me.extremos && !estado.descompuesto) {
      const cadenas = {};
      visibles.forEach(a => { if (a.atom === "C1'") (cadenas[a.chain] = cadenas[a.chain] || []).push(a.resi); });
      Object.entries(cadenas).forEach(([c, rs]) => {
        const r5 = Math.min(...rs), r3 = Math.max(...rs);
        const a5 = visibles.find(a => a.chain === c && a.resi === r5 && (a.atom === 'P' || a.atom === "O5'"));
        const a3 = visibles.find(a => a.chain === c && a.resi === r3 && a.atom === "O3'");
        if (a5) etiqueta(`5′ (cadena ${c})`, pos(a5), { tam: 13, negrita: true, color: '#ffffff', fondo: '#2b8a3e', opacidad: 0.95 });
        if (a3) etiqueta(`3′ (cadena ${c})`, pos(a3), { tam: 13, negrita: true, color: '#ffffff', fondo: '#c92a2a', opacidad: 0.95 });
      });
    }
  }

  function centroide(lista) {
    const A = estado.atomos, c = { x: 0, y: 0, z: 0 };
    lista.forEach(i => { c.x += A[i].x; c.y += A[i].y; c.z += A[i].z; });
    c.x /= lista.length; c.y /= lista.length; c.z /= lista.length;
    return c;
  }

  function pintarResaltar() {
    const cont = $('#resaltar'), an = estado.an, me = molEfectiva();
    cont.innerHTML = '';
    if (!an) return;
    const chips = [];
    const ordenGrupos = ['hidroxilo', 'carbonilo', 'carboxilo', 'amino', 'fosfato', 'radical', 'doble_cc', 'cabeza_polar', 'cola_apolar'];
    const ordenEnlaces = ['covalente', 'puente_h', 'hemiacetal', 'glucosidico', 'n_glucosidico', 'ester', 'fosfoester', 'fosfodiester', 'fosfoanhidrido', 'peptidico', 'disulfuro'];
    ordenGrupos.forEach(k => { const n = (an.grupos[k] || []).length; if (n) chips.push({ k, nombre: CATALOGO[k].nombre, color: CATALOGO[k].color, n }); });
    (me.grupos || []).forEach(g => { if (atomosGrupo(g).length) chips.push({ k: 'g:' + g.id, nombre: g.nombre, color: g.color }); });
    ordenEnlaces.forEach(k => {
      if (k === 'covalente' && me.bloque !== 'agua' && !estado.resaltes.has(k)) return; // sólo se ofrece en el bloque del agua
      const n = k === 'puente_h' ? an.hbonds.length : (an.enlaces[k] || []).length;
      if (n) chips.push({ k, nombre: CATALOGO[k].nombre, color: CATALOGO[k].color, n, linea: true });
    });
    if (!chips.length) { cont.innerHTML = '<span class="etq">Esta estructura no tiene grupos o enlaces especiales que resaltar.</span>'; return; }
    cont.insertAdjacentHTML('beforeend', '<span class="etq">Resaltar</span>');
    chips.forEach(c => {
      const b = document.createElement('button');
      const oculto = estado.marcar === c.k;
      b.className = 'chip' + (estado.resaltes.has(c.k) ? ' activo' : '');
      if (estado.resaltes.has(c.k)) b.style.borderColor = c.color;
      b.innerHTML = `<span class="muestra" style="background:${c.color}"></span>${oculto ? '¿? (pregunta del test)' : c.nombre}${c.n ? ` <small>(${c.n})</small>` : ''}`;
      b.disabled = oculto;
      b.onclick = () => {
        const activar = !estado.resaltes.has(c.k);
        if (activar) estado.resaltes.add(c.k); else estado.resaltes.delete(c.k);
        pintarResaltar(); pintar();
        // en las macromoléculas, al activar un grupo especial se acerca la cámara a él
        if (activar && c.k.startsWith('g:') && me.macro) {
          const g = me.grupos.find(x => 'g:' + x.id === c.k), lista = atomosGrupo(g).filter(visible);
          if (lista.length && lista.length < estado.visibles.size * 0.5) { const set = new Set(lista); visor.zoomTo({ predicate: a => set.has(a._i) }, 700); visor.render(); }
        }
      };
      cont.appendChild(b);
    });
  }

  function pintarLeyenda(mapa) {
    const ley = $('#leyenda'), me = molEfectiva();
    if (!estado.an) { ley.innerHTML = ''; return; }
    const presentes = new Set(estado.atomos.filter(a => visible(a._i)).map(a => a.elem));
    let html = '<div class="fila">' + Object.entries(COLORES_ELEMENTO).filter(([e]) => ['C', 'O', 'N', 'H', 'P', 'S'].includes(e) || presentes.has(e))
      .map(([e, c]) => `<span class="item" style="${presentes.has(e) ? '' : 'opacity:.45'}"><span class="punto" style="background:${c}"></span>${e}</span>`).join('') + '</div>';
    if (estado.color === 'ss') html += `<div class="fila"><span class="item"><span class="punto" style="background:#e64980"></span>Hélice α</span><span class="item"><span class="punto" style="background:#fab005"></span>Lámina β</span><span class="item"><span class="punto" style="background:#adb5bd"></span>Giros / sin estructura</span></div>`;
    if (estado.color === 'monomero') html += `<div class="fila"><span class="item">Cada color = un monómero${me.macro ? ' (residuo)' : ''}. Los elementos sólo se ven en el modo «Elemento».</span></div>`;
    if (estado.color === 'cadena') {
      const cads = [...new Set(estado.atomos.filter(a => visible(a._i) && !a.hetflag).map(a => a.chain))];
      html += '<div class="fila">' + cads.map(c => `<span class="item"><span class="punto" style="background:${PALETA[c.charCodeAt(0) % PALETA.length]}"></span>Cadena ${c}</span>`).join('') + '</div>';
    }
    const act = [...estado.resaltes].map(k => {
      if (k.startsWith('g:')) { const g = (me.grupos || []).find(x => 'g:' + x.id === k); return g && `<span class="item"><span class="punto" style="background:${g.color}"></span>${g.nombre}</span>`; }
      const c = CATALOGO[k];
      return c && (c.tipo === 'grupo'
        ? `<span class="item"><span class="punto" style="background:${c.color}"></span>${c.nombre}</span>`
        : `<span class="item"><span class="linea ${c.discontinuo ? 'disc' : ''}" style="border-color:${c.color}"></span>${c.nombre}</span>`);
    }).filter(Boolean);
    if (act.length) html += `<div class="fila">${act.join('')}</div>`;
    ley.innerHTML = html;
  }

  /* ================= 5. DESCOMPONER ================= */
  let animDesc = null;
  function descomponer() {
    if (!estado.an || !estado.modelo) return;
    if (estado.descompuesto) return recomponer();
    if (estado.rep === '2d') estado.rep = 'bolas';
    const an = estado.an, A = estado.atomos;
    const mons = an.monomeros.filter(m => m.atomos.some(visible));
    if (mons.length < 2) { aviso('Esta estructura está formada por una sola unidad: no hay monómeros que separar.', 'info'); return; }
    estado.descompuesto = true;
    estado.repAntes = estado.rep; estado.colorAntes = estado.color;
    if (estado.rep === 'cartoon') estado.rep = 'varillas';
    estado.color = 'monomero';
    // guardar coordenadas y enlaces originales
    estado.copia = A.map(a => ({ x: a.x, y: a.y, z: a.z, bonds: a.bonds.slice(), bondOrder: a.bondOrder ? a.bondOrder.slice() : null }));
    // quitar enlaces entre monómeros distintos (sólo para dibujar)
    A.forEach(a => {
      const keep = a.bonds.map((j, k) => an.monomero[j] === an.monomero[a._i] ? k : -1).filter(k => k >= 0);
      a.bondOrder = a.bondOrder ? keep.map(k => a.bondOrder[k]) : a.bondOrder;
      a.bonds = keep.map(k => a.bonds[k]);
    });
    const visiblesIdx = A.filter(a => visible(a._i)).map(a => a._i);
    const cg = centroide(visiblesIdx);
    const despl = new Map();
    mons.forEach(m => {
      const c = centroide(m.atomos), f = molEfectiva().macro ? 0.8 : 0.9;
      despl.set(an.monomeros.indexOf(m), [(c.x - cg.x) * f, (c.y - cg.y) * f, (c.z - cg.z) * f]);
    });
    animar(0, 1, despl, () => { pintar(); pintarBarra(); });
    pintarBarra();
    detalleDescomposicion(mons);
  }
  function recomponer() {
    const an = estado.an, A = estado.atomos;
    const despl = new Map();
    an.monomeros.forEach((m, k) => {
      const i = m.atomos[0], o = estado.copia[i];
      despl.set(k, [A[i].x - o.x, A[i].y - o.y, A[i].z - o.z]);
    });
    animar(1, 0, despl, () => {
      A.forEach((a, i) => { const o = estado.copia[i]; a.x = o.x; a.y = o.y; a.z = o.z; a.bonds = o.bonds; a.bondOrder = o.bondOrder; });
      estado.descompuesto = false;
      estado.rep = estado.repAntes; estado.color = estado.colorAntes;
      pintarBarra(); pintar();
    });
  }
  function animar(desde, hasta, despl, fin) {
    cancelAnimationFrame(animDesc);
    const A = estado.atomos, an = estado.an, t0 = performance.now(), ms = 1000;
    visor.removeAllShapes(); visor.removeAllLabels();
    const paso = t => {
      const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const f = desde + (hasta - desde) * e;
      A.forEach((a, i) => {
        const d = despl.get(an.monomero[i]); if (!d) return;
        const o = estado.copia[i];
        a.x = o.x + d[0] * f; a.y = o.y + d[1] * f; a.z = o.z + d[2] * f;
      });
      pintar(true);
      if (k < 1) animDesc = requestAnimationFrame(paso);
      else { fin(); visor.zoomTo(selVisible()); visor.render(); }
    };
    animDesc = requestAnimationFrame(paso);
  }

  /* ================= 6. PANELES ================= */
  function enlaceFuente(texto) {
    return texto
      .replace(/CID (\d+)/g, (m, n) => `<a href="https://pubchem.ncbi.nlm.nih.gov/compound/${n}" target="_blank" rel="noopener">CID ${n}</a>`)
      .replace(/PDB ([0-9][A-Za-z0-9]{3})/g, (m, id) => `<a href="https://www.rcsb.org/structure/${id}" target="_blank" rel="noopener">PDB ${id}</a>`);
  }

  function pintarInfo() {
    const me = molEfectiva(), i = me.info || {}, an = estado.an;
    let resumen = '';
    if (an && !me.esquema && estado.modelo) {
      const cuenta = {};
      an.monomeros.filter(m => m.atomos.some(visible)).forEach(m => { const n = me.macro ? m.nombre : m.nombre; cuenta[n] = (cuenta[n] || 0) + 1; });
      const lista = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
      const enl = Object.entries(an.enlaces).filter(([k, v]) => v.length && k !== 'covalente').map(([k, v]) => `${CATALOGO[k].nombre}: <b>${v.length}</b>`);
      if (an.hbonds.length) enl.push(`Puentes de hidrógeno: <b>${an.hbonds.length}</b>`);
      resumen = `<h4>Detectado en esta estructura</h4>
        <p>${estado.atomos.length} átomos. Unidades: ${lista.slice(0, 8).map(([n, c]) => `${n} ×${c}`).join(', ')}${lista.length > 8 ? '…' : ''}.</p>
        ${enl.length ? `<p>${enl.join(' · ')}</p>` : ''}
        ${me.angulo && estado.anguloAgua ? `<p>Ángulo H–O–H medido en este modelo: <b>${coma(estado.anguloAgua)}°</b> (valor experimental: 104,5°).</p>` : ''}`;
    }
    $('#tab-info').innerHTML = `
      <h3>${estado.mol.nombre}${me.nombreVariante ? ` <small style="font-weight:500;color:var(--texto-suave)">· ${me.nombreVariante}</small>` : ''}</h3>
      <div class="fuente"><b>Fuente:</b> ${enlaceFuente(me.fuente || '')}</div>
      ${i.composicion ? `<h4>Composición</h4><p>${i.composicion}</p>` : ''}
      ${i.enlaces ? `<h4>Enlaces y estructura</h4><p>${i.enlaces}</p>` : ''}
      ${i.funcion ? `<h4>Función biológica</h4><p>${i.funcion}</p>` : ''}
      ${i.pau ? `<div class="caja-pau"><h4>📌 Para la PAU</h4><p>${i.pau}</p></div>` : ''}
      ${resumen}`;
  }

  function mostrarTab(t) {
    $$('.pestana').forEach(p => p.classList.toggle('activa', p.dataset.tab === t));
    ['info', 'detalle', 'test'].forEach(k => $('#tab-' + k).hidden = k !== t);
  }

  function ficha(titulo, color, cuerpo) {
    $('#tab-detalle').innerHTML = `<div class="ficha-detalle" style="border-color:${color}"><h3>${titulo}</h3>${cuerpo}</div>`;
    mostrarTab('detalle');
  }

  function detalleEnlace(k, inst) {
    const c = CATALOGO[k], A = estado.atomos, an = estado.an;
    const mons = [...new Set(inst.pares.flat().map(i => an.monomero[i]))].map(m => an.monomeros[m].etiqueta);
    ficha(inst.titulo || c.nombre, c.color, `
      <p>${mons.length > 1 ? `Une: <b>${mons.join(' + ')}</b>` : ''}</p>
      <dl><dt>¿Qué une?</dt><dd>${c.une}</dd>
      <dt>¿Cómo se forma?</dt><dd>${c.formacion}</dd>
      <dt>¿Cómo se rompe?</dt><dd>${c.rotura}</dd></dl>
      ${inst.pares.length === 1 ? `<p class="vacio">Longitud en este modelo: ${coma(Analisis.dist(A[inst.pares[0][0]], A[inst.pares[0][1]]), 2)} Å</p>` : ''}`);
  }
  function detallePuenteH(h) {
    const A = estado.atomos, a = A[h.a], b = A[h.b], c = CATALOGO.puente_h, me = molEfectiva();
    const nom = x => me.macro ? `${x.resn}${x.resi} (${x.atom})` : (x._num || NOMBRE_ELEMENTO[x.elem]);
    ficha(c.nombre, c.color, `
      <p>Entre <b>${nom(h.donador !== undefined ? A[h.donador] : a)}</b>${h.donador !== undefined ? ' (H)' : ''} y <b>${nom(b)}</b>. Distancia ${h.donador !== undefined ? 'H···aceptor' : 'entre los átomos N/O'}: <b>${coma(h.d, 2)} Å</b>.</p>
      <dl><dt>¿Qué une?</dt><dd>${c.une}</dd><dt>¿Cómo se forma?</dt><dd>${c.formacion}</dd><dt>¿Cómo se rompe?</dt><dd>${c.rotura}</dd></dl>`);
  }
  function detalleGrupo(clave, idxAtomo) {
    const me = molEfectiva();
    if (clave.startsWith('g:')) {
      const g = me.grupos.find(x => 'g:' + x.id === clave), a = estado.atomos[idxAtomo];
      return ficha(g.nombre, g.color, `${me.macro ? `<p>Has pulsado: <b>${Analisis.NOMBRES_RESIDUO[a.resn] || a.resn} ${a.resi}</b> (cadena ${a.chain}, átomo ${a.atom}).</p>` : ''}<p>${g.texto}</p>`);
    }
    const c = CATALOGO[clave];
    const inst = (estado.an.grupos[clave] || []).find(x => x.atomos.includes(idxAtomo));
    ficha(inst && inst.titulo || c.nombre, c.color, `<p>${c.texto}</p>`);
  }
  function detalleOculto() {
    ficha('Pregunta del test', '#ff00ff', '<p>Este es el elemento por el que pregunta el test. Responde en la pestaña <b>Test</b> y después podrás ver su ficha.</p>');
  }
  function detalleDescomposicion(mons) {
    const me = molEfectiva(), an = estado.an;
    let rotos = '';
    if (me.macro) {
      const pep = (an.enlaces.peptidico || []).filter(e => e.pares[0].every(visible)).length;
      const fd = (an.enlaces.fosfodiester || []).filter(e => e.pares[0].every(visible)).length;
      const ss = (an.enlaces.disulfuro || []).filter(e => e.pares[0].every(visible)).length;
      rotos = [pep && `${pep} enlaces peptídicos → <b>${pep} H₂O</b> (hidrólisis)`, fd && `${fd} enlaces fosfodiéster → <b>${fd * 2} H₂O</b> (dos enlaces éster cada uno)`, ss && `${ss} puentes disulfuro (se rompen por reducción, no por hidrólisis)`].filter(Boolean).join('<br>');
    } else {
      const n = an.monomeros.cortes || 0;
      rotos = n ? `Se han roto <b>${n}</b> enlaces covalentes (${[...new Set(Object.keys(an.enlaces).filter(k => CATALOGO[k].corta && (me.cortar || Object.keys(CATALOGO).filter(x => CATALOGO[x].corta)).includes(k) && an.enlaces[k].length))].map(k => CATALOGO[k].nombre.toLowerCase()).join(', ')}). Cada uno se rompe por <b>hidrólisis</b>: se consumen <b>${n} H₂O</b>. Los monómeros que ves aquí han perdido el H y el OH que se recuperan con esa agua.`
        : 'Las moléculas sólo estaban unidas por <b>interacciones débiles</b> (puentes de H, efecto hidrofóbico): al separarlas no se rompe ningún enlace covalente ni se consume agua.';
    }
    const cuenta = new Map();
    mons.forEach(m => { const k = m.nombre + (m.formula ? ` (${m.formula})` : ''); if (!cuenta.has(k)) cuenta.set(k, { n: 0, color: PALETA[an.monomeros.indexOf(m) % PALETA.length] }); cuenta.get(k).n++; });
    const filas = [...cuenta.entries()].slice(0, 40).map(([k, v]) => `<div class="m"><span class="punto" style="background:${v.color}"></span>${v.n} × ${k}</div>`).join('');
    ficha('Modo «Descomponer»', '#2f6fdd', `<p><b>${mons.length}</b> unidades separadas.</p><p>${rotos}</p><h4>Unidades</h4><div class="lista-monomeros">${filas}</div>${cuenta.size > 40 ? '<p class="vacio">…</p>' : ''}<p class="vacio">Pulsa otra vez «Descomponer» para volver a unirlas.</p>`);
  }

  function alPulsarAtomo(atom) {
    const i = atom._i, mapa = mapaResaltado(), an = estado.an, me = molEfectiva();
    if (estado.descompuesto) {
      const m = an.monomeros[an.monomero[i]];
      return ficha(m.etiqueta, PALETA[an.monomero[i] % PALETA.length], `<p>${m.formula ? `Fórmula del fragmento: <b>${m.formula}</b>` : ''}</p>`);
    }
    const r = mapa.get(i);
    if (r && r.clave === estado.marcar) return detalleOculto();
    if (r && r.enlace) return detalleEnlace(r.clave, r.enlace);
    if (r) return detalleGrupo(r.clave, i);
    for (const k of Object.keys(an.enlaces)) {
      if (!estado.resaltes.has(k)) continue;
      const inst = an.enlaces[k].find(e => e.pares.some(p => p.includes(i)));
      if (inst) return detalleEnlace(k, inst);
    }
    const m = an.monomeros[an.monomero[i]];
    const nombre = NOMBRE_ELEMENTO[atom.elem] || atom.elem;
    ficha(`${nombre}${atom._num ? ' · ' + atom._num : ''}${atom._calfa ? ' · carbono α' : ''}`, COLORES_ELEMENTO[atom.elem] || '#999', `
      ${me.macro ? `<p>Residuo: <b>${Analisis.NOMBRES_RESIDUO[atom.resn] || atom.resn} ${atom.resi}</b> (cadena ${atom.chain}); átomo <b>${atom.atom}</b>.</p>` : `<p>Forma parte de: <b>${m.etiqueta}</b>.</p>`}
      <p>Enlazado a: ${atom.bonds.map(j => estado.atomos[j]).map(b => b._num || (me.macro ? b.atom : b.elem)).join(', ') || 'ningún átomo'}.</p>`);
  }
  window.mostrarDetalleExterno = d => ficha(d.titulo, '#2f6fdd', `<p>${d.texto}</p>`);

  function pintarBarra() {
    const me = molEfectiva();
    $$('[data-rep]').forEach(b => {
      b.classList.toggle('activo', b.dataset.rep === estado.rep);
      const sin2D = b.dataset.rep === '2d' && !hay2D(me);
      b.disabled = (b.dataset.rep === 'cartoon' && !me.macro) || sin2D || estado.descompuesto;
      b.title = b.dataset.rep === 'cartoon' && !me.macro ? 'La cinta sólo tiene sentido en proteínas y ácidos nucleicos'
        : b.dataset.rep === '2d' ? (sin2D ? 'La vista 2D no está disponible para macromoléculas ni estructuras tan grandes: usa la secuencia' : 'Fórmula en 2D: símbolos de los elementos y rayas para los enlaces') : '';
    });
    $$('[data-color]').forEach(b => {
      b.classList.toggle('activo', b.dataset.color === estado.color);
      b.hidden = b.hasAttribute('data-solo-macro') && !me.macro;
      b.disabled = estado.descompuesto;
    });
    $('#btnEtqAtomos').classList.toggle('activo', estado.etqAtomos);
    $('#btnEtqRes').classList.toggle('activo', estado.etqRes);
    $('#btnEtqRes').textContent = me.macro ? 'Etiquetas de residuos' : 'Etiquetas de monómeros';
    if (estado.cicl) textoCiclacion();
    $('#btnGuia').hidden = !me.guia;
    $('#btnGuia').classList.toggle('activo', !!estado.guia);
    $('#btnDescomponer').classList.toggle('activo', estado.descompuesto);
    $('#btnDescomponer').textContent = estado.descompuesto ? '⇄ Volver a unir' : '⇄ Descomponer';
  }

  function pintarSecuencia() {
    const cont = $('#secuencia'), me = molEfectiva(), an = estado.an;
    if (!me.macro || !an) { cont.hidden = true; return; }
    const cadenas = {};
    an.monomeros.forEach(m => {
      if (!m.atomos.some(visible)) return;
      const a = estado.atomos[m.atomos[0]];
      const letra = Analisis.UNA_LETRA[m.resn];
      const esPolimero = letra || esNucleotidoModificado(a);
      if (!esPolimero) return;
      const ca = m.atomos.map(i => estado.atomos[i]).find(x => x.atom === 'CA');
      (cadenas[m.chain] = cadenas[m.chain] || []).push({ m, letra: letra || m.resn[m.resn.length - 1].toLowerCase(), ss: ca ? ca.ss : '' });
    });
    const claves = Object.keys(cadenas);
    if (!claves.length) { cont.hidden = true; return; }
    cont.hidden = false;
    cont.innerHTML = `<h3>Estructura primaria (secuencia, extremo ${me.extremos ? '5′ → 3′' : 'N → C'}). Pulsa un residuo para localizarlo.</h3>` +
      claves.map(c => `<div class="cadena"><b>Cadena ${c}</b>${cadenas[c].map(r => `<button class="res ${r.ss === 'h' ? 'h' : r.ss === 's' ? 's' : ''}" data-c="${c}" data-r="${r.m.resi}" title="${r.m.nombre} ${r.m.resi}">${r.letra}</button>`).join('')}</div>`).join('');
    cont.onclick = e => {
      const b = e.target.closest('.res'); if (!b) return;
      $$('.secuencia .res').forEach(x => x.classList.toggle('sel', x === b));
      const sel = { chain: b.dataset.c, resi: +b.dataset.r };
      estado.resSel = sel;
      pintar();
      visor.zoomTo(sel, 600);
      const a = estado.modelo.selectedAtoms(sel)[0];
      if (a) {
        etiqueta(`${a.resn} ${a.resi}`, pos(a), { tam: 13, negrita: true, color: '#fff', fondo: '#c2255c', opacidad: 0.95 });
        ficha(`${Analisis.NOMBRES_RESIDUO[a.resn] || a.resn} ${a.resi}`, '#c2255c', `<p>Cadena ${a.chain}, posición ${a.resi} de la secuencia.${a.ss === 'h' ? ' Está en una <b>hélice α</b>.' : a.ss === 's' ? ' Está en una <b>lámina β</b>.' : ''}</p>`);
      }
      visor.render();
    };
  }

  /* ---------- esquema de enzima ---------- */
  function mostrarEsquema() {
    estado.modelo = null; estado.an = null;
    visor.removeAllModels(); visor.removeAllShapes(); visor.removeAllLabels(); visor.render();
    $('#visor').hidden = true; $('#leyenda').hidden = true; $('.ayuda-visor').hidden = true; $('#aviso').hidden = true;
    $('#barra').hidden = true; $('#resaltar').hidden = true; $('#secuencia').hidden = true; $('#variantes').innerHTML = '';
    const e = $('#esquema'); e.hidden = false;
    EsquemaEnzima.montar(e);
  }
  function ocultarEsquema() {
    if ($('#esquema').hidden) return;
    EsquemaEnzima.desmontar();
    $('#esquema').hidden = true; $('#visor').hidden = false; $('#leyenda').hidden = false; $('.ayuda-visor').hidden = false;
    $('#barra').hidden = false; $('#resaltar').hidden = false;
    visor.resize();
  }

  /* ================= 7. TEST ================= */
  const test = { ambito: 'molecula', lista: [], idx: 0, aciertos: 0, hechas: 0, respondida: false };
  function reiniciarTest() {
    const m = estado.mol;
    const barajar = l => { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
    if (test.ambito === 'todo') test.lista = barajar(MOLECULAS.flatMap(x => (x.test || []).map(q => ({ mol: x.id, q })))).slice(0, 15);
    else if (test.ambito === 'bloque') test.lista = barajar(MOLECULAS.filter(x => x.bloque === m.bloque).flatMap(x => (x.test || []).map(q => ({ mol: x.id, q }))));
    else test.lista = (m.test || []).map(q => ({ mol: m.id, q }));
    test.idx = 0; test.aciertos = 0; test.hechas = 0; test.respondida = false;
    pintarTest();
  }
  async function prepararPregunta() {
    const item = test.lista[test.idx];
    if (!item) return;
    const q = item.q, marcar = q.marcar || (q.marcarGrupo ? 'g:' + q.marcarGrupo : null);
    const varDeseada = q.variante ?? (item.mol === estado.mol.id ? estado.variante : 0);
    if (item.mol !== estado.mol.id || varDeseada !== estado.variante || marcar !== estado.marcar) {
      await seleccionar(item.mol, varDeseada, { desdeTest: true, marcar });
      mostrarTab('test');
    }
  }
  function pintarTest() {
    const cont = $('#tab-test');
    const cab = `<div class="test-cab">
        <select id="ambitoTest" class="selector" aria-label="Preguntas de">
          <option value="molecula" ${test.ambito === 'molecula' ? 'selected' : ''}>Preguntas de esta molécula</option>
          <option value="bloque" ${test.ambito === 'bloque' ? 'selected' : ''}>Todo el bloque</option>
          <option value="todo" ${test.ambito === 'todo' ? 'selected' : ''}>Examen: 15 preguntas de todo el temario</option>
        </select>
        <span class="marcador">${test.aciertos} / ${test.hechas} aciertos</span></div>`;
    if (!test.lista.length) { cont.innerHTML = cab + '<p class="vacio">Esta ficha no tiene preguntas. Prueba con «Todo el bloque».</p>'; enlazarAmbito(); return; }
    if (test.idx >= test.lista.length) {
      cont.innerHTML = cab + `<h3>¡Terminado!</h3><p>Has acertado <b>${test.aciertos}</b> de <b>${test.hechas}</b>.</p><button class="btn primario" id="otraVez">Empezar de nuevo</button>`;
      $('#otraVez').onclick = () => { reiniciarTest(); prepararPregunta(); };
      enlazarAmbito(); return;
    }
    const { q } = test.lista[test.idx];
    cont.innerHTML = cab + `
      <p class="vacio">Pregunta ${test.idx + 1} de ${test.lista.length}${q.marcar || q.marcarGrupo ? ' · mira lo marcado en <b style="color:#d0f">magenta</b> en el visor' : ''}</p>
      <p class="pregunta">${q.p}</p>
      <div class="opciones">${q.op.map((o, i) => `<button class="opcion" data-i="${i}">${o}</button>`).join('')}</div>
      <div id="feedback"></div>`;
    enlazarAmbito();
    cont.querySelectorAll('.opcion').forEach(b => b.onclick = () => responder(+b.dataset.i));
  }
  function enlazarAmbito() {
    const s = $('#ambitoTest');
    if (s) s.onchange = () => { test.ambito = s.value; reiniciarTest(); prepararPregunta(); };
  }
  function responder(i) {
    const { q } = test.lista[test.idx];
    if (test.respondida) return;
    test.respondida = true; test.hechas++;
    const bien = i === q.ok;
    if (bien) test.aciertos++;
    $$('#tab-test .opcion').forEach((b, k) => { b.disabled = true; if (k === q.ok) b.classList.add('correcta'); else if (k === i) b.classList.add('incorrecta'); });
    const porque = !bien && q.porque && q.porque[i] ? `<p><b>Por qué no:</b> ${q.porque[i]}</p>` : '';
    $('#feedback').innerHTML = `<div class="feedback ${bien ? 'bien' : 'mal'}"><b>${bien ? '✔ ¡Correcto!' : '✘ No es correcto.'}</b>
      ${!bien ? `<p>La respuesta correcta es: <b>${q.op[q.ok]}</b>.</p>` : ''}${porque}<p>${q.exp}</p></div>
      <button class="btn primario" id="sigPregunta" style="margin-top:10px">Siguiente pregunta →</button>`;
    $('.marcador').textContent = `${test.aciertos} / ${test.hechas} aciertos`;
    // tras responder, el elemento marcado pasa a ser un resaltado normal
    if (estado.marcar) { estado.resaltes.add(estado.marcar); estado.marcar = null; pintarResaltar(); pintar(); }
    $('#sigPregunta').onclick = async () => { test.idx++; test.respondida = false; await prepararPregunta(); pintarTest(); };
  }

  /* ================= 8. ARRANQUE ================= */
  function enlazarControles() {
    $$('[data-rep]').forEach(b => b.onclick = () => {
      estado.rep = estado.pref.rep = b.dataset.rep;
      if (!['2d', 'cartoon'].includes(b.dataset.rep)) estado.pref.rep3d = b.dataset.rep;
      pintarBarra(); pintar();
    });
    $$('[data-color]').forEach(b => b.onclick = () => { estado.color = estado.pref.color = b.dataset.color; pintarBarra(); pintar(); });
    $('#btnEtqAtomos').onclick = () => { estado.etqAtomos = estado.pref.etqAtomos = !estado.etqAtomos; aviso(null); estado.avisoEtq = true; pintarBarra(); pintar(); estado.avisoEtq = false; };
    $('#btnEtqRes').onclick = () => { estado.etqRes = estado.pref.etqRes = !estado.etqRes; pintarBarra(); pintar(); };
    $('#btnDescomponer').onclick = descomponer;
    $('#btnGuia').onclick = () => { estado.guia = !estado.guia; pintarBarra(); pintar(); };
    $('#btnCiclar').onclick = () => { if (estado.cicl) { verEn3D(); animarCiclacion(estado.cicl.n); } };
    $('#btnAbrirCadena').onclick = () => { if (estado.cicl) { verEn3D(); animarCiclacion(0); } };
    $('#rangoCicl').oninput = e => { if (estado.cicl) { clearInterval(estado.cicl.anim); irFotograma(+e.target.value, false); } };
    $('#rangoCicl').onchange = e => estado.cicl && irFotograma(+e.target.value, true);
    $('#btnCentrar').onclick = () => { visor.zoomTo(selVisible(), 500); visor.render(); };
    $('#selVista').onchange = e => {
      if (estado.descompuesto) recomponerInmediato();
      estado.vista = +e.target.value; calcularVisibles(); pintarResaltar(); pintarSecuencia(); pintar(); pintarInfo();
      visor.zoomTo(selVisible(), 500); visor.render();
    };
    $$('.pestana').forEach(p => p.onclick = () => { mostrarTab(p.dataset.tab); if (p.dataset.tab === 'test' && !test.respondida) prepararPregunta(); });
    $('#btnMenu').onclick = () => { $('#menu').classList.toggle('abierto'); $('#velo').classList.toggle('visible'); };
    $('#velo').onclick = cerrarMenuMovil;
    $('#btnTema').onclick = () => {
      const nuevo = oscuro() ? 'light' : 'dark';
      document.documentElement.dataset.theme = nuevo;
      try { localStorage.setItem('tema', nuevo); } catch (e) { /* sin almacenamiento */ }
      visor.setBackgroundColor(colorFondo()); pintar();
    };
    $('#formPDB').onsubmit = e => {
      e.preventDefault();
      const id = $('#inputPDB').value.trim().toUpperCase();
      if (!esIdPDB(id)) { aviso('El código PDB debe tener 4 caracteres y empezar por un número (por ejemplo, 1MBN).'); return; }
      abrirPDBLibre(id);
    };
  }
  function recomponerInmediato() {
    const A = estado.atomos;
    A.forEach((a, i) => { const o = estado.copia[i]; a.x = o.x; a.y = o.y; a.z = o.z; a.bonds = o.bonds; a.bondOrder = o.bondOrder; });
    estado.descompuesto = false; estado.rep = estado.repAntes; estado.color = estado.colorAntes; pintarBarra();
  }

  async function abrirPDBLibre(id) {
    const ficha = {
      id: 'pdb-' + id, bloque: null, nombre: `Estructura PDB ${id}`, estructura: id, macro: true, soloRemoto: true, vista: 'cartoon', colorInicial: 'ss', hb: null,
      fuente: `RCSB PDB ${id} (descargada en este momento)`,
      info: { composicion: 'Estructura cargada libremente desde el Protein Data Bank. Usa los botones para explorar sus enlaces y la secuencia.' },
    };
    estado.mol = null;
    $$('#menu [data-mol]').forEach(b => b.classList.remove('activa'));
    estado.mol = ficha;
    estado.variante = 0; estado.vista = 0; estado.descompuesto = false; estado.marcar = null; estado.resSel = null;
    aplicarPreferencias(ficha);
    $('#tituloMol').textContent = ficha.nombre; pintarVariantes(); ocultarEsquema();
    test.lista = []; pintarTest(); mostrarTab('info'); pintarInfo();
    await construirModelo(ficha);
    if (estado.an) {
      const t = (window.ESTRUCTURAS[id].datos.match(/^TITLE.{4}(.*)$/gm) || []).map(l => l.slice(10).trim()).join(' ');
      if (t) { ficha.info.composicion = `<b>Título en el PDB:</b> ${t.toLowerCase()}`; pintarInfo(); }
    }
  }

  function arrancar() {
    try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* sin almacenamiento */ }
    if (!window.$3Dmol) {
      $('#visor').innerHTML = '<p style="padding:20px">No se ha podido cargar la librería 3Dmol.js. Comprueba que existe el archivo lib/3Dmol-min.js.</p>';
      return;
    }
    crearVisor();
    construirMenu();
    enlazarControles();
    const [id, v] = decodeURIComponent(location.hash.slice(1)).split('/');
    seleccionar(MOLECULAS.some(m => m.id === id) ? id : MOLECULAS[0].id, +v || 0);
  }
  document.addEventListener('DOMContentLoaded', arrancar);
  // acceso para depuración desde la consola del navegador
  window.Biomoleculas = { estado, seleccionar };
})();
