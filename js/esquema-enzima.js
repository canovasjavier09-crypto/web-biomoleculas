/* =====================================================================
   esquema-enzima.js — Esquema interactivo de la acción enzimática:
   E + S → ES → EP → E + P, con los modelos llave-cerradura y ajuste inducido.
   Al pulsar una parte del dibujo se llama a window.mostrarDetalleExterno().
   ===================================================================== */
const EsquemaEnzima = (() => {
  const PASOS = [
    { t: '1. Enzima y sustrato separados', d: 'La enzima (E) tiene una pequeña hendidura, el <b>centro activo</b>. El sustrato (S) es la molécula que va a transformar.' },
    { t: '2. Complejo enzima-sustrato (ES)', d: 'El sustrato se une al centro activo mediante <b>enlaces débiles</b> (puentes de H, interacciones iónicas e hidrofóbicas). Esta unión es muy <b>específica</b>.' },
    { t: '3. Catálisis: complejo enzima-producto (EP)', d: 'Los aminoácidos catalíticos debilitan y rompen (o forman) enlaces del sustrato. La enzima <b>disminuye la energía de activación</b> y la reacción ocurre mucho más deprisa.' },
    { t: '4. Liberación de los productos (E + P)', d: 'Los productos (P) se separan. La enzima queda <b>intacta</b> y lista para actuar de nuevo: no se consume en la reacción.' },
  ];
  // puntos variables del borde del centro activo
  const ENCAJE = [[270, 211], [292, 175], [296, 175], [296, 211], [334, 211]];
  const ABIERTO = [[270, 188], [292, 181], [296, 181], [296, 188], [334, 188]];
  const DETALLES = {
    enzima: { titulo: 'Enzima', texto: 'Proteína (salvo las ribozimas) que actúa como <b>biocatalizador</b>. Es específica: cada enzima actúa sobre un sustrato o un tipo de sustratos. Se nombran con la terminación <i>-asa</i>.' },
    centro: { titulo: 'Centro activo', texto: 'Región pequeña de la enzima, formada por pocos aminoácidos (de <b>unión</b> y <b>catalíticos</b>), donde se une el sustrato. Su forma depende de la estructura terciaria: si la enzima se desnaturaliza, el centro activo se pierde.' },
    sustrato: { titulo: 'Sustrato (S)', texto: 'Molécula sobre la que actúa la enzima. Se une al centro activo por enlaces débiles. En este dibujo, el enlace rojo es el que se va a romper (p. ej. una hidrólisis).' },
    complejo: { titulo: 'Complejo enzima-sustrato (ES)', texto: 'Asociación temporal de la enzima y el sustrato. En él la enzima orienta y tensiona el sustrato y así disminuye la energía de activación.' },
    producto: { titulo: 'Productos (P)', texto: 'Moléculas resultantes de la reacción. Se liberan del centro activo y la enzima queda libre e inalterada.' },
  };

  let svg, estado = { paso: 0, modelo: 'llave', puntos: ENCAJE.map(p => p.slice()), anim: null, auto: null };

  const rutaEnzima = pts => {
    const [p1, p2, p3, p4, p5] = pts;
    return `M160,175 L248,175 L${p1} L${p2} L${p3} L${p4} L${p5} L334,175 L440,175 Q460,175 460,195 L460,300 Q460,330 430,330 L170,330 Q140,330 140,300 L140,195 Q140,175 160,175 Z`;
  };

  function interpolar(desde, hasta, ms, alPaso, fin) {
    const t0 = performance.now();
    cancelAnimationFrame(estado.anim);
    const tick = t => {
      const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      alPaso(desde.map((v, i) => Array.isArray(v) ? v.map((w, j) => w + (hasta[i][j] - w) * e) : v + (hasta[i] - v) * e));
      if (k < 1) estado.anim = requestAnimationFrame(tick); else if (fin) fin();
    };
    estado.anim = requestAnimationFrame(tick);
  }

  function montar(contenedor) {
    contenedor.innerHTML = `
      <div class="esq">
        <div class="esq-controles">
          <div class="grupo-barra" role="group" aria-label="Modelo">
            <span class="etq">Modelo</span>
            <button class="chip activo" data-modelo="llave">Llave-cerradura</button>
            <button class="chip" data-modelo="inducido">Ajuste inducido</button>
          </div>
          <div class="grupo-barra">
            <button class="chip" data-acc="ant">◀ Anterior</button>
            <button class="chip destacado" data-acc="sig">Siguiente ▶</button>
            <button class="chip" data-acc="auto">▶ Reproducir</button>
            <button class="chip" data-acc="reset">⟲ Reiniciar</button>
          </div>
        </div>
        <svg viewBox="0 0 600 360" class="esq-svg" role="img" aria-label="Esquema de una enzima y su sustrato">
          <defs>
            <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa7f0"/><stop offset="1" stop-color="#3f73cc"/></linearGradient>
          </defs>
          <path id="esqEnzima" class="pulsable" data-det="enzima" fill="url(#gE)" stroke="#2c5aa8" stroke-width="2"/>
          <path id="esqCentro" class="pulsable" data-det="centro" fill="none" stroke="#ffd43b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
          <text x="300" y="285" text-anchor="middle" class="esq-etq-e">ENZIMA</text>
          <g id="esqS" class="pulsable" data-det="sustrato">
            <g id="esqA"><polygon points="250,169 290,169 270,209" fill="#f59f00" stroke="#a86500" stroke-width="2"/></g>
            <line id="esqEnlace" x1="281" y1="180" x2="299" y2="180" stroke="#e03131" stroke-width="5" stroke-linecap="round"/>
            <g id="esqB"><rect x="298" y="169" width="34" height="40" rx="3" fill="#f59f00" stroke="#a86500" stroke-width="2"/></g>
          </g>
          <text id="esqEtqS" x="300" y="40" text-anchor="middle" class="esq-etq"></text>
          <g id="esqDestello" opacity="0"><circle cx="291" cy="181" r="18" fill="none" stroke="#e03131" stroke-width="3" stroke-dasharray="4 4"/></g>
        </svg>
        <div class="esq-texto"><h3 id="esqTitulo"></h3><p id="esqDesc"></p><p class="esq-modelo" id="esqModelo"></p></div>
        <h4 class="esq-h4">Energía de activación con y sin enzima</h4>
        <svg viewBox="0 0 600 210" class="esq-energia" role="img" aria-label="Diagrama de energía: la enzima disminuye la energía de activación">
          <line x1="50" y1="185" x2="580" y2="185" stroke="currentColor" stroke-width="1.5"/>
          <line x1="50" y1="185" x2="50" y2="10" stroke="currentColor" stroke-width="1.5"/>
          <text x="58" y="20" class="esq-eje">Energía</text>
          <text x="575" y="203" text-anchor="end" class="esq-eje">Progreso de la reacción →</text>
          <path d="M60,120 C150,120 180,25 270,25 C360,25 390,160 560,160" fill="none" stroke="#868e96" stroke-width="3" stroke-dasharray="7 5"/>
          <path d="M60,120 C150,120 190,80 270,80 C350,80 390,160 560,160" fill="none" stroke="#2f6fdd" stroke-width="3.5"/>
          <line x1="110" y1="120" x2="110" y2="27" stroke="#868e96" stroke-width="1.5"/>
          <line x1="130" y1="120" x2="130" y2="82" stroke="#2f6fdd" stroke-width="1.5"/>
          <text x="275" y="18" class="esq-eje" text-anchor="middle">sin enzima</text>
          <text x="275" y="72" class="esq-eje" fill="#2f6fdd" text-anchor="middle">con enzima</text>
          <text x="104" y="75" class="esq-eje" text-anchor="end">Ea</text>
          <text x="137" y="105" class="esq-eje" fill="#2f6fdd">Ea′</text>
          <text x="62" y="138" class="esq-eje">Sustrato</text>
          <text x="555" y="178" class="esq-eje" text-anchor="end">Productos</text>
        </svg>
      </div>`;
    svg = contenedor.querySelector('.esq-svg');
    contenedor.querySelectorAll('[data-modelo]').forEach(b => b.onclick = () => {
      estado.modelo = b.dataset.modelo;
      contenedor.querySelectorAll('[data-modelo]').forEach(x => x.classList.toggle('activo', x === b));
      irA(0, true);
    });
    contenedor.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => {
      const a = b.dataset.acc;
      if (a !== 'auto') pararAuto();
      if (a === 'sig') irA((estado.paso + 1) % PASOS.length);
      if (a === 'ant') irA((estado.paso + PASOS.length - 1) % PASOS.length);
      if (a === 'reset') irA(0, true);
      if (a === 'auto') {
        if (estado.auto) return pararAuto();
        b.textContent = '⏸ Pausa'; irA(0, true);
        estado.auto = setInterval(() => irA((estado.paso + 1) % PASOS.length), 2600);
      }
    });
    svg.querySelectorAll('.pulsable').forEach(el => el.addEventListener('click', ev => {
      ev.stopPropagation();
      let k = el.dataset.det;
      if (k === 'sustrato') k = estado.paso === 1 ? 'complejo' : estado.paso >= 2 ? 'producto' : 'sustrato';
      if (k === 'enzima' && estado.paso === 1) k = 'complejo';
      if (window.mostrarDetalleExterno) window.mostrarDetalleExterno(DETALLES[k]);
    }));
    irA(0, true);
  }

  function pararAuto() {
    clearInterval(estado.auto); estado.auto = null;
    const b = svg && svg.closest('.esq').querySelector('[data-acc="auto"]');
    if (b) b.textContent = '▶ Reproducir';
  }

  function pintarCentro(pts) {
    estado.puntos = pts;
    svg.querySelector('#esqEnzima').setAttribute('d', rutaEnzima(pts));
    svg.querySelector('#esqCentro').setAttribute('d', `M248,175 L${pts.join(' L')} L334,175`);
  }

  // posiciones (desplazamientos) de las piezas del sustrato en cada paso
  const POS = [
    { A: [-170, -110], B: [-170, -110] },
    { A: [0, 0], B: [0, 0] },
    { A: [-4, -4], B: [6, -4] },
    { A: [-175, -115], B: [165, -115] },
  ];

  function irA(paso, inmediato) {
    const anterior = estado.paso;
    estado.paso = paso;
    const A = svg.querySelector('#esqA'), B = svg.querySelector('#esqB'), enlace = svg.querySelector('#esqEnlace');
    const desde = inmediato ? POS[paso] : POS[anterior];
    const leer = g => (g.getAttribute('transform') || 'translate(0,0)').match(/-?[\d.]+/g).map(Number);
    const ini = inmediato ? [POS[paso].A, POS[paso].B] : [leer(A), leer(B)];
    const fin = [POS[paso].A, POS[paso].B];
    const centroFinal = (estado.modelo === 'inducido' && (paso === 0 || paso === 3)) ? ABIERTO : ENCAJE;
    const centroIni = inmediato ? centroFinal : estado.puntos;
    const ms = inmediato ? 1 : 900;
    interpolar([...ini, ...centroIni], [...fin, ...centroFinal], ms, v => {
      A.setAttribute('transform', `translate(${v[0][0]},${v[0][1]})`);
      B.setAttribute('transform', `translate(${v[1][0]},${v[1][1]})`);
      // la línea de enlace sigue a las piezas
      enlace.setAttribute('transform', `translate(${(v[0][0] + v[1][0]) / 2},${(v[0][1] + v[1][1]) / 2})`);
      pintarCentro(v.slice(2));
    });
    const roto = paso >= 2;
    enlace.style.transition = 'opacity .5s';
    enlace.style.opacity = roto ? 0 : 1;
    svg.querySelectorAll('#esqS polygon, #esqS rect').forEach(p => { p.setAttribute('fill', roto ? '#51cf66' : '#f59f00'); p.setAttribute('stroke', roto ? '#2b8a3e' : '#a86500'); });
    const dest = svg.querySelector('#esqDestello');
    dest.style.transition = 'opacity .4s'; dest.style.opacity = paso === 2 ? 1 : 0;
    svg.querySelector('#esqEtqS').textContent = ['Sustrato (S)', 'Complejo ES', 'Complejo EP: se rompe el enlace', 'Productos (P1 + P2)'][paso];
    const raiz = svg.closest('.esq');
    raiz.querySelector('#esqTitulo').textContent = PASOS[paso].t;
    raiz.querySelector('#esqDesc').innerHTML = PASOS[paso].d;
    raiz.querySelector('#esqModelo').innerHTML = estado.modelo === 'llave'
      ? '<b>Llave-cerradura</b> (Fischer, 1894): el centro activo es rígido y tiene ya la forma exacta del sustrato.'
      : '<b>Ajuste inducido</b> (Koshland, 1958): el centro activo es flexible y <b>cambia de forma</b> al unirse el sustrato, ajustándose a él. Es el modelo aceptado hoy.';
  }

  function desmontar() { pararAuto(); cancelAnimationFrame(estado.anim); }

  return { montar, desmontar };
})();
