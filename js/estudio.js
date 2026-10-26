/* =====================================================================
   estudio.js — DATOS de la «forma de estudio» (2D simplificada de los
   libros y de la PAU). Cada dibujo se define a mano: coordenadas en
   unidades de enlace (1 = longitud de un enlace), ángulos limpios
   (0º, 90º, 60º/120º) y un átomo por símbolo. NO se calcula desde el 3D.

   Cómo se define un dibujo (clase Dib):
     d.a(el, x, y, {h, carga})   átomo; h = nº de H que se escriben junto a él (OH, CH₂…)
     d.r(i, ang, el, {...})      átomo nuevo unido a i en la dirección ang (0 = →, 90 = ↓)
     d.e(i, j, orden)            enlace (orden 2 = doble)
     d.puente(h, aceptor)        puente de hidrógeno (línea discontinua)
   Ayudas: anillo() (Haworth plano), fischer(), acilo() (cadena de ácido graso),
   purina() / pirimidina() (bases).

   La web comprueba cada dibujo al mostrarlo: busca la correspondencia átomo a
   átomo con la estructura 3D y verifica la estereoquímica (lado de cada –OH en
   Haworth, derecha/izquierda en Fischer). Si un dibujo no encaja, avisa.

   ESTUDIO[clave de la estructura] = lista de dibujos posibles (se usa el
   primero que encaja; p. ej. en la ciclación, Fischer abierto o Haworth cerrado).
   ===================================================================== */
const ESTUDIO = (() => {
  const RAD = Math.PI / 180;
  const dir = a => [Math.cos(a * RAD), Math.sin(a * RAD)];

  class Dib {
    constructor() { this.at = []; this.en = []; this.hb = []; this.anillos = []; this.fischer = []; this.textos = []; }
    a(el, x, y, o = {}) { this.at.push({ el, x, y, h: o.h || 0, carga: o.carga || '' }); return this.at.length - 1; }
    e(a, b, orden = 1, o = {}) { this.en.push({ a, b, o: orden, agn: !!o.agn }); return this; }
    r(i, ang, el, o = {}) {
      const p = this.at[i], [dx, dy] = dir(ang), L = o.len || 1;
      const j = this.a(el, p.x + dx * L, p.y + dy * L, o);
      this.e(i, j, o.ord || 1, o);
      return j;
    }
    puente(h, acc) { this.hb.push([h, acc]); }
    texto(x, y, t) { this.textos.push({ x, y, t }); }
  }

  /* ---------- sustituyentes ---------- */
  // t: 'H' | 'OH' | 'O*' (O puente) | '*' (continúa: «···») | 'CH3' | 'CH2OH' | 'CH2*' | {t:'link', id}
  function sus(d, c, ang, t, len, cx) {
    if (t && typeof t === 'object') {
      if (t.t === 'link') { d.e(c, t.id); return t.id; }
      if (t.ang !== undefined) ang = t.ang;
      if (t.len !== undefined) len = t.len;
      t = t.t;
    }
    switch (t) {
      case 'H': return d.r(c, ang, 'H', { len: len * 0.85 });
      case 'OH': return d.r(c, ang, 'O', { len, h: 1 });
      case 'O*': return d.r(c, ang, 'O', { len });
      case '*': return d.r(c, ang, '*', { len });
      case 'CH3': return d.r(c, ang, 'C', { len, h: 3 });
      case 'CH2OH': case 'CH2*': {
        const c6 = d.r(c, ang, 'C', { len, h: 2 });
        if (t === 'CH2OH') d.r(c6, d.at[c].x >= cx ? 0 : 180, 'O', { h: 1, len: 0.95 });
        return c6;
      }
    }
    throw new Error('Sustituyente desconocido: ' + t);
  }

  /* ---------- anillos de Haworth (planos) ----------
     forma 'piranosa' (O + C1…C5) o 'furanosa' (O + 4 C). Los carbonos se numeran
     1…n desde el anomérico. conf[k] = {arriba, abajo}: lo que hay en cada cara en la
     convención de Haworth (D-azúcares: CH₂OH terminal arriba). opt.invertida dibuja el
     anillo dado la vuelta (como el 2.º anillo de la celobiosa) y opt.girada lo gira
     sobre el eje vertical (como la fructosa de la sacarosa).                         */
  const HEX = { O: [0.65, -1.126], 1: [1.3, 0], 2: [0.65, 1.126], 3: [-0.65, 1.126], 4: [-1.3, 0], 5: [-0.65, -1.126] };
  const PEN = { O: [0, -1.05], 1: [1.0, -0.33], 2: [0.62, 0.85], 3: [-0.62, 0.85], 4: [-1.0, -0.33] };
  function anillo(d, cx, cy, forma, conf, opt = {}) {
    const fx = opt.girada ? -1 : 1, fy = opt.invertida ? -1 : 1;
    const P = forma === 'piranosa' ? HEX : PEN, n = forma === 'piranosa' ? 5 : 4;
    const id = { O: d.a('O', cx + P.O[0] * fx, cy + P.O[1] * fy) };
    for (let k = 1; k <= n; k++) id[k] = d.a('C', cx + P[k][0] * fx, cy + P[k][1] * fy);
    const orden = ['O']; for (let k = 1; k <= n; k++) orden.push(k);
    orden.forEach((k, i) => d.e(id[k], id[orden[(i + 1) % orden.length]]));
    const subs = [];
    for (let k = 1; k <= n; k++) for (const lado of ['arriba', 'abajo']) {
      const spec = (conf[k] || {})[lado];
      if (spec == null) continue;
      const haciaArriba = (lado === 'arriba') !== !!opt.invertida;
      const yv = P[k][1] * fy;
      const interior = (haciaArriba && yv > 0.5) || (!haciaArriba && yv < -0.5);
      const j = sus(d, id[k], haciaArriba ? -90 : 90, spec, interior ? 0.62 : 0.95, cx);
      subs.push({ c: id[k], x: j, arriba: lado === 'arriba' });
      id[k + (lado === 'arriba' ? 'a' : 'b')] = j;
    }
    d.anillos.push({ ciclo: orden.map(k => id[k]), subs });
    return id;
  }
  // configuración de Haworth a partir de la proyección de Fischer: derecha (D) → abajo
  const cara = f => f === 'D' ? { arriba: 'H', abajo: 'OH' } : f === 'I' ? { arriba: 'OH', abajo: 'H' } : { arriba: 'H', abajo: 'H' };
  const anomerico = (an, otro = 'H') => an === 'β' ? { arriba: 'OH', abajo: otro } : { arriba: otro, abajo: 'OH' };
  // aldohexopiranosa D: fis = Fischer de C2, C3, C4 ('D'/'I'); c1 permite poner un enlace en el C1
  const confHexosa = (fis, an, c1) => ({ 1: c1 || anomerico(an), 2: cara(fis[0]), 3: cara(fis[1]), 4: cara(fis[2]), 5: { arriba: 'CH2OH', abajo: 'H' } });

  /* ---------- proyección de Fischer ----------
     filas de arriba abajo: 'CHO' | 'CO' (cetona) | 'CH2OH' | 'D' (OH a la derecha) | 'I' (OH a la izquierda) */
  function fischer(d, x, y, filas) {
    const cs = [], centros = [];
    filas.forEach((f, k) => {
      const yy = y + k * 1.25;
      let c;
      if (f === 'CHO') { c = d.a('C', x, yy); d.r(c, 180, 'H', { len: 0.85 }); d.r(c, 0, 'O', { ord: 2, len: 0.95 }); }
      else if (f === 'CO') { c = d.a('C', x, yy); d.r(c, 0, 'O', { ord: 2, len: 0.95 }); }
      else if (f === 'CH2OH') { c = d.a('C', x, yy, { h: 2 }); d.r(c, k === 0 ? -90 : 90, 'O', { h: 1, len: 0.95 }); }
      else {
        c = d.a('C', x, yy);
        const izq = sus(d, c, 180, f === 'I' ? 'OH' : 'H', 1, x), der = sus(d, c, 0, f === 'D' ? 'OH' : 'H', 1, x);
        centros.push({ k, c, izq, der });
      }
      if (cs.length) d.e(cs[cs.length - 1], c);
      cs.push(c);
    });
    centros.forEach(z => d.fischer.push({ c: z.c, arriba: cs[z.k - 1], abajo: cs[z.k + 1], izq: z.izq, der: z.der }));
    return cs;
  }

  /* ---------- ácidos grasos ----------
     acilo(): C del carbonilo en (x,y) con =O hacia arriba y la cadena recta hacia la derecha.
     cis = posición del doble enlace (9 en el oleico): se dibuja como un «escalón» con los
     dos H del mismo lado (cis).                                                          */
  function acilo(d, x, y, nC, cis) {
    const c1 = d.a('C', x, y);
    d.r(c1, -90, 'O', { ord: 2, len: 0.95 });
    let prev = c1, px = x;
    for (let k = 2; k <= nC; k++) {
      let c;
      if (cis && k === cis) {
        c = d.a('C', px + 0.5, y + 0.866); d.e(prev, c); d.r(c, 120, 'H', { len: 0.8 });
      } else if (cis && k === cis + 1) {
        c = d.a('C', px + 1, y + 0.866); d.e(prev, c, 2); d.r(c, 60, 'H', { len: 0.8 });
      } else if (cis && k === cis + 2) {
        c = d.a('C', px + 0.5, y, { h: k === nC ? 3 : 2 }); d.e(prev, c);
      } else {
        c = d.a('C', px + 1, y, { h: k === nC ? 3 : 2 }); d.e(prev, c);
      }
      px = d.at[c].x; prev = c;
    }
    if (cis) d.texto(x + cis - 0.5 + 0.75, y + 2.2, 'cis');
    return c1;
  }

  /* ---------- bases nitrogenadas ----------
     Coordenadas locales (anillo de 6 de lado 1, «punta arriba»), giradas 'ang' grados y
     colocadas de forma que el átomo 'ancla' quede en (ax, ay).                          */
  function colocar(local, ang, anclaLocal, ax, ay, espejo) {
    const c = Math.cos(ang * RAD), s = Math.sin(ang * RAD);
    const rot = ([x, y]) => { if (espejo) y = -y; return [x * c - y * s, x * s + y * c]; };
    const [rx, ry] = rot(anclaLocal);
    const out = {};
    for (const k in local) { const [x, y] = rot(local[k]); out[k] = [x + ax - rx, y + ay - ry]; }
    return out;
  }
  const PURINA = { C6: [0, -1], C5: [0.866, -0.5], C4: [0.866, 0.5], N3: [0, 1], C2: [-0.866, 0.5], N1: [-0.866, -0.5],
    N9: [1.817, 0.809], C8: [2.405, 0], N7: [1.817, -0.809] };
  const PIRIM = { C4: [0, -1], C5: [0.866, -0.5], C6: [0.866, 0.5], N1: [0, 1], C2: [-0.866, 0.5], N3: [-0.866, -0.5] };
  // dirección «hacia fuera» de cada átomo del anillo (en coordenadas locales)
  const FUERA_PUR = { C6: -90, C2: 150, N1: 210, N3: 90, C8: 0, N7: -72, N9: 72 };
  const FUERA_PIR = { C4: -90, C5: -30, C6: 30, N1: 90, C2: 150, N3: 210 };

  // tipo: 'A' | 'G'; sust: { N9: 'H' | 'stub' | idExistente, N7: 'H' }; hExpl: dibujar los H del NH2 por separado
  function purina(d, tipo, ang, ancla, pos, opt = {}) {
    const P = colocar(PURINA, ang, PURINA[ancla], pos[0], pos[1]);
    const id = {};
    for (const k of ['N1', 'C2', 'N3', 'C4', 'C5', 'C6', 'N7', 'C8', 'N9']) {
      if (k === 'N9' && typeof opt.N9 === 'number') { id.N9 = opt.N9; continue; }
      id[k] = d.a(k[0], P[k][0], P[k][1]);
    }
    const dobles = tipo === 'A' ? [['N1', 'C6'], ['C2', 'N3'], ['C4', 'C5'], ['N7', 'C8']] : [['C2', 'N3'], ['C4', 'C5'], ['C8', 'N9']];
    const enlaces = [['N1', 'C2'], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'C5'], ['C5', 'C6'], ['C6', 'N1'], ['C5', 'N7'], ['N7', 'C8'], ['C8', 'N9'], ['N9', 'C4']];
    enlaces.forEach(([a, b]) => d.e(id[a], id[b], dobles.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) ? 2 : 1, { agn: true }));
    const fuera = k => FUERA_PUR[k] + ang;
    d.r(id.C8, fuera('C8'), 'H', { len: 0.8 });
    if (tipo === 'A') {
      d.r(id.C2, fuera('C2'), 'H', { len: 0.8 });
      id.N6 = d.r(id.C6, fuera('C6'), 'N', { h: opt.hExpl ? 0 : 2 });
      if (opt.hExpl) { id.H6a = d.r(id.N6, fuera('C6') - 60, 'H', { len: 0.8 }); id.H6b = d.r(id.N6, fuera('C6') + 60, 'H', { len: 0.8 }); }
    } else {
      d.r(id.C6, fuera('C6'), 'O', { ord: 2 }); id.O6 = d.at.length - 1;
      id.N2 = d.r(id.C2, fuera('C2'), 'N', { h: opt.hExpl ? 0 : 2 });
      if (opt.hExpl) { id.H2a = d.r(id.N2, fuera('C2') - 60, 'H', { len: 0.8 }); id.H2b = d.r(id.N2, fuera('C2') + 60, 'H', { len: 0.8 }); }
      if (opt.N1H !== false) id.H1 = d.r(id.N1, fuera('N1'), 'H', { len: 0.8 });
    }
    if (opt.N7H) d.r(id.N7, fuera('N7'), 'H', { len: 0.8 });
    if (opt.N9 === 'H') d.r(id.N9, fuera('N9'), 'H', { len: 0.8 });
    if (opt.N9 === 'stub') id.C1 = d.r(id.N9, fuera('N9'), 'C');
    return id;
  }

  // tipo: 'C' | 'T' | 'U'; opt.N1: 'H' | 'stub'; opt.N3H: H en N3
  function pirimidina(d, tipo, ang, ancla, pos, opt = {}) {
    const P = colocar(PIRIM, ang, PIRIM[ancla], pos[0], pos[1], opt.espejo);
    const id = {};
    for (const k of ['N1', 'C2', 'N3', 'C4', 'C5', 'C6']) id[k] = d.a(k[0], P[k][0], P[k][1]);
    const dobles = tipo === 'C' ? (opt.N3H ? [['C4', 'C5'], ['C6', 'N1']] : [['N3', 'C4'], ['C5', 'C6']]) : [['C5', 'C6']];
    [['N1', 'C2'], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'C5'], ['C5', 'C6'], ['C6', 'N1']]
      .forEach(([a, b]) => d.e(id[a], id[b], dobles.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) ? 2 : 1, { agn: true }));
    const fuera = k => (opt.espejo ? -FUERA_PIR[k] : FUERA_PIR[k]) + ang;
    id.O2 = d.r(id.C2, fuera('C2'), 'O', { ord: 2 });
    d.r(id.C6, fuera('C6'), 'H', { len: 0.8 });
    if (tipo === 'C') {
      id.N4 = d.r(id.C4, fuera('C4'), 'N', { h: opt.hExpl ? 0 : 2 });
      if (opt.hExpl) { id.H4a = d.r(id.N4, fuera('C4') - 60, 'H', { len: 0.8 }); id.H4b = d.r(id.N4, fuera('C4') + 60, 'H', { len: 0.8 }); }
      d.r(id.C5, fuera('C5'), 'H', { len: 0.8 });
    } else {
      id.O4 = d.r(id.C4, fuera('C4'), 'O', { ord: 2 });
      if (tipo === 'T') d.r(id.C5, fuera('C5'), 'C', { h: 3 });
      else d.r(id.C5, fuera('C5'), 'H', { len: 0.8 });
    }
    if (opt.N3H) id.H3 = d.r(id.N3, fuera('N3'), 'H', { len: 0.8 });
    if (opt.N1 === 'H') d.r(id.N1, fuera('N1'), 'H', { len: 0.8 });
    if (opt.N1 === 'stub') id.C1 = d.r(id.N1, fuera('N1'), 'C');
    if (typeof opt.N1 === 'number') d.e(id.N1, opt.N1);
    return id;
  }

  /* =================================================================
     DIBUJOS DE CADA MOLÉCULA
     ================================================================= */
  const E = {};
  const nuevo = f => { const d = new Dib(); f(d); return d; };

  /* ---------------- AGUA ---------------- */
  E.agua = [nuevo(d => {
    const o = d.a('O', 0, 0);
    d.r(o, 37.75, 'H', { len: 1.1 }); d.r(o, 142.25, 'H', { len: 1.1 });
    d.texto(0, 1.55, '104,5°');
  })];
  E.agua_racimo = [nuevo(d => {
    // molécula central: dona sus dos H (abajo) y acepta dos (arriba)
    const o0 = d.a('O', 0, 0);
    const h1 = d.r(o0, 52, 'H'), h2 = d.r(o0, 128, 'H');
    const agua = (x, y, a1, a2) => { const o = d.a('O', x, y); return [o, d.r(o, a1, 'H'), d.r(o, a2, 'H')]; };
    const [oA] = agua(0 + 2.9 * Math.cos(52 * RAD), 2.9 * Math.sin(52 * RAD), 0, 105);
    const [oB] = agua(-2.9 * Math.cos(52 * RAD), 2.9 * Math.sin(52 * RAD), 180, 75);
    const [oC, hC] = agua(-2.9 * Math.cos(52 * RAD), -2.9 * Math.sin(52 * RAD), 52, 156.5);
    const [oD, hD] = agua(2.9 * Math.cos(52 * RAD), -2.9 * Math.sin(52 * RAD), 128, 23.5);
    d.puente(h1, oA); d.puente(h2, oB); d.puente(hC, o0); d.puente(hD, o0);
  })];

  /* ---------------- GLÚCIDOS ---------------- */
  const FIS = { glucosa: ['D', 'I', 'D', 'D'], manosa: ['I', 'I', 'D', 'D'], galactosa: ['D', 'I', 'I', 'D'] };
  const lineal = fis => nuevo(d => fischer(d, 0, 0, ['CHO', ...fis, 'CH2OH']));
  const piranosa = (fis, an) => nuevo(d => anillo(d, 0, 0, 'piranosa', confHexosa(fis, an)));
  const fructosaLineal = () => nuevo(d => fischer(d, 0, 0, ['CH2OH', 'CO', 'I', 'D', 'D', 'CH2OH']));
  const fructofuranosa = an => nuevo(d => anillo(d, 0, 0, 'furanosa', {
    1: an === 'β' ? { arriba: 'OH', abajo: 'CH2OH' } : { arriba: 'CH2OH', abajo: 'OH' },
    2: cara('I'), 3: cara('D'), 4: { arriba: 'CH2OH', abajo: 'H' },
  }));
  E.gliceraldehido = [nuevo(d => fischer(d, 0, 0, ['CHO', 'D', 'CH2OH']))];
  E.dihidroxiacetona = [nuevo(d => fischer(d, 0, 0, ['CH2OH', 'CO', 'CH2OH']))];
  E.glucosa_lineal = [lineal(FIS.glucosa)];
  E.alfa_glucosa = [piranosa(FIS.glucosa, 'α')];
  E.beta_glucosa = [piranosa(FIS.glucosa, 'β')];
  E.manosa_lineal = [lineal(FIS.manosa)];
  E.alfa_manosa = [piranosa(FIS.manosa, 'α')];
  E.beta_manosa = [piranosa(FIS.manosa, 'β')];
  E.galactosa_lineal = [lineal(FIS.galactosa)];
  E.alfa_galactosa = [piranosa(FIS.galactosa, 'α')];
  E.beta_galactosa = [piranosa(FIS.galactosa, 'β')];
  E.fructosa_lineal = [fructosaLineal()];
  E.fructosa = [fructofuranosa('β')];
  E.alfa_fructosa = [fructofuranosa('α')];
  E.ribosa = [nuevo(d => anillo(d, 0, 0, 'furanosa', { 1: anomerico('β'), 2: cara('D'), 3: cara('D'), 4: { arriba: 'CH2OH', abajo: 'H' } }))];
  E.desoxirribosa = [nuevo(d => anillo(d, 0, 0, 'furanosa', { 1: anomerico('β'), 2: cara('H'), 3: cara('D'), 4: { arriba: 'CH2OH', abajo: 'H' } }))];
  // ciclación: abierta (Fischer) o cerrada (Haworth), según el fotograma
  E.cicl_glucosa_a = [lineal(FIS.glucosa), piranosa(FIS.glucosa, 'α')];
  E.cicl_glucosa_b = [lineal(FIS.glucosa), piranosa(FIS.glucosa, 'β')];
  E.cicl_fructosa_a = [fructosaLineal(), fructofuranosa('α')];
  E.cicl_fructosa_b = [fructosaLineal(), fructofuranosa('β')];

  /* --- disacáridos: dos anillos unidos por el O del enlace glucosídico --- */
  // α(1→4): O abajo-derecha del C1; el C4 del 2.º anillo, arriba-derecha del O
  function disacarido14(d, fisA, anA, fisB, anB, x0 = 0, y0 = 0, finA, finB) {
    const beta = anA === 'β';
    const A = anillo(d, x0, y0, 'piranosa', confHexosa(fisA, anA, beta ? { arriba: { t: 'O*', ang: -60 }, abajo: 'H' } : { arriba: 'H', abajo: { t: 'O*', ang: 60 } }));
    const o = beta ? A['1a'] : A['1b'];
    const [ox, oy] = [d.at[o].x, d.at[o].y];
    const c4x = ox + 0.95 * 0.5, c4y = oy + (beta ? 0.95 * 0.866 : -0.95 * 0.866);
    const conf = confHexosa(fisB, anB);
    conf[4] = { arriba: 'H', abajo: { t: 'link', id: o } };
    if (finB) conf[1] = finB;
    const B = anillo(d, c4x + 1.3, c4y, 'piranosa', conf, { invertida: beta });
    if (finA) finA(A);
    return { A, B, o };
  }
  E.maltosa = [nuevo(d => disacarido14(d, FIS.glucosa, 'α', FIS.glucosa, 'α'))];
  E.lactosa = [nuevo(d => disacarido14(d, FIS.galactosa, 'β', FIS.glucosa, 'β'))];
  E.celobiosa = [nuevo(d => disacarido14(d, FIS.glucosa, 'β', FIS.glucosa, 'β'))];
  E.sacarosa = [nuevo(d => {
    const A = anillo(d, 0, 0, 'piranosa', confHexosa(FIS.glucosa, 'α', { arriba: 'H', abajo: { t: 'O*', ang: 60 } }));
    const o = A['1b'];
    const c2 = [d.at[o].x + 0.6, d.at[o].y + 1.35];
    // β-fructofuranosa girada: el C2 (anomérico) a la izquierda, con el O del enlace arriba
    anillo(d, c2[0] + 1.0, c2[1] + 0.33, 'furanosa', {
      1: { arriba: { t: 'link', id: o }, abajo: 'CH2OH' }, 2: cara('I'), 3: cara('D'), 4: { arriba: 'CH2OH', abajo: 'H' },
    }, { girada: true });
  })];

  /* --- polisacáridos: fragmento de 3 unidades (los «···» indican que la cadena sigue) --- */
  function cadenaAlfa(d, x0, y0) {
    let previo = null;
    for (let k = 0; k < 3; k++) {
      const conf = confHexosa(FIS.glucosa, 'α', { arriba: 'H', abajo: { t: 'O*', ang: 60 } });
      conf[4] = previo === null ? { arriba: 'H', abajo: { t: 'O*', ang: 120 } } : { arriba: 'H', abajo: { t: 'link', id: previo } };
      const R = anillo(d, x0 + k * 3.55, y0, 'piranosa', conf);
      if (k === 0) d.r(R['4b'], -120, '*', { len: 0.95 });
      previo = R['1b'];
      if (k === 2) d.r(previo, -60, '*', { len: 0.95 });
    }
  }
  function cadenaBeta(d, x0, y0) {
    let previo = null;
    for (let k = 0; k < 3; k++) {
      const inv = k % 2 === 1;
      const conf = confHexosa(FIS.glucosa, 'β', { arriba: { t: 'O*', ang: inv ? 60 : -60 }, abajo: 'H' });
      conf[4] = previo === null ? { arriba: 'H', abajo: { t: 'O*', ang: 120 } } : { arriba: 'H', abajo: { t: 'link', id: previo } };
      const R = anillo(d, x0 + k * 3.55, y0, 'piranosa', conf, { invertida: inv });
      if (k === 0) d.r(R['4b'], 180, '*', { len: 0.95 });
      previo = R['1a'];
      if (k === 2) d.r(previo, 0, '*', { len: 0.95 });
    }
  }
  E.amilosa = [nuevo(d => cadenaAlfa(d, 0, 0))];
  E.celulosa_cadena = [nuevo(d => cadenaBeta(d, 0, 0))];
  E.celulosa = [nuevo(d => cadenaBeta(d, 0, 0))];
  E.almidon_vs_celulosa = [nuevo(d => {
    cadenaAlfa(d, 0, 0); d.texto(3.55, -2.9, 'Almidón (amilosa): α(1→4)');
    cadenaBeta(d, 0, 7); d.texto(3.55, 4.4, 'Celulosa: β(1→4), anillos alternados');
  })];
  E.amilopectina = [nuevo(d => {
    // M: glucosa del punto de ramificación; N: siguiente de la cadena principal; R: rama α(1→6)
    const confM = confHexosa(FIS.glucosa, 'α', { arriba: 'H', abajo: { t: 'O*', ang: 60 } });
    confM[4] = { arriba: 'H', abajo: { t: 'O*', ang: 120 } };
    confM[5] = { arriba: 'CH2*', abajo: 'H' };
    const M = anillo(d, 0, 0, 'piranosa', confM);
    d.r(M['4b'], -120, '*', { len: 0.95 });
    const confN = confHexosa(FIS.glucosa, 'α', { arriba: 'H', abajo: { t: 'O*', ang: 60 } });
    confN[4] = { arriba: 'H', abajo: { t: 'link', id: M['1b'] } };
    const N = anillo(d, 0.475 + 0.475 + 1.3 + 1.3, 0, 'piranosa', confN);
    d.r(N['1b'], -60, '*', { len: 0.95 });
    const o6 = d.r(M['5a'], -90, 'O', { len: 1 });
    const c1r = [d.at[o6].x - 0.475, d.at[o6].y - 0.823];
    const confR = confHexosa(FIS.glucosa, 'α', { arriba: 'H', abajo: { t: 'link', id: o6 } });
    confR[4] = { arriba: 'H', abajo: { t: 'O*', ang: 120 } };
    const R = anillo(d, c1r[0] - 1.3, c1r[1], 'piranosa', confR);
    d.r(R['4b'], -150, '*', { len: 0.95 });
    d.texto(-1.6, -6.3, 'rama: enlace α(1→6)');
  })];

  /* ---------------- LÍPIDOS ---------------- */
  const acidoLibre = (d, y, nC, cis) => { const c1 = acilo(d, 0, y, nC, cis); d.r(c1, 180, 'O', { h: 1, len: 0.95 }); return c1; };
  E.estearico = [nuevo(d => acidoLibre(d, 0, 18))];
  E.oleico = [nuevo(d => acidoLibre(d, 0, 18, 9))];
  E.acidos_grasos_comparar = [nuevo(d => {
    acidoLibre(d, 0, 18); d.texto(8.5, -1.9, 'Ácido esteárico (saturado)');
    acidoLibre(d, 4.5, 18, 9); d.texto(8.5, 2.6, 'Ácido oleico (insaturado, cis)');
  })];
  // glicerol vertical a la izquierda; cada –O– y su ácido graso hacia la derecha
  function glicerol(d, cadenas) {
    const g = [d.a('C', 0, 0, { h: 2 }), d.a('C', 0, 3, { h: 1 }), d.a('C', 0, 6, { h: 2 })];
    d.e(g[0], g[1]); d.e(g[1], g[2]);
    cadenas.forEach((c, k) => {
      if (!c) return;
      const o = d.r(g[k], 0, 'O');
      const c1 = acilo(d, 2, k * 3, c.n, c.cis);
      d.e(o, c1);
    });
    return g;
  }
  E.trigliceridos = [nuevo(d => {
    glicerol(d, [{ n: 16 }, { n: 18, cis: 9 }, { n: 18 }]);
    d.texto(-0.2, -1.9, 'glicerol');
  })];
  E.fosfolipido = [nuevo(d => {
    const g = glicerol(d, [{ n: 16 }, { n: 18, cis: 9 }, null]);
    // cabeza polar: –O–P(=O)(O⁻)–O–CH₂–CH₂–N⁺(CH₃)₃ hacia la izquierda
    const o3 = d.r(g[2], 180, 'O');
    const p = d.r(o3, 180, 'P');
    d.r(p, -90, 'O', { ord: 2, len: 0.95 }); d.r(p, 90, 'O', { carga: '−', len: 0.95 });
    const o = d.r(p, 180, 'O'), ca = d.r(o, 180, 'C', { h: 2 }), cb = d.r(ca, 180, 'C', { h: 2 });
    const n = d.r(cb, 180, 'N', { carga: '+' });
    d.r(n, -90, 'C', { h: 3 }); d.r(n, 90, 'C', { h: 3 }); d.r(n, 180, 'C', { h: 3 });
    d.texto(-5, -2.1, 'cabeza polar');
    d.texto(9, -2.1, 'colas apolares');
  })];
  E.colesterol = [nuevo(d => {
    // núcleo esteroide (ciclopentanoperhidrofenantreno), numeración clásica
    const P = {
      1: [0, -1], 2: [-0.866, -0.5], 3: [-0.866, 0.5], 4: [0, 1], 5: [0.866, 0.5], 10: [0.866, -0.5],
      6: [1.732, 1], 7: [2.598, 0.5], 8: [2.598, -0.5], 9: [1.732, -1],
      11: [1.732, -2], 12: [2.598, -2.5], 13: [3.464, -2], 14: [3.464, -1],
      15: [4.415, -0.691], 16: [5.003, -1.5], 17: [4.415, -2.309],
      18: [3.464, -3], 19: [0.866, -1.5],
      20: [5.281, -2.809], 21: [5.281, -3.809], 22: [6.147, -2.309], 23: [7.013, -2.809], 24: [7.879, -2.309], 25: [8.745, -2.809],
      26: [8.745, -3.809], 27: [9.611, -2.309],
    };
    const H = { 1: 2, 2: 2, 3: 1, 4: 2, 5: 0, 6: 1, 7: 2, 8: 1, 9: 1, 10: 0, 11: 2, 12: 2, 13: 0, 14: 1, 15: 2, 16: 2, 17: 1,
      18: 3, 19: 3, 20: 1, 21: 3, 22: 2, 23: 2, 24: 2, 25: 1, 26: 3, 27: 3 };
    const c = {};
    for (const k in P) c[k] = d.a('C', P[k][0] * 1.15, P[k][1] * 1.15, { h: H[k] });
    [[1, 2], [2, 3], [3, 4], [4, 5], [5, 10], [10, 1], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [9, 11], [11, 12], [12, 13], [13, 14],
      [14, 8], [14, 15], [15, 16], [16, 17], [17, 13], [13, 18], [10, 19], [17, 20], [20, 21], [20, 22], [22, 23], [23, 24], [24, 25], [25, 26], [25, 27]]
      .forEach(([a, b]) => d.e(c[a], c[b], a === 5 && b === 6 ? 2 : 1));
    d.r(c[3], 150, 'O', { h: 1 });
  })];

  /* ---------------- AMINOÁCIDOS Y PÉPTIDOS ---------------- */
  // H₂N–Cα–COOH en horizontal, H arriba y radical R abajo
  function aminoacido(d, R) {
    const ca = d.a('C', 0, 0);
    d.r(ca, 180, 'N', { h: 2 }); d.r(ca, -90, 'H', { len: 0.85 });
    const c = d.r(ca, 0, 'C');
    d.r(c, -90, 'O', { ord: 2, len: 0.95 }); d.r(c, 0, 'O', { h: 1, len: 0.95 });
    R(ca);
  }
  const cadenaR = (d, desde, n) => { let p = desde; for (let k = 0; k < n; k++) p = d.r(p, 90, 'C', { h: 2 }); return p; };
  E.glicina = [nuevo(d => aminoacido(d, ca => d.r(ca, 90, 'H', { len: 0.85 })))];
  E.alanina = [nuevo(d => aminoacido(d, ca => d.r(ca, 90, 'C', { h: 3 })))];
  E.serina = [nuevo(d => aminoacido(d, ca => d.r(cadenaR(d, ca, 1), 90, 'O', { h: 1 })))];
  E.cisteina = [nuevo(d => aminoacido(d, ca => d.r(cadenaR(d, ca, 1), 90, 'S', { h: 1 })))];
  E.lisina = [nuevo(d => aminoacido(d, ca => d.r(cadenaR(d, ca, 4), 90, 'N', { h: 2 })))];
  E.aspartico = [nuevo(d => aminoacido(d, ca => {
    const cg = d.r(cadenaR(d, ca, 1), 90, 'C');
    d.r(cg, 0, 'O', { ord: 2, len: 0.95 }); d.r(cg, 90, 'O', { h: 1, len: 0.95 });
  }))];
  E.fenilalanina = [nuevo(d => aminoacido(d, ca => {
    const cb = cadenaR(d, ca, 1);
    const ip = d.r(cb, 90, 'C');
    const [x, y] = [d.at[ip].x, d.at[ip].y + 1];
    const v = [[0.866, -0.5], [0.866, 0.5], [0, 1], [-0.866, 0.5], [-0.866, -0.5]].map(([a, b]) => d.a('C', x + a, y + b, { h: 1 }));
    const ciclo = [ip, ...v];
    ciclo.forEach((a, k) => d.e(a, ciclo[(k + 1) % 6], k % 2 === 0 ? 2 : 1, { agn: true }));
  }))];
  E.gly_ala = [nuevo(d => {
    const n1 = d.a('N', 0, 0, { h: 2 });
    const ca1 = d.r(n1, 0, 'C'); d.r(ca1, -90, 'H', { len: 0.85 }); d.r(ca1, 90, 'H', { len: 0.85 });
    const c1 = d.r(ca1, 0, 'C'); d.r(c1, -90, 'O', { ord: 2, len: 0.95 });
    const n2 = d.r(c1, 0, 'N'); d.r(n2, 90, 'H', { len: 0.85 });
    const ca2 = d.r(n2, 0, 'C'); d.r(ca2, -90, 'H', { len: 0.85 }); d.r(ca2, 90, 'C', { h: 3 });
    const c2 = d.r(ca2, 0, 'C'); d.r(c2, -90, 'O', { ord: 2, len: 0.95 }); d.r(c2, 0, 'O', { h: 1, len: 0.95 });
    d.texto(0.5, 2, 'Glicina'); d.texto(4.5, 2, 'Alanina');
  })];

  /* ---------------- NUCLEÓTIDOS Y BASES ---------------- */
  function nucleotido(d, desoxi, nFosfatos) {
    // pentosa (furanosa) centrada en el origen; la base sale del C1′ hacia arriba-derecha
    const c1 = [PEN[1][0], PEN[1][1]];
    const n9pos = [c1[0] + 0.5, c1[1] - 0.866];
    const base = purina(d, 'A', 126, 'N9', n9pos, {});
    const S = anillo(d, 0, 0, 'furanosa', {
      1: { arriba: { t: 'link', id: base.N9 }, abajo: 'H' }, 2: desoxi ? cara('H') : cara('D'), 3: cara('D'), 4: { arriba: 'CH2*', abajo: 'H' },
    });
    // fosfato(s) unidos al O del C5′
    let o = d.r(S['4a'], 180, 'O');
    for (let k = 0; k < nFosfatos; k++) {
      const p = d.r(o, 180, 'P');
      d.r(p, -90, 'O', { ord: 2, len: 0.95 }); d.r(p, 90, 'O', { h: 1, len: 0.95 });
      o = d.r(p, 180, 'O', k === nFosfatos - 1 ? { h: 1 } : {});
    }
    d.texto(2.2, -4.3, 'base (adenina)');
    d.texto(0, 2.4, desoxi ? 'desoxirribosa' : 'ribosa');
    d.texto(-1.8 - nFosfatos, 2.4, nFosfatos > 1 ? `${nFosfatos} fosfatos` : 'fosfato');
  }
  E.damp = [nuevo(d => nucleotido(d, true, 1))];
  E.amp = [nuevo(d => nucleotido(d, false, 1))];
  E.atp = [nuevo(d => nucleotido(d, false, 3))];
  // PubChem (CID 190) da el tautómero 7H-adenina: el H está en el N7
  E.adenina = [nuevo(d => purina(d, 'A', 0, 'C4', [0.866, 0.5], { N7H: true }))];
  E.guanina = [nuevo(d => purina(d, 'G', 0, 'C4', [0.866, 0.5], { N7H: true }))];
  E.citosina = [nuevo(d => pirimidina(d, 'C', 0, 'N1', [0, 1], { N3H: true }))];
  E.timina = [nuevo(d => pirimidina(d, 'T', 0, 'N1', [0, 1], { N1: 'H', N3H: true }))];
  E.uracilo = [nuevo(d => pirimidina(d, 'U', 0, 'N1', [0, 1], { N1: 'H', N3H: true }))];
  // pares de bases: la púrica a la izquierda con su borde Watson-Crick hacia la derecha
  function par(d, purTipo, pirTipo) {
    // púrica girada 150º: N1 mirando a la derecha; pirimidínica en espejo y girada 30º: N3 mirando a la izquierda
    const A = purina(d, purTipo, 150, 'C4', [0, 0], { N9: 'stub', hExpl: true });
    const nA = A.N1, pA = [d.at[nA].x, d.at[nA].y];
    const B = pirimidina(d, pirTipo, 30, 'N3', [pA[0] + 2.9, pA[1]], { N1: 'stub', N3H: pirTipo !== 'C', hExpl: true, espejo: true });
    if (purTipo === 'A') {
      d.puente(A.H6a, B.O4); d.puente(B.H3, A.N1);
    } else {
      d.puente(B.H4b, A.O6); d.puente(A.H1, B.N3); d.puente(A.H2b, B.O2);
    }
  }
  E.par_AT = [nuevo(d => par(d, 'A', 'T'))];
  E.par_AU = [nuevo(d => par(d, 'A', 'U'))];
  E.par_GC = [nuevo(d => par(d, 'G', 'C'))];

  return E;
})();
