/* =====================================================================
   analisis.js — Detección automática (a partir del grafo de enlaces) de:
     · grupos funcionales      · tipos de enlace (glucosídico, éster…)
     · puentes de hidrógeno    · monómeros que forman el polímero
     · numeración de carbonos en los monosacáridos (C1…C6)
   Trabaja con la lista de átomos de 3Dmol (elem, x, y, z, bonds, bondOrder,
   resn, resi, chain, atom). No depende de la interfaz.
   ===================================================================== */
const Analisis = (() => {

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const resta = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
  const prod = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const norma = u => Math.hypot(...u);
  const cruz = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

  /* ---------- utilidades de grafo ---------- */
  function preparar(atomos) {
    const vec = atomos.map(a => a.bonds.slice());
    const orden = atomos.map(a => a.bondOrder ? a.bondOrder.slice() : a.bonds.map(() => 1));
    const ordenEnlace = (i, j) => { const k = vec[i].indexOf(j); return k < 0 ? 0 : (orden[i][k] || 1); };
    const el = i => atomos[i].elem;
    const vecEl = (i, e) => vec[i].filter(j => el(j) === e);
    const nH = i => vecEl(i, 'H').length;
    const pesados = i => vec[i].filter(j => el(j) !== 'H');
    // ¿está el enlace i-j en un anillo? (búsqueda acotada a 8 átomos)
    const cacheAnillo = new Map();
    function enAnillo(i, j) {
      const k = i < j ? i + '-' + j : j + '-' + i;
      if (cacheAnillo.has(k)) return cacheAnillo.get(k);
      let frontera = [i], vistos = new Set([i]), hallado = false;
      for (let prof = 0; prof < 8 && frontera.length && !hallado; prof++) {
        const sig = [];
        for (const x of frontera) for (const y of vec[x]) {
          if (x === i && y === j) continue;
          if (y === j) { hallado = true; break; }
          if (!vistos.has(y) && el(y) !== 'H') { vistos.add(y); sig.push(y); }
        }
        frontera = sig;
      }
      cacheAnillo.set(k, hallado);
      return hallado;
    }
    const atomoEnAnillo = i => vec[i].some(j => enAnillo(i, j));
    return { atomos, vec, ordenEnlace, el, vecEl, nH, pesados, enAnillo, atomoEnAnillo };
  }

  /* Componentes conexas, ignorando los enlaces del conjunto 'cortes' ("i-j") */
  function componentes(G, cortes) {
    const n = G.atomos.length, comp = new Int32Array(n).fill(-1);
    let c = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const pila = [s]; comp[s] = c;
      while (pila.length) {
        const x = pila.pop();
        for (const y of G.vec[x]) {
          if (comp[y] >= 0) continue;
          const k = x < y ? x + '-' + y : y + '-' + x;
          if (cortes.has(k)) continue;
          comp[y] = c; pila.push(y);
        }
      }
      c++;
    }
    return { comp, n: c };
  }
  const clave = (i, j) => i < j ? i + '-' + j : j + '-' + i;

  /* ---------- carbonos especiales ---------- */
  const esCarboniloC = (G, c) => G.el(c) === 'C' && G.vecEl(c, 'O').some(o => G.ordenEnlace(c, o) === 2);
  // C anomérico: C de anillo unido a un O de anillo y a otro O (o N) fuera del anillo, sin dobles enlaces
  function esAnomerico(G, c) {
    if (G.el(c) !== 'C' || esCarboniloC(G, c)) return false;
    const os = G.vec[c].filter(j => G.el(j) === 'O');
    const oAnillo = os.filter(o => G.enAnillo(c, o));
    return oAnillo.length === 1 && G.vec[c].some(j => (G.el(j) === 'O' || G.el(j) === 'N') && !G.enAnillo(c, j));
  }

  /* =================== GRUPOS FUNCIONALES =================== */
  function detectarGrupos(G, opciones) {
    const g = { hidroxilo: [], carbonilo: [], carboxilo: [], amino: [], fosfato: [], radical: [], doble_cc: [], cola_apolar: [], cabeza_polar: [] };
    const n = G.atomos.length;
    for (let i = 0; i < n; i++) {
      const e = G.el(i);
      if (e === 'O') {
        const hs = G.vecEl(i, 'H'), cs = G.vecEl(i, 'C');
        if (hs.length === 1 && cs.length === 1 && G.vec[i].length === 2 && !esCarboniloC(G, cs[0]))
          g.hidroxilo.push({ atomos: [i, hs[0]] });
      } else if (e === 'C') {
        const oDoble = G.vecEl(i, 'O').filter(o => G.ordenEnlace(i, o) === 2);
        const oSimple = G.vecEl(i, 'O').filter(o => G.ordenEnlace(i, o) === 1);
        if (oDoble.length === 1) {
          const o2 = oSimple.find(o => G.vec[o].length === 1 || (G.vec[o].length === 2 && G.nH(o) === 1));
          const tieneN = G.vecEl(i, 'N').length > 0;
          if (o2 !== undefined && oSimple.length === 1 && !G.atomoEnAnillo(i)) {
            g.carboxilo.push({ atomos: [i, oDoble[0], o2, ...G.vecEl(o2, 'H')] });
          } else if (oSimple.length === 0 && !tieneN && !G.atomoEnAnillo(i)) {
            const ald = G.nH(i) === 1;
            g.carbonilo.push({ atomos: [i, oDoble[0], ...G.vecEl(i, 'H')], titulo: ald ? 'Grupo carbonilo: aldehído (–CHO)' : 'Grupo carbonilo: cetona (C=O)' });
          }
        }
        // dobles enlaces C=C (se excluyen los anillos aromáticos)
        for (const j of G.vecEl(i, 'C')) {
          if (j <= i || G.ordenEnlace(i, j) !== 2) continue;
          const conj = [i, j].some(x => G.vec[x].some(y => y !== i && y !== j && G.el(y) !== 'H' && G.enAnillo(x, y) &&
            G.vec[y].some(z => z !== x && G.ordenEnlace(y, z) === 2)));
          if (G.enAnillo(i, j) && conj) continue;
          let titulo = 'Doble enlace C=C';
          // cis / trans según los sustituyentes carbonados
          const si = G.vecEl(i, 'C').find(x => x !== j), sj = G.vecEl(j, 'C').find(x => x !== i);
          if (si !== undefined && sj !== undefined && !G.enAnillo(i, j)) {
            const A = G.atomos;
            const b1 = resta(A[si], A[i]), b2 = resta(A[j], A[i]), b3 = resta(A[sj], A[j]);
            const n1 = cruz(b1, b2), n2 = cruz(b2, b3);
            titulo += prod(n1, n2) > 0 ? ' (cis)' : ' (trans)';
          }
          g.doble_cc.push({ atomos: [i, j], titulo });
        }
      } else if (e === 'N') {
        const hs = G.vecEl(i, 'H'), cs = G.vecEl(i, 'C');
        if (hs.length >= 2 && cs.length === 1 && !esCarboniloC(G, cs[0]))
          g.amino.push({ atomos: [i, ...hs] });
      } else if (e === 'P') {
        const os = G.vecEl(i, 'O');
        if (os.length === 4) g.fosfato.push({ atomos: [i, ...os, ...os.flatMap(o => G.vecEl(o, 'H'))] });
      }
    }
    // radical R de los aminoácidos
    if (opciones.aminoacido) {
      for (let c = 0; c < n; c++) {
        if (G.el(c) !== 'C' || esCarboniloC(G, c)) continue;
        const ns = G.vecEl(c, 'N'), cco = G.vecEl(c, 'C').filter(x => esCarboniloC(G, x));
        if (ns.length !== 1 || cco.length !== 1) continue;
        const otros = G.vec[c].filter(x => x !== ns[0] && x !== cco[0]);
        let inicio = otros.find(x => G.el(x) !== 'H');
        if (inicio === undefined) inicio = otros[0];          // glicina: R = H
        const r = new Set([inicio]), pila = [inicio];
        while (pila.length) { const x = pila.pop(); for (const y of G.vec[x]) if (y !== c && !r.has(y)) { r.add(y); pila.push(y); } }
        G.atomos[c]._calfa = true;
        g.radical.push({ atomos: [...r], titulo: G.el(inicio) === 'H' ? 'Radical R = H (glicina)' : 'Radical R (cadena lateral)' });
      }
    }
    // cabeza polar / colas apolares de los lípidos anfipáticos
    if (opciones.anfipatico) {
      const enCola = new Uint8Array(n);
      for (let c = 0; c < n; c++) {
        if (!esCarboniloC(G, c)) continue;
        const alfa = G.vecEl(c, 'C').find(x => !esCarboniloC(G, x));
        if (alfa === undefined || !G.vecEl(c, 'O').some(o => G.ordenEnlace(c, o) === 1)) continue;
        const pila = [alfa], vistos = new Set([alfa]);
        while (pila.length) {
          const x = pila.pop();
          for (const y of G.vec[x]) if (y !== c && !vistos.has(y) && (G.el(y) === 'C' || G.el(y) === 'H')) { vistos.add(y); pila.push(y); }
        }
        if (vistos.size > 15) { vistos.forEach(x => enCola[x] = 1); }
      }
      const comp = componentes(G, new Set());
      for (let m = 0; m < comp.n; m++) {
        const cola = [], cabeza = [];
        for (let i = 0; i < n; i++) if (comp.comp[i] === m) (enCola[i] ? cola : cabeza).push(i);
        if (cola.length) { g.cola_apolar.push({ atomos: cola }); g.cabeza_polar.push({ atomos: cabeza }); }
      }
    }
    return g;
  }

  /* =================== ENLACES =================== */
  function detectarEnlaces(G, macro) {
    const e = { covalente: [], hemiacetal: [], glucosidico: [], n_glucosidico: [], ester: [], fosfoester: [], fosfodiester: [], fosfoanhidrido: [], peptidico: [], disulfuro: [] };
    const A = G.atomos, n = A.length;
    for (let i = 0; i < n; i++) {
      const el = G.el(i);
      if (!macro && (el === 'O' || el === 'N')) for (const h of G.vecEl(i, 'H')) e.covalente.push({ pares: [[i, h]], corte: null, titulo: `Enlace covalente polar ${el}–H` });
      if (el === 'O' && G.vec[i].length >= 2) {
        const cs = G.vecEl(i, 'C'), ps = G.vecEl(i, 'P');
        // éster carboxílico C(=O)–O–C
        if (cs.length === 2 && G.vec[i].length === 2) {
          const carb = cs.find(c => esCarboniloC(G, c));
          if (carb !== undefined && !macro) { const otro = cs.find(c => c !== carb); e.ester.push({ pares: [[carb, i], [i, otro]], corte: [carb, i] }); continue; }
          // O-glucosídico: O fuera de anillo entre dos C, al menos uno anomérico
          if (!G.enAnillo(i, cs[0]) && !G.enAnillo(i, cs[1])) {
            const an = cs.filter(c => esAnomerico(G, c));
            if (an.length) {
              const don = an[0], acc = cs.find(c => c !== don);
              e.glucosidico.push({ pares: [[don, i], [i, acc]], corte: [don, i], donador: don, aceptor: acc, puente: i });
              continue;
            }
          }
        }
        // P–O–P: fosfoanhídrido
        if (ps.length === 2) { e.fosfoanhidrido.push({ pares: [[ps[0], i], [i, ps[1]]], corte: [ps[0], i] }); continue; }
      }
      if (el === 'P') {
        // oxígenos puente hacia carbonos
        const puentes = G.vecEl(i, 'O').filter(o => G.vecEl(o, 'C').length === 1 && G.vec[o].length === 2);
        if (puentes.length === 1) {
          const o = puentes[0], c = G.vecEl(o, 'C')[0];
          e.fosfoester.push({ pares: [[i, o], [o, c]], corte: [i, o] });
        } else if (puentes.length >= 2) {
          const pares = [], cortes = [];
          puentes.forEach(o => { pares.push([i, o], [o, G.vecEl(o, 'C')[0]]); cortes.push([i, o]); });
          e.fosfodiester.push({ pares, corte: cortes[0], cortes });
        }
      }
      if (el === 'N') {
        // N-glucosídico: N de anillo (base) unido a un C anomérico de pentosa
        for (const c of G.vecEl(i, 'C')) {
          if (!G.enAnillo(i, c) && esAnomerico(G, c) && G.atomoEnAnillo(i))
            e.n_glucosidico.push({ pares: [[c, i]], corte: [c, i] });
        }
        // peptídico
        for (const c of G.vecEl(i, 'C')) {
          if (macro) {
            if (A[i].atom === 'N' && A[c].atom === 'C' && (A[c].resi !== A[i].resi || A[c].chain !== A[i].chain))
              e.peptidico.push({ pares: [[c, i]], corte: [c, i], titulo: `Enlace peptídico ${A[c].resn}${A[c].resi}–${A[i].resn}${A[i].resi}` });
          } else if (esCarboniloC(G, c) && G.vecEl(i, 'C').length >= 2 && !G.atomoEnAnillo(c)) {
            e.peptidico.push({ pares: [[c, i]], corte: [c, i] });
          }
        }
      }
      // hemiacetal / hemicetal: C anomérico con –OH libre unido al O del anillo
      if (el === 'C' && !macro && esAnomerico(G, i)) {
        const oAn = G.vec[i].find(o => G.el(o) === 'O' && G.enAnillo(i, o));
        const oh = G.vec[i].find(o => G.el(o) === 'O' && !G.enAnillo(i, o) && G.nH(o) === 1 && G.vec[o].length === 2);
        if (oAn !== undefined && oh !== undefined) {
          const cetosa = G.vecEl(i, 'C').length === 2;
          e.hemiacetal.push({ pares: [[i, oAn]], corte: null, anomerico: i, oAnillo: oAn, cetosa });
        }
      }
      if (el === 'S') {
        for (const s of G.vecEl(i, 'S')) if (s > i) e.disulfuro.push({ pares: [[i, s]], corte: [i, s] });
      }
    }
    // puentes disulfuro que el lector no enlazó (macromoléculas): por distancia SG–SG
    if (macro) {
      const sg = [];
      for (let i = 0; i < n; i++) if (A[i].elem === 'S' && A[i].resn === 'CYS') sg.push(i);
      for (let a = 0; a < sg.length; a++) for (let b = a + 1; b < sg.length; b++) {
        const i = sg[a], j = sg[b];
        if (dist(A[i], A[j]) < 2.6 && !e.disulfuro.some(d => d.pares[0].includes(i) && d.pares[0].includes(j)))
          e.disulfuro.push({ pares: [[i, j]], corte: null });
      }
      e.disulfuro.forEach(d => { const [i, j] = d.pares[0]; d.titulo = `Puente disulfuro Cys ${A[i].chain}${A[i].resi} – Cys ${A[j].chain}${A[j].resi}`; });
    }
    return e;
  }

  /* =================== PUENTES DE HIDRÓGENO =================== */
  // pares de átomos que forman puentes de H en los pares de bases (A–T/U: N6–O4, N1–N3; G–C: O6–N4, N1–N3, N2–O2; G·U: O6–N3, N1–O2)
  const PARES_WC = new Set(['N1-N3', 'N6-O4', 'N4-O6', 'N2-O2', 'N3-O6', 'N1-O2']);
  function detectarPuentesH(G, modo, monomero) {
    const A = G.atomos, res = [];
    if (!modo) return res;
    // rejilla espacial para no comparar todos con todos
    const celda = 3.6, mapa = new Map();
    const llave = (x, y, z) => x + ',' + y + ',' + z;
    const candidatos = [];
    A.forEach((a, i) => {
      if (modo === 'esqueleto' && !(a.atom === 'N' || a.atom === 'O')) return;
      if (modo === 'bases' && !['N1', 'N2', 'N3', 'N4', 'N6', 'N7', 'O2', 'O4', 'O6'].includes(a.atom)) return;
      if ((modo === 'pesados') && !(a.elem === 'O' || a.elem === 'N')) return;
      if (modo === 'H' && !(a.elem === 'O' || a.elem === 'N' || a.elem === 'H')) return;
      candidatos.push(i);
      const k = llave(Math.floor(a.x / celda), Math.floor(a.y / celda), Math.floor(a.z / celda));
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(i);
    });
    const vecinos = i => {
      const a = A[i], cx = Math.floor(a.x / celda), cy = Math.floor(a.y / celda), cz = Math.floor(a.z / celda), out = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const l = mapa.get(llave(cx + dx, cy + dy, cz + dz)); if (l) out.push(...l);
      }
      return out;
    };
    const visto = new Set();
    for (const i of candidatos) {
      const a = A[i];
      if (modo === 'H') {
        if (a.elem !== 'H') continue;
        const d = G.vec[i][0];
        if (d === undefined || !(G.el(d) === 'O' || G.el(d) === 'N')) continue;
        for (const j of vecinos(i)) {
          const b = A[j];
          if (!(b.elem === 'O' || b.elem === 'N') || j === d || monomero[j] === monomero[i]) continue;
          const r = dist(a, b);
          if (r < 1.5 || r > 2.5) continue;
          const u = resta(A[d], a), v = resta(b, a);
          const ang = Math.acos(prod(u, v) / norma(u) / norma(v)) * 180 / Math.PI;
          if (ang < 120) continue;
          res.push({ a: i, b: j, d: r, donador: d });
        }
      } else {
        for (const j of vecinos(i)) {
          if (j <= i) continue;
          const b = A[j];
          if (modo === 'esqueleto') {
            if (a.atom === b.atom) continue;
            if (a.chain === b.chain && Math.abs(a.resi - b.resi) < 3) continue;
            const r = dist(a, b); if (r > 3.3 || r < 2.5) continue;
            res.push({ a: i, b: j, d: r });
          } else if (modo === 'bases') {
            // sólo los átomos del borde Watson-Crick (y el par G·U «wobble»)
            const par = [a.atom, b.atom].sort().join('-');
            if (!PARES_WC.has(par)) continue;
            if ((par === 'N3-O6' || par === 'N1-O2') && !(/U/.test(a.resn) || /U/.test(b.resn))) continue;  // G·U sólo con uracilo
            if (a.chain === b.chain && Math.abs(a.resi - b.resi) < 2) continue;
            const r = dist(a, b); if (r > 3.3 || r < 2.5) continue;
            res.push({ a: i, b: j, d: r });
          } else if (modo === 'pesados') {
            if (monomero[i] === monomero[j]) continue;
            if (G.vec[i].includes(j) || G.vec[i].some(x => G.vec[x].includes(j))) continue;
            // al menos uno debe llevar H (dador)
            if (!G.nH(i) && !G.nH(j)) continue;
            const r = dist(a, b); if (r > 3.2 || r < 2.5) continue;
            const k = clave(i, j); if (visto.has(k)) continue; visto.add(k);
            res.push({ a: i, b: j, d: r });
          }
        }
      }
    }
    return res;
  }

  /* =================== MONÓMEROS =================== */
  const NOMBRES_RESIDUO = {
    ALA: 'Alanina', ARG: 'Arginina', ASN: 'Asparagina', ASP: 'Ácido aspártico', CYS: 'Cisteína', GLN: 'Glutamina', GLU: 'Ácido glutámico',
    GLY: 'Glicina', HIS: 'Histidina', ILE: 'Isoleucina', LEU: 'Leucina', LYS: 'Lisina', MET: 'Metionina', PHE: 'Fenilalanina', PRO: 'Prolina',
    SER: 'Serina', THR: 'Treonina', TRP: 'Triptófano', TYR: 'Tirosina', VAL: 'Valina',
    DA: 'Desoxiadenosín monofosfato (dAMP)', DT: 'Desoxitimidín monofosfato (dTMP)', DG: 'Desoxiguanosín monofosfato (dGMP)', DC: 'Desoxicitidín monofosfato (dCMP)',
    A: 'Adenosín monofosfato (AMP)', U: 'Uridín monofosfato (UMP)', G: 'Guanosín monofosfato (GMP)', C: 'Citidín monofosfato (CMP)',
    HEM: 'Grupo hemo', NAG: 'N-acetilglucosamina (NAG)', MG: 'Ion Mg²⁺', MN: 'Ion Mn²⁺', ZN: 'Ion Zn²⁺',
    PSU: 'Pseudouridina', H2U: 'Dihidrouridina', OMG: '2′-O-metilguanosina', OMC: '2′-O-metilcitidina', YYG: 'Wibutosina', '2MG': '2-metilguanosina',
    M2G: 'N2,N2-dimetilguanosina', '5MC': '5-metilcitidina', '7MG': '7-metilguanosina', '5MU': 'Ribotimidina', '1MA': '1-metiladenosina',
  };
  const UNA_LETRA = { ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', DA: 'A', DT: 'T', DG: 'G', DC: 'C', A: 'A', U: 'U', G: 'G', C: 'C' };

  function formula(G, lista) {
    const c = {};
    lista.forEach(i => c[G.el(i)] = (c[G.el(i)] || 0) + 1);
    const orden = ['C', 'H', ...Object.keys(c).filter(k => k !== 'C' && k !== 'H').sort()];
    const sub = s => String(s).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
    return orden.filter(k => c[k]).map(k => k + (c[k] > 1 ? sub(c[k]) : '')).join('');
  }

  function nombrarComponente(G, lista) {
    const cnt = {}; lista.forEach(i => cnt[G.el(i)] = (cnt[G.el(i)] || 0) + 1);
    const C = cnt.C || 0, N = cnt.N || 0, O = cnt.O || 0, P = cnt.P || 0;
    const anilloO = lista.some(i => G.el(i) === 'O' && G.vec[i].filter(j => G.el(j) === 'C').length === 2 && G.atomoEnAnillo(i));
    if (C === 0 && O === 1 && !P) return 'Agua';
    if (P && C === 0) return P > 1 ? 'Fosfatos' : 'Grupo fosfato';
    if (N === 1 && C === 5 && O <= 1 && lista.some(i => G.el(i) === 'N' && G.vecEl(i, 'C').length === 4)) return 'Colina';
    if (C === 3 && O === 3 && !N) {
      const carb = lista.find(i => esCarboniloC(G, i));
      if (carb === undefined) return 'Glicerol';
      return G.nH(carb) === 1 ? 'Gliceraldehído' : 'Dihidroxiacetona';
    }
    if (N >= 2 && lista.some(i => G.el(i) === 'N' && G.atomoEnAnillo(i)) && C <= 6) return 'Base nitrogenada';
    if (anilloO && !N && C === 5) return 'Pentosa';
    if (anilloO && !N && C === 6) {
      const anillo5 = lista.some(i => G.atomos[i]._num === 'C2' && esAnomerico(G, i));
      return anillo5 ? 'Fructosa' : nombreHexopiranosa(G, lista);
    }
    if (!N && !P && C >= 3 && C <= 7 && O >= C - 1 && lista.some(i => G.atomos[i]._numero === 1)) return 'Monosacárido (forma lineal)';
    if (C >= 10 && !N && O <= 2 && lista.some(i => esCarboniloC(G, i))) return `Ácido graso (${C} C)`;
    if (N >= 1 && lista.some(i => G.atomos[i]._calfa)) return 'Aminoácido';
    if (C >= 15 && !N && !P) return 'Lípido';
    if (P && N) return 'Fosfolípido';
    return 'Fragmento';
  }

  /* Identifica glucosa, manosa o galactosa (piranosas D) por la cara del anillo en la que
     quedan los –OH de C2, C3 y C4 respecto al CH2OH (C6), como en la proyección de Haworth. */
  function nombreHexopiranosa(G, lista) {
    const A = G.atomos, num = k => lista.find(i => A[i]._numero === k && G.el(i) === 'C');
    const c5 = num(5), c6 = num(6);
    const oAn = c5 !== undefined ? G.vec[c5].find(o => G.el(o) === 'O' && G.enAnillo(c5, o)) : undefined;
    if (oAn === undefined || c6 === undefined) return 'Hexosa';
    const anillo = [1, 2, 3, 4, 5].map(num).concat([oAn]);
    if (anillo.some(x => x === undefined)) return 'Hexosa';
    const cen = [0, 0, 0]; anillo.forEach(i => { cen[0] += A[i].x; cen[1] += A[i].y; cen[2] += A[i].z; });
    cen.forEach((v, k) => cen[k] = v / 6);
    const P = anillo.map(i => [A[i].x - cen[0], A[i].y - cen[1], A[i].z - cen[2]]);
    let n = [0, 0, 0];
    for (let k = 0; k < 6; k++) { const q = cruz(P[k], P[(k + 1) % 6]); n = n.map((v, t) => v + q[t]); }
    const lado = (c, x) => Math.sign(prod(resta(A[x], A[c]), n));
    const arriba = lado(c5, c6);
    const codigo = [2, 3, 4].map(k => {
      const c = num(k), o = G.vec[c].find(x => G.el(x) === 'O' && !G.enAnillo(c, x));
      return o === undefined ? '?' : (lado(c, o) === arriba ? 'u' : 'd');
    }).join('');
    return { dud: 'Glucosa', uud: 'Manosa', duu: 'Galactosa' }[codigo] || 'Hexosa';
  }

  /* ---------- numeración de carbonos en monosacáridos ---------- */
  function numerarAzucares(G, comp, prima) {
    const A = G.atomos;
    for (let m = 0; m < comp.n; m++) {
      const cs = [];
      for (let i = 0; i < A.length; i++) if (comp.comp[i] === m && G.el(i) === 'C') cs.push(i);
      if (cs.length < 3 || cs.length > 7) continue;
      const enComp = new Set(cs);
      // ¿es un azúcar? cada carbono (salvo, como mucho, dos) lleva un O
      const conO = cs.filter(c => G.vecEl(c, 'O').length > 0).length;
      if (conO < cs.length - 1 || cs.some(c => G.vecEl(c, 'N').length)) continue;
      // camino de carbonos más largo (los azúcares son lineales)
      const bfs = s => {
        const d = new Map([[s, 0]]), padre = new Map(), q = [s];
        while (q.length) { const x = q.shift(); for (const y of G.vecEl(x, 'C')) if (enComp.has(y) && !d.has(y)) { d.set(y, d.get(x) + 1); padre.set(y, x); q.push(y); } }
        let far = s; d.forEach((v, k) => { if (v > d.get(far)) far = k; });
        return { far, padre, d };
      };
      const e1 = bfs(cs[0]).far, r = bfs(e1);
      const camino = [r.far]; let x = r.far; while (r.padre.has(x)) { x = r.padre.get(x); camino.push(x); }
      if (camino.length !== cs.length) continue;
      const clave = camino.findIndex(c => esAnomerico(G, c) || esCarboniloC(G, c) ||
        (G.vecEl(c, 'O').some(o => G.vecEl(o, 'C').length === 2 && !G.enAnillo(c, o) && G.vecEl(c, 'O').length >= 2)));
      if (clave < 0) continue;
      if (clave > camino.length - 1 - clave) camino.reverse();
      const p = prima ? '′' : '';
      camino.forEach((c, k) => {
        A[c]._num = 'C' + (k + 1) + p;
        A[c]._numero = k + 1;
        for (const o of G.vecEl(c, 'O')) {
          if (comp.comp[o] !== m) continue;
          if (G.atomoEnAnillo(o) && G.vecEl(o, 'C').length === 2) {
            // O del anillo: toma el número del carbono más alto
            const otros = G.vecEl(o, 'C').filter(z => z !== c);
            if (!A[o]._num || camino.indexOf(c) > camino.indexOf(otros[0])) A[o]._num = 'O' + (k + 1) + p;
          } else A[o]._num = 'O' + (k + 1) + p;
        }
      });
    }
  }

  /* ---------- α / β de un carbono anomérico (convención de Haworth para D-azúcares) ---------- */
  function configuracionAnomerica(G, c, oExo) {
    const A = G.atomos;
    // anillo que contiene c
    const oAn = G.vec[c].find(o => G.el(o) === 'O' && G.enAnillo(c, o));
    if (oAn === undefined) return '';
    // anillo = camino más corto de oAn a c sin usar el enlace directo
    const padre = new Map([[oAn, -1]]), cola = [oAn];
    while (cola.length && !padre.has(c)) {
      const x = cola.shift();
      for (const y of G.vec[x]) {
        if (G.el(y) === 'H' || padre.has(y) || (x === oAn && y === c)) continue;
        padre.set(y, x); cola.push(y);
      }
    }
    if (!padre.has(c)) return '';
    const anillo = [];
    for (let x = c; x !== -1; x = padre.get(x)) anillo.push(x);
    // centro y normal del anillo
    const cen = [0, 0, 0]; anillo.forEach(i => { cen[0] += A[i].x; cen[1] += A[i].y; cen[2] += A[i].z; });
    cen.forEach((v, k) => cen[k] = v / anillo.length);
    const P = anillo.map(i => [A[i].x - cen[0], A[i].y - cen[1], A[i].z - cen[2]]);
    let nrm = [0, 0, 0];
    for (let k = 0; k < P.length; k++) { const q = cruz(P[k], P[(k + 1) % P.length]); nrm = nrm.map((v, t) => v + q[t]); }
    // carbono de referencia: el C exocíclico unido al C del anillo con O de anillo distinto de c (C5 → C6)
    const cRef = anillo.find(i => i !== c && G.el(i) === 'C' && G.vec[i].includes(oAn));
    const c6 = cRef !== undefined ? G.vecEl(cRef, 'C').find(y => !anillo.includes(y)) : undefined;
    if (c6 === undefined) return '';
    const lado = i => prod([A[i].x - cen[0], A[i].y - cen[1], A[i].z - cen[2]], nrm);
    return Math.sign(lado(oExo) - lado(c)) === Math.sign(lado(c6) - lado(cRef)) ? 'β' : 'α';
  }

  /* =================== ANÁLISIS COMPLETO =================== */
  /* 3Dmol no une por distancia un residuo HETATM (p. ej. nucleótido modificado) con el
     residuo vecino: se completan los enlaces O3′–P y C–N entre residuos consecutivos. */
  function completarEnlacesEntreResiduos(atomos) {
    const idx = new Map();
    atomos.forEach((a, i) => idx.set(`${a.chain}|${a.resi}|${a.atom}`, i));
    const unir = (i, j) => {
      const a = atomos[i], b = atomos[j];
      if (a.bonds.includes(j) || dist(a, b) > 1.9) return;
      a.bonds.push(j); b.bonds.push(i);
      if (a.bondOrder) a.bondOrder.push(1); if (b.bondOrder) b.bondOrder.push(1);
    };
    atomos.forEach((a, i) => {
      if (a.atom === 'P') { const j = idx.get(`${a.chain}|${a.resi - 1}|O3'`); if (j !== undefined) unir(i, j); }
      if (a.atom === 'N') { const j = idx.get(`${a.chain}|${a.resi - 1}|C`); if (j !== undefined) unir(i, j); }
    });
  }

  function analizar(atomos, mol) {
    const macro = !!mol.macro;
    if (macro) completarEnlacesEntreResiduos(atomos);
    const G = preparar(atomos);
    const grupos = macro ? {} : detectarGrupos(G, mol);
    const enlaces = detectarEnlaces(G, macro);

    // monómeros
    let monomero, monomeros = [];
    if (macro) {
      const idx = new Map();
      monomero = new Int32Array(atomos.length);
      atomos.forEach((a, i) => {
        const k = a.chain + ':' + a.resi + ':' + a.resn;
        if (!idx.has(k)) { idx.set(k, monomeros.length); monomeros.push({ atomos: [], nombre: NOMBRES_RESIDUO[a.resn] || a.resn, etiqueta: `${a.resn} ${a.resi}`, resn: a.resn, resi: a.resi, chain: a.chain }); }
        monomero[i] = idx.get(k);
        monomeros[idx.get(k)].atomos.push(i);
      });
    } else {
      const tiposCorte = mol.cortar || Object.keys(CATALOGO).filter(k => CATALOGO[k].corta);
      const cortes = new Set();
      tiposCorte.forEach(t => (enlaces[t] || []).forEach(e => (e.cortes || (e.corte ? [e.corte] : [])).forEach(([i, j]) => cortes.add(clave(i, j)))));
      const comp = componentes(G, cortes);
      if (mol.monosacarido || mol.nucleotido) numerarAzucares(G, comp, !!mol.nucleotido);
      monomero = comp.comp;
      for (let m = 0; m < comp.n; m++) monomeros.push({ atomos: [] });
      atomos.forEach((a, i) => monomeros[monomero[i]].atomos.push(i));
      monomeros.forEach((m, k) => { m.nombre = nombrarComponente(G, m.atomos); m.formula = formula(G, m.atomos); });
      // numerar los monómeros del mismo tipo (Glucosa 1, Glucosa 2…)
      const cuenta = {};
      monomeros.forEach(m => cuenta[m.nombre] = (cuenta[m.nombre] || 0) + 1);
      const vistos = {};
      monomeros.forEach(m => { vistos[m.nombre] = (vistos[m.nombre] || 0) + 1; m.etiqueta = cuenta[m.nombre] > 1 ? `${m.nombre} ${vistos[m.nombre]}` : m.nombre; });
      monomeros.cortes = cortes.size;
    }

    // títulos detallados de los enlaces glucosídicos: α/β y posiciones (1→4…)
    const titularGlucosidico = e => {
      const A = atomos, d = A[e.donador], a = A[e.aceptor];
      const conf = macro ? '' : configuracionAnomerica(G, e.donador, e.puente);
      // si los dos carbonos son anoméricos (sacarosa), se nombra desde el de número más bajo: α(1→2)β
      if (!macro && esAnomerico(G, e.aceptor) && a._numero && d._numero && a._numero < d._numero) {
        [e.donador, e.aceptor] = [e.aceptor, e.donador];
        return titularGlucosidico(e);
      }
      let pos = '';
      if (d._numero && a._numero) {
        pos = `(${d._numero}→${a._numero})`;
        if (esAnomerico(G, e.aceptor)) { const c2 = configuracionAnomerica(G, e.aceptor, e.puente); pos += c2; }
      } else if (macro) pos = `${d.resn}${d.resi}–${a.resn}${a.resi}`;
      e.titulo = `Enlace O-glucosídico ${conf}${pos}`.trim();
      if (macro && d.resn === 'NAG') e.titulo = `Enlace O-glucosídico β(1→4) ${d.resn}${d.resi}–${a.resn}${a.resi}`;
    };
    (enlaces.glucosidico || []).forEach(titularGlucosidico);
    (enlaces.hemiacetal || []).forEach(e => {
      const c = atomos[e.anomerico], o = atomos[e.oAnillo];
      const conf = configuracionAnomerica(G, e.anomerico, G.vec[e.anomerico].find(x => G.el(x) === 'O' && !G.enAnillo(e.anomerico, x)));
      e.config = conf;
      e.titulo = `Enlace ${e.cetosa ? 'hemicetal' : 'hemiacetal'}${c._num && o._num ? ` ${c._num}–${o._num}` : ''}${conf ? ` (anómero ${conf})` : ''}`;
    });
    if (!macro && monomeros.length === 1 && (enlaces.hemiacetal || []).length === 1 && enlaces.hemiacetal[0].config) {
      const m = monomeros[0]; m.nombre = `${m.nombre} (${enlaces.hemiacetal[0].config})`; m.etiqueta = m.nombre;
    }
    (enlaces.fosfodiester || []).forEach(e => {
      if (macro) {
        const cs = e.pares.map(p => atomos[p[1]]).filter(a => a.elem === 'C').sort((x, y) => x.resi - y.resi);
        if (cs.length === 2) e.titulo = `Enlace fosfodiéster ${cs[0].resn}${cs[0].resi} (C3′) – ${cs[1].resn}${cs[1].resi} (C5′)`;
      }
    });

    const hbonds = detectarPuentesH(G, mol.hb, monomero);
    return { G, grupos, enlaces, hbonds, monomero, monomeros };
  }

  return { analizar, NOMBRES_RESIDUO, UNA_LETRA, dist, formula };
})();
