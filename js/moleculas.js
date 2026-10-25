/* =====================================================================
   moleculas.js — CONTENIDOS de la web (todo lo que hay que editar para
   añadir o cambiar moléculas). No contiene coordenadas: las estructuras
   están en la carpeta /estructuras (un archivo .js por estructura).

   CÓMO AÑADIR UNA MOLÉCULA NUEVA
   1. Descarga su SDF 3D de PubChem (o un PDB de RCSB).
   2. Conviértelo a estructuras/<clave>.js con el formato:
        window.registrarEstructura('clave', {formato:'sdf', datos:`...`});
      (o ejecuta herramientas/construir_modelos.py tras añadirla allí).
   3. Añade una entrada al array MOLECULAS con los campos de abajo.
   Los grupos funcionales y enlaces se detectan automáticamente.
   ===================================================================== */

/* ---------- Bloques del menú ---------- */
const BLOQUES = [
  { id: 'agua',     nombre: 'Agua',               icono: '💧' },
  { id: 'glucidos', nombre: 'Glúcidos',           icono: '🍬' },
  { id: 'lipidos',  nombre: 'Lípidos',            icono: '🫧' },
  { id: 'proteinas',nombre: 'Proteínas',          icono: '🧬' },
  { id: 'enzimas',  nombre: 'Enzimas',            icono: '⚙️' },
  { id: 'nucleicos',nombre: 'Ácidos nucleicos',   icono: '🧪' },
];

/* ---------- Catálogo de grupos funcionales y enlaces ----------
   tipo: 'grupo' | 'enlace'.  color: color del resaltado.
   Para enlaces: une, formacion, rotura (se muestran al pulsar). */
const CATALOGO = {
  /* --- Grupos funcionales --- */
  hidroxilo:   { tipo: 'grupo', nombre: 'Grupo hidroxilo (–OH)', color: '#e8590c',
    texto: 'Grupo polar formado por un O unido a un H. Forma puentes de hidrógeno con el agua: por eso los glúcidos son solubles. En un alcohol el –OH está unido a un carbono saturado.' },
  carbonilo:   { tipo: 'grupo', nombre: 'Grupo carbonilo (C=O)', color: '#d6336c',
    texto: 'Carbono unido a un oxígeno por un doble enlace. Si está en el extremo de la cadena es un <b>aldehído</b> (–CHO, aldosas); si está en medio es una <b>cetona</b> (C=O, cetosas).' },
  carboxilo:   { tipo: 'grupo', nombre: 'Grupo carboxilo (–COOH)', color: '#c2255c',
    texto: 'Grupo ácido: puede ceder un H⁺ y quedar como –COO⁻. Lo tienen los ácidos grasos y los aminoácidos. Reacciona con un –OH (enlace éster) o con un –NH₂ (enlace peptídico).' },
  amino:       { tipo: 'grupo', nombre: 'Grupo amino (–NH₂)', color: '#1971c2',
    texto: 'Grupo básico: puede aceptar un H⁺ y quedar como –NH₃⁺. En los aminoácidos está unido al carbono α. Junto con el carboxilo da a los aminoácidos su carácter <b>anfótero</b>.' },
  fosfato:     { tipo: 'grupo', nombre: 'Grupo fosfato (–PO₄)', color: '#f08c00',
    texto: 'Derivado del ácido fosfórico (H₃PO₄). Con carga negativa a pH fisiológico: aporta polaridad (cabeza de los fosfolípidos) y carácter ácido a los ácidos nucleicos.' },
  radical:     { tipo: 'grupo', nombre: 'Radical R (cadena lateral)', color: '#9c36b5',
    texto: 'Es la parte que <b>diferencia</b> a los 20 aminoácidos proteicos. Según el radical, el aminoácido es apolar, polar sin carga, ácido (–) o básico (+). En la glicina el radical es solo un H.' },
  cola_apolar: { tipo: 'grupo', nombre: 'Colas apolares (hidrófobas)', color: '#fab005',
    texto: 'Cadenas hidrocarbonadas de los ácidos grasos. Sólo tienen C y H, no forman puentes de hidrógeno con el agua y tienden a agruparse entre sí (efecto hidrofóbico).' },
  cabeza_polar:{ tipo: 'grupo', nombre: 'Cabeza polar (hidrófila)', color: '#4dabf7',
    texto: 'Parte de la molécula con grupos polares o con carga que interacciona con el agua. Una molécula con cabeza polar y colas apolares es <b>anfipática</b>.' },
  doble_cc:    { tipo: 'grupo', nombre: 'Doble enlace C=C (insaturación)', color: '#e64980',
    texto: 'Un doble enlace entre carbonos impide el giro. En los ácidos grasos naturales suele ser <b>cis</b> y produce un “codo” en la cadena, que dificulta el empaquetamiento y baja el punto de fusión.' },

  /* --- Enlaces --- */
  covalente:   { tipo: 'enlace', nombre: 'Enlace covalente polar (O–H, N–H)', color: '#ff6b6b',
    une: 'Dos átomos que comparten un par de electrones. Si uno es mucho más electronegativo (O, N) atrae los electrones y aparecen cargas parciales δ⁻ y δ⁺.',
    formacion: 'Compartición de electrones entre átomos (no se forma por condensación).',
    rotura: 'Es un enlace fuerte (≈ 460 kJ/mol el O–H); no se rompe en las condiciones habituales de la célula.' },
  puente_h:    { tipo: 'enlace', nombre: 'Puente de hidrógeno', color: '#22b8cf', discontinuo: true,
    une: 'Un H unido a un átomo muy electronegativo (O o N, con δ⁺) y otro átomo electronegativo con pares de electrones libres (δ⁻) de otra molécula o de otra parte de la misma.',
    formacion: 'Atracción electrostática débil (≈ 20 kJ/mol, unas 20 veces más débil que un covalente). No hay reacción química.',
    rotura: 'Se rompe con facilidad con el calor (desnaturalización, fusión del ADN) y se forma y rompe continuamente en el agua líquida. No es una hidrólisis.' },
  hemiacetal:  { tipo: 'enlace', nombre: 'Enlace hemiacetal / hemicetal (cierra el anillo)', color: '#7048e8',
    une: 'El grupo carbonilo de un monosacárido (aldehído del C1 en las aldosas, cetona del C2 en las cetosas) con un –OH de la <b>misma molécula</b> (el del C5 en la glucosa y la fructosa). Así se forma el anillo: piranosa (6 átomos) o furanosa (5 átomos).',
    formacion: 'Reacción <b>intramolecular de adición</b> (no se libera agua): el O del –OH ataca al C del carbonilo y su H pasa al O del carbonilo, que se convierte en el <b>–OH anomérico</b>. Según la cara por la que ataque, el anómero es α o β.',
    rotura: 'Es <b>reversible</b>: en disolución el anillo se abre y se cierra continuamente pasando por la forma lineal (<b>mutarrotación</b>). Mientras el C anomérico conserve este –OH libre, el azúcar es <b>reductor</b>.' },
  glucosidico: { tipo: 'enlace', nombre: 'Enlace O-glucosídico', color: '#37b24d', corta: true,
    une: 'El –OH del carbono anomérico (C1 en aldosas, C2 en cetosas) de un monosacárido con un –OH de otro monosacárido, a través de un oxígeno: C–O–C.',
    formacion: '<b>Condensación</b> (deshidratación): se libera una molécula de H₂O. Puede ser α o β según la posición del –OH anomérico.',
    rotura: '<b>Hidrólisis</b>: se añade una molécula de H₂O. La realizan enzimas específicas (amilasa para α1→4, celulasa para β1→4) o los ácidos.' },
  n_glucosidico:{ tipo: 'enlace', nombre: 'Enlace N-glucosídico', color: '#94d82d', corta: true,
    une: 'El C1′ de la pentosa con un nitrógeno de la base nitrogenada (N9 en las púricas, N1 en las pirimidínicas). Forma un <b>nucleósido</b>.',
    formacion: '<b>Condensación</b>: se libera una molécula de H₂O.',
    rotura: '<b>Hidrólisis</b>: se añade una molécula de H₂O.' },
  ester:       { tipo: 'enlace', nombre: 'Enlace éster', color: '#f76707', corta: true,
    une: 'El grupo carboxilo (–COOH) de un ácido graso con un grupo –OH de un alcohol (glicerol): –CO–O–C–.',
    formacion: '<b>Esterificación</b> (condensación): se libera una molécula de H₂O por cada enlace.',
    rotura: '<b>Hidrólisis</b> (enzimas lipasas). Si es con una base fuerte (NaOH, KOH) se llama <b>saponificación</b> y da jabones + glicerina.' },
  fosfoester:  { tipo: 'enlace', nombre: 'Enlace fosfoéster', color: '#ffa94d', corta: true,
    une: 'El ácido fosfórico con un –OH de un azúcar o alcohol (P–O–C). En un nucleótido une el fosfato al C5′ de la pentosa.',
    formacion: '<b>Condensación</b>: se libera una molécula de H₂O.',
    rotura: '<b>Hidrólisis</b>: se añade una molécula de H₂O.' },
  fosfodiester:{ tipo: 'enlace', nombre: 'Enlace fosfodiéster', color: '#fd7e14', corta: true,
    une: 'Un grupo fosfato unido por dos enlaces éster a dos grupos –OH: en los ácidos nucleicos, el C3′ de un nucleótido con el C5′ del siguiente (C–O–P–O–C). En los fosfolípidos, el glicerol con el alcohol (p. ej. colina).',
    formacion: '<b>Condensación</b>: dos enlaces éster, se liberan 2 H₂O. En el ADN lo forman las polimerasas en sentido 5′→3′.',
    rotura: '<b>Hidrólisis</b> por nucleasas (ADNasas, ARNasas).' },
  fosfoanhidrido:{ tipo: 'enlace', nombre: 'Enlace fosfoanhídrido (alta energía)', color: '#e8590c', corta: true,
    une: 'Dos grupos fosfato entre sí (P–O–P). El ATP tiene dos.',
    formacion: '<b>Condensación</b> que necesita energía: fosforilación (a nivel de sustrato, oxidativa o fotofosforilación).',
    rotura: '<b>Hidrólisis</b>: ATP + H₂O → ADP + Pᵢ, libera ≈ 30,5 kJ/mol (7,3 kcal/mol) que usa la célula.' },
  peptidico:   { tipo: 'enlace', nombre: 'Enlace peptídico', color: '#be4bdb', corta: true,
    une: 'El grupo carboxilo de un aminoácido con el grupo amino del siguiente (–CO–NH–). Es un enlace amida.',
    formacion: '<b>Condensación</b>: se libera una molécula de H₂O. En la célula ocurre en los ribosomas.',
    rotura: '<b>Hidrólisis</b> por enzimas proteasas (pepsina, tripsina…). Tiene carácter parcial de doble enlace: es <b>rígido y plano</b> (no gira).' },
  disulfuro:   { tipo: 'enlace', nombre: 'Puente disulfuro (S–S)', color: '#fcc419', corta: true,
    une: 'Los grupos –SH de dos cisteínas, que pueden estar en la misma cadena o en cadenas distintas.',
    formacion: '<b>Oxidación</b>: 2 –SH → –S–S– + 2 H (no es una condensación).',
    rotura: '<b>Reducción</b> (p. ej. con mercaptoetanol). Es covalente y estabiliza la estructura terciaria y cuaternaria.' },
};

/* ---------- Colores por elemento (convención CPK simplificada) ---------- */
const COLORES_ELEMENTO = { C: '#909090', O: '#e03131', N: '#3b5bdb', H: '#ffffff', P: '#ff922b', S: '#ffd43b', Fe: '#c2410c', Mg: '#69db7c', Mn: '#9775fa', Zn: '#7d8597' };

/* ---------- Moléculas ----------
   Campos:
     id, bloque, nombre, estructura (clave del archivo en /estructuras)
     fuente: texto con la procedencia (se muestra siempre)
     macro: true para proteínas/ácidos nucleicos (archivo PDB)
     vista: representación inicial ('bolas' | 'varillas' | 'esferas' | 'cartoon')
     hb: modo de detección de puentes de H ('H' con hidrógenos, 'pesados',
         'esqueleto' para proteínas, 'bases' para ácidos nucleicos)
     cortar: tipos de enlace que separan monómeros (por defecto, los de CATALOGO con corta:true)
     variantes: otras estructuras de la misma ficha
     grupos: resaltados especiales por selección de átomos (residuos, ligandos…)
     vistas: subconjuntos de la estructura (p. ej. una sola cadena)
     info: composicion, enlaces, funcion, pau
     test: preguntas { p, op:[...], ok: índice, exp, porque:{índice: explicación del error}, marcar }
*/
const MOLECULAS = [
  /* ============================ AGUA ============================ */
  {
    id: 'agua', bloque: 'agua', nombre: 'Molécula de agua (H₂O)', estructura: 'agua',
    fuente: 'PubChem CID 962 (conformero 3D)', vista: 'bolas', cargas: true, angulo: true,
    info: {
      composicion: 'Un átomo de oxígeno unido a dos átomos de hidrógeno mediante <b>enlaces covalentes polares</b>.',
      enlaces: 'El O es más electronegativo que el H: atrae los electrones compartidos y queda con carga parcial negativa (δ⁻); los H quedan con δ⁺. La molécula es angular (≈ 104,5º) y por eso es un <b>dipolo</b>.',
      funcion: 'Disolvente universal, transporte, termorregulación (elevado calor específico y de vaporización), función estructural (turgencia) y reactivo en la hidrólisis.',
      pau: 'El agua es una molécula <b>dipolar</b> neutra. Su geometría angular y la diferencia de electronegatividad explican los puentes de hidrógeno, responsables de casi todas sus propiedades.',
    },
    test: [
      { p: '¿Qué tipo de enlace une el O con cada H dentro de la molécula de agua?', op: ['Puente de hidrógeno', 'Covalente polar', 'Iónico', 'Covalente apolar'], ok: 1,
        exp: 'Dentro de la molécula, O y H comparten electrones (covalente), pero de forma desigual porque el O es más electronegativo (polar).',
        porque: { 0: 'Los puentes de hidrógeno se forman ENTRE moléculas distintas, no dentro de la molécula.', 2: 'No hay transferencia completa de electrones ni iones.', 3: 'Sería apolar si O y H tuvieran la misma electronegatividad, y no la tienen.' } },
      { p: '¿Por qué la molécula de agua es un dipolo?', op: ['Porque tiene carga neta negativa', 'Por su geometría angular y la diferencia de electronegatividad O–H', 'Porque es lineal', 'Porque forma iones H⁺ y OH⁻'], ok: 1,
        exp: 'Los dos enlaces O–H son polares y, al no estar alineados (≈ 104,5º), sus polaridades no se anulan.',
        porque: { 0: 'El agua es neutra: tiene cargas PARCIALES que suman cero.', 2: 'Si fuera lineal (como el CO₂) las polaridades se anularían.', 3: 'La ionización del agua es mínima y no explica el carácter dipolar.' } },
    ],
  },
  {
    id: 'agua_puentes', bloque: 'agua', plano2d: true, nombre: 'Puentes de hidrógeno entre moléculas de agua', estructura: 'agua_racimo',
    fuente: 'Modelo construido con la geometría experimental del agua (O–H 0,957 Å, 104,5º) y O···O = 2,8 Å', vista: 'bolas', hb: 'H', cargas: true, cortar: [],
    autoResaltar: ['puente_h'],
    info: {
      composicion: 'Cinco moléculas de agua: una central y cuatro vecinas en disposición <b>tetraédrica</b>.',
      enlaces: 'La molécula central forma <b>4 puentes de hidrógeno</b>: dona sus dos H y acepta otros dos a través de sus pares de electrones libres. Líneas discontinuas = puentes de H.',
      funcion: 'Los puentes de H dan al agua cohesión (tensión superficial, ascenso de la savia por capilaridad), elevado calor específico y de vaporización y la menor densidad del hielo.',
      pau: 'Cada molécula de agua puede formar hasta <b>4 puentes de hidrógeno</b>. En el hielo forman una red rígida y abierta: por eso el hielo flota (el agua tiene su densidad máxima a 4 ºC).',
    },
    test: [
      { p: '¿Cuántos puentes de hidrógeno puede formar como máximo una molécula de agua?', op: ['1', '2', '4', '6'], ok: 2,
        exp: 'Dos como donadora (sus dos H) y dos como aceptora (los dos pares de electrones libres del O).',
        porque: { 0: 'Cuenta los dos H y los dos pares libres del oxígeno.', 1: 'Con 2 sólo cuentas los H (donadora); el O también acepta.', 3: 'El oxígeno sólo tiene dos pares libres.' } },
      { p: 'Las líneas discontinuas entre moléculas representan…', op: ['Enlaces covalentes', 'Puentes de hidrógeno', 'Enlaces iónicos', 'Fuerzas de Van der Waals entre H'], ok: 1,
        exp: 'Son atracciones débiles entre un H (δ⁺) de una molécula y el O (δ⁻) de otra.',
        porque: { 0: 'Los covalentes son los enlaces O–H continuos dentro de cada molécula.', 2: 'En el agua pura no hay iones que formen enlaces iónicos.', 3: 'Se dan entre H y O, y son más fuertes que las de Van der Waals.' } },
    ],
  },

  /* =========================== GLÚCIDOS =========================== */
  {
    id: 'gliceraldehido', bloque: 'glucidos', nombre: 'Gliceraldehído (aldotriosa)', estructura: 'gliceraldehido',
    fuente: 'PubChem CID 79014 (D-gliceraldehído)', vista: 'bolas', monosacarido: true,
    proyeccion: { nombre: 'D-gliceraldehído', tipo: 'aldosa', oh: ['D'] },
    info: {
      composicion: 'C₃H₆O₃. Es la <b>aldotriosa</b>: 3 carbonos y un grupo aldehído en el C1. Es el monosacárido más sencillo con un carbono asimétrico (C2).',
      enlaces: 'Un grupo <b>aldehído</b> (–CHO) en el C1 y dos grupos <b>hidroxilo</b> (C2 y C3). Al tener un solo C asimétrico existen dos enantiómeros: D y L.',
      funcion: 'Su derivado fosforilado, el <b>gliceraldehído-3-fosfato</b>, es un intermediario clave de la glucólisis y del ciclo de Calvin.',
      pau: 'Es la <b>referencia de la serie D/L</b>: un monosacárido es D si el –OH del carbono asimétrico más alejado del grupo carbonilo está a la derecha en la proyección de Fischer, como en el D-gliceraldehído.',
    },
    test: [
      { p: '¿Cuántos carbonos asimétricos tiene el gliceraldehído?', op: ['0', '1', '2', '3'], ok: 1,
        exp: 'Sólo el C2, unido a cuatro grupos distintos (–CHO, –OH, –H y –CH₂OH).' },
      { p: 'En la proyección de Fischer del D-gliceraldehído, el –OH del C2 está…', op: ['A la izquierda', 'A la derecha', 'Arriba', 'No tiene –OH'], ok: 1,
        exp: 'D = derecha. Pulsa «2D» → «Fischer» para verlo.' },
      { p: 'El gliceraldehído y la dihidroxiacetona son…', op: ['Enantiómeros', 'Isómeros de función (aldosa y cetosa)', 'Anómeros', 'La misma molécula'], ok: 1,
        exp: 'Misma fórmula C₃H₆O₃; uno tiene un aldehído y el otro una cetona.' },
    ],
  },
  {
    id: 'dihidroxiacetona', bloque: 'glucidos', nombre: 'Dihidroxiacetona (cetotriosa)', estructura: 'dihidroxiacetona',
    fuente: 'PubChem CID 670', vista: 'bolas', monosacarido: true,
    proyeccion: { nombre: 'Dihidroxiacetona', tipo: 'cetosa', oh: [] },
    info: {
      composicion: 'C₃H₆O₃, igual que el gliceraldehído (isómeros). Es la <b>cetotriosa</b>: grupo cetona en el C2.',
      enlaces: 'Un grupo <b>carbonilo</b> (cetona) en el C2 y dos <b>hidroxilos</b> en C1 y C3.',
      funcion: 'La dihidroxiacetona-fosfato es otro intermediario de la glucólisis (se interconvierte con el gliceraldehído-3-fosfato).',
      pau: 'Es el <b>único monosacárido sin carbono asimétrico</b>: no tiene isómeros D y L ni actividad óptica.',
    },
    test: [
      { p: '¿Por qué la dihidroxiacetona no tiene isómeros D y L?', op: ['Porque es una aldosa', 'Porque no tiene ningún carbono asimétrico', 'Porque es cíclica', 'Porque tiene 6 carbonos'], ok: 1,
        exp: 'Su C2 es el carbonilo (sólo 3 sustituyentes) y C1 y C3 son –CH₂OH iguales.' },
      { p: 'El grupo carbonilo de la dihidroxiacetona es…', op: ['Un aldehído en el C1', 'Una cetona en el C2', 'Un carboxilo', 'Un éster'], ok: 1, marcar: 'carbonilo',
        exp: 'Es una cetosa: el C=O está en el carbono central.' },
    ],
  },
  {
    id: 'glucosa', bloque: 'glucidos', nombre: 'Glucosa (α, β y lineal)', estructura: 'alfa_glucosa',
    fuente: 'PubChem CID 79025 (α-D-glucopiranosa)', vista: 'bolas', monosacarido: true,
    proyeccion: { tipo: 'aldosa', nombre: 'D-glucosa', nombreAnillo: 'D-glucopiranosa', oh: ['D', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'α' },
    variantes: [
      { nombre: 'α-D-glucopiranosa', estructura: 'alfa_glucosa', fuente: 'PubChem CID 79025', proyeccion: { tipo: 'aldosa', nombre: 'D-glucosa', nombreAnillo: 'D-glucopiranosa', oh: ['D', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'α' } },
      { nombre: 'β-D-glucopiranosa', estructura: 'beta_glucosa', fuente: 'PubChem CID 64689', proyeccion: { tipo: 'aldosa', nombre: 'D-glucosa', nombreAnillo: 'D-glucopiranosa', oh: ['D', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'β' } },
      { nombre: 'Forma lineal (aldehído)', estructura: 'glucosa_lineal', fuente: 'PubChem CID 107526', proyeccion: { tipo: 'aldosa', nombre: 'D-glucosa', nombreAnillo: 'D-glucopiranosa', oh: ['D', 'I', 'D', 'D'] } },
    ],
    info: {
      composicion: 'C₆H₁₂O₆. <b>Aldohexosa</b>: 6 carbonos y un grupo aldehído en el C1 (forma lineal). Es una D-glucosa: el –OH del C5 está a la derecha en la proyección de Fischer.',
      enlaces: 'En disolución se cicla: el –OH del C5 reacciona con el aldehído del C1 (<b>enlace hemiacetal</b> intramolecular) y se forma un anillo de 6 átomos (<b>piranosa</b>). El C1 pasa a ser el <b>carbono anomérico</b>: en el anómero <b>α</b> su –OH queda en el lado opuesto al CH₂OH (C6); en el <b>β</b>, en el mismo lado. Observa que el anillo real no es plano: es una <b>silla</b>.',
      funcion: 'Principal combustible de la célula (glucólisis y respiración celular). Monómero del almidón, el glucógeno y la celulosa.',
      pau: 'α y β son <b>anómeros</b> (difieren sólo en el C1). En disolución se interconvierten a través de la forma lineal (<b>mutarrotación</b>). La glucosa es <b>reductora</b> por su grupo aldehído (reacción de Fehling positiva).',
    },
    test: [
      { p: '¿Qué carbono es el carbono anomérico de la glucosa?', op: ['C1', 'C2', 'C5', 'C6'], ok: 0,
        exp: 'Es el C1, el que tenía el grupo aldehído. Al ciclarse queda unido a dos oxígenos (el del anillo y el –OH).',
        porque: { 1: 'C2 es el carbono anomérico de las cetosas como la fructosa.', 2: 'El O del C5 es el que cierra el anillo, pero el C5 no es anomérico.', 3: 'El C6 es el CH₂OH que queda fuera del anillo.' } },
      { p: 'En la forma lineal (aldehído), ¿qué grupo funcional tiene el C1?', op: ['Hidroxilo', 'Carbonilo (aldehído)', 'Carboxilo', 'Cetona'], ok: 1,
        exp: 'La glucosa es una aldosa: su C1 es un aldehído (–CHO).',
        porque: { 0: 'Los –OH están en C2-C6; el C1 tiene el C=O.', 2: 'El carboxilo (–COOH) aparece si se oxida (ácido glucónico).', 3: 'La cetona está en las cetosas (fructosa, C2).' }, variante: 2 },
    ],
  },
  {
    id: 'manosa', bloque: 'glucidos', nombre: 'Manosa (epímero en C2)', estructura: 'alfa_manosa',
    fuente: 'PubChem CID 185698 (α-D-manopiranosa)', vista: 'bolas', monosacarido: true,
    proyeccion: { tipo: 'aldosa', nombre: 'D-manosa', nombreAnillo: 'D-manopiranosa', oh: ['I', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'α' },
    variantes: [
      { nombre: 'α-D-manopiranosa', estructura: 'alfa_manosa', fuente: 'PubChem CID 185698', proyeccion: { tipo: 'aldosa', nombre: 'D-manosa', nombreAnillo: 'D-manopiranosa', oh: ['I', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'α' } },
      { nombre: 'β-D-manopiranosa', estructura: 'beta_manosa', fuente: 'PubChem CID 439680', proyeccion: { tipo: 'aldosa', nombre: 'D-manosa', nombreAnillo: 'D-manopiranosa', oh: ['I', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'β' } },
      { nombre: 'Forma lineal', estructura: 'manosa_lineal', fuente: 'PubChem CID 161658', proyeccion: { tipo: 'aldosa', nombre: 'D-manosa', nombreAnillo: 'D-manopiranosa', oh: ['I', 'I', 'D', 'D'] } },
    ],
    info: {
      composicion: 'C₆H₁₂O₆. <b>Aldohexosa</b>, igual que la glucosa, de la que sólo se diferencia en la posición del –OH del <b>C2</b>.',
      enlaces: 'Como la glucosa, se cicla por un enlace hemiacetal C1–O5 (piranosa) y tiene anómeros α y β.',
      funcion: 'Forma parte de glucoproteínas y de los oligosacáridos de la membrana (glucocáliz). Se encuentra en algunas plantas y levaduras.',
      pau: 'Glucosa y manosa son <b>epímeros</b>: diastereoisómeros que se diferencian en la configuración de un único carbono asimétrico (aquí el C2).',
    },
    test: [
      { p: '¿En qué carbono se diferencian la glucosa y la manosa?', op: ['C1', 'C2', 'C4', 'C5'], ok: 1,
        exp: 'Son epímeros en C2. Compara sus proyecciones de Fischer (botón 2D).',
        porque: { 2: 'C4 es la diferencia entre glucosa y galactosa.', 0: 'En el C1 se diferencian los anómeros α y β.' } },
      { p: 'Dos monosacáridos que sólo difieren en la configuración de un carbono asimétrico (que no es el anomérico) son…', op: ['Anómeros', 'Epímeros', 'Enantiómeros', 'Isómeros de función'], ok: 1,
        exp: 'Epímeros, como glucosa–manosa (C2) o glucosa–galactosa (C4).' },
    ],
  },
  {
    id: 'galactosa', bloque: 'glucidos', nombre: 'Galactosa (epímero en C4)', estructura: 'alfa_galactosa',
    fuente: 'PubChem CID 439357 (α-D-galactopiranosa)', vista: 'bolas', monosacarido: true,
    proyeccion: { tipo: 'aldosa', nombre: 'D-galactosa', nombreAnillo: 'D-galactopiranosa', oh: ['D', 'I', 'I', 'D'], anillo: 'piranosa', anomero: 'α' },
    variantes: [
      { nombre: 'α-D-galactopiranosa', estructura: 'alfa_galactosa', fuente: 'PubChem CID 439357', proyeccion: { tipo: 'aldosa', nombre: 'D-galactosa', nombreAnillo: 'D-galactopiranosa', oh: ['D', 'I', 'I', 'D'], anillo: 'piranosa', anomero: 'α' } },
      { nombre: 'β-D-galactopiranosa', estructura: 'beta_galactosa', fuente: 'PubChem CID 439353', proyeccion: { tipo: 'aldosa', nombre: 'D-galactosa', nombreAnillo: 'D-galactopiranosa', oh: ['D', 'I', 'I', 'D'], anillo: 'piranosa', anomero: 'β' } },
      { nombre: 'Forma lineal', estructura: 'galactosa_lineal', fuente: 'PubChem CID 3037556', proyeccion: { tipo: 'aldosa', nombre: 'D-galactosa', nombreAnillo: 'D-galactopiranosa', oh: ['D', 'I', 'I', 'D'] } },
    ],
    info: {
      composicion: 'C₆H₁₂O₆. <b>Aldohexosa</b> que se diferencia de la glucosa en la posición del –OH del <b>C4</b>.',
      enlaces: 'Se cicla por un enlace hemiacetal C1–O5 (piranosa), con anómeros α y β.',
      funcion: 'Forma la <b>lactosa</b> (azúcar de la leche) junto con la glucosa. Componente de glucolípidos y glucoproteínas.',
      pau: 'Glucosa y galactosa son <b>epímeros en C4</b>. La <b>galactosemia</b> es una enfermedad hereditaria en la que no se puede transformar la galactosa en glucosa.',
    },
    test: [
      { p: '¿En qué carbono se diferencian la glucosa y la galactosa?', op: ['C1', 'C2', 'C3', 'C4'], ok: 3,
        exp: 'Son epímeros en C4: en la galactosa el –OH del C4 está a la izquierda en Fischer (arriba en Haworth).' },
      { p: '¿Qué disacárido forman la galactosa y la glucosa?', op: ['Maltosa', 'Lactosa', 'Sacarosa', 'Celobiosa'], ok: 1,
        exp: 'β-D-galactopiranosil-(1→4)-D-glucopiranosa: la lactosa.' },
    ],
  },
  {
    id: 'fructosa', bloque: 'glucidos', nombre: 'Fructosa', estructura: 'fructosa',
    fuente: 'PubChem CID 439709 (β-D-fructofuranosa)', vista: 'bolas', monosacarido: true,
    proyeccion: { tipo: 'cetosa', nombre: 'D-fructosa', nombreAnillo: 'D-fructofuranosa', oh: ['I', 'D', 'D'], anillo: 'furanosa', anomero: 'β' },
    variantes: [
      { nombre: 'β-D-fructofuranosa', estructura: 'fructosa', fuente: 'PubChem CID 439709', proyeccion: { tipo: 'cetosa', nombre: 'D-fructosa', nombreAnillo: 'D-fructofuranosa', oh: ['I', 'D', 'D'], anillo: 'furanosa', anomero: 'β' } },
      { nombre: 'α-D-fructofuranosa', estructura: 'alfa_fructosa', fuente: 'PubChem CID 11105942', proyeccion: { tipo: 'cetosa', nombre: 'D-fructosa', nombreAnillo: 'D-fructofuranosa', oh: ['I', 'D', 'D'], anillo: 'furanosa', anomero: 'α' } },
      { nombre: 'Forma lineal (cetona)', estructura: 'fructosa_lineal', fuente: 'PubChem CID 5984', proyeccion: { tipo: 'cetosa', nombre: 'D-fructosa', nombreAnillo: 'D-fructofuranosa', oh: ['I', 'D', 'D'] } },
    ],
    info: {
      composicion: 'C₆H₁₂O₆, igual que la glucosa (son isómeros). Es una <b>cetohexosa</b>: el grupo carbonilo (cetona) está en el C2.',
      enlaces: 'Se cicla mediante un <b>enlace hemicetal</b> entre el C2 y el –OH del C5: anillo de 5 átomos (<b>furanosa</b>). El carbono anomérico es el C2.',
      funcion: 'Azúcar de las frutas y la miel. Forma la sacarosa junto con la glucosa. Se usa como fuente de energía y en el semen nutre a los espermatozoides.',
      pau: 'Glucosa y fructosa son isómeros de función (aldosa / cetosa). En la sacarosa la fructosa está en forma <b>β-furanosa</b>.',
    },
    test: [
      { p: 'La fructosa en forma cíclica forma un anillo de…', op: ['5 átomos (furanosa)', '6 átomos (piranosa)', '4 átomos', '7 átomos'], ok: 0,
        exp: 'El C2 (anomérico) se une con el O del C5: el anillo tiene 4 C y 1 O.',
        porque: { 1: 'Esa es la forma habitual de la glucosa (C1 con O del C5).' } },
    ],
  },
  {
    id: 'pentosas', bloque: 'glucidos', nombre: 'Ribosa y desoxirribosa (pentosas)', estructura: 'ribosa',
    fuente: 'PubChem CID 447347 (β-D-ribofuranosa)', vista: 'bolas', monosacarido: true,
    proyeccion: { tipo: 'aldosa', nombre: 'D-ribosa', nombreAnillo: 'D-ribofuranosa', oh: ['D', 'D', 'D'], anillo: 'furanosa', anomero: 'β' },
    variantes: [
      { nombre: 'β-D-ribosa', estructura: 'ribosa', fuente: 'PubChem CID 447347', proyeccion: { tipo: 'aldosa', nombre: 'D-ribosa', nombreAnillo: 'D-ribofuranosa', oh: ['D', 'D', 'D'], anillo: 'furanosa', anomero: 'β' } },
      { nombre: '2-desoxi-β-D-ribosa', estructura: 'desoxirribosa', fuente: 'PubChem CID 439576', proyeccion: { tipo: 'aldosa', nombre: '2-desoxi-D-ribosa', nombreAnillo: '2-desoxi-D-ribofuranosa', oh: ['H', 'D', 'D'], anillo: 'furanosa', anomero: 'β' } },
    ],
    info: {
      composicion: 'Aldopentosas (5 C). La <b>ribosa</b> es C₅H₁₀O₅; la <b>desoxirribosa</b> (C₅H₁₀O₄) tiene un oxígeno menos: en el C2 hay un H en lugar de un –OH.',
      enlaces: 'Ambas se ciclan como <b>furanosas</b> (anillo de 5: C1 unido al O del C4).',
      funcion: 'La ribosa forma parte del ARN, del ATP, del NAD⁺, FAD y coenzima A. La desoxirribosa forma parte del ADN.',
      pau: 'La ausencia del –OH en el C2′ hace al ADN químicamente más estable que el ARN. En los nucleótidos los carbonos de la pentosa se numeran con prima (C1′…C5′).',
    },
    test: [
      { p: '¿En qué carbono se diferencia la desoxirribosa de la ribosa?', op: ['C1', 'C2', 'C3', 'C5'], ok: 1,
        exp: '2-desoxirribosa: falta el oxígeno del C2.',
        porque: { 0: 'El C1 es el anomérico en ambas.', 2: 'El –OH del C3′ está en ambas (es por donde se forma el enlace fosfodiéster).', 3: 'El C5 lleva el CH₂OH en ambas.' }, variante: 1 },
    ],
  },
  {
    id: 'ciclacion_glucosa', bloque: 'glucidos', nombre: 'Ciclación de la glucosa (hemiacetal)', estructura: 'cicl_glucosa_a',
    fuente: 'Animación construida a partir de la α- y β-D-glucopiranosa de PubChem (CID 79025 y 64689): la forma abierta se obtiene deshaciendo el anillo con los mismos átomos', vista: 'bolas', monosacarido: true, ciclacion: true,
    proyeccion: { tipo: 'aldosa', nombre: 'D-glucosa', nombreAnillo: 'D-glucopiranosa', oh: ['D', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'α' },
    variantes: [
      { nombre: 'Cierre hacia α-D-glucopiranosa', estructura: 'cicl_glucosa_a', proyeccion: { tipo: 'aldosa', nombre: 'D-glucosa', nombreAnillo: 'D-glucopiranosa', oh: ['D', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'α' } },
      { nombre: 'Cierre hacia β-D-glucopiranosa', estructura: 'cicl_glucosa_b', proyeccion: { tipo: 'aldosa', nombre: 'D-glucosa', nombreAnillo: 'D-glucopiranosa', oh: ['D', 'I', 'D', 'D'], anillo: 'piranosa', anomero: 'β' } },
    ],
    pasos: {
      abierta: 'Forma <b>lineal</b> (cadena abierta): el C1 tiene un grupo <b>aldehído</b> (C=O). Es la forma que se dibuja en la proyección de Fischer.',
      plegando: 'La cadena gira por sus enlaces simples y se <b>pliega</b> sobre sí misma, acercando el –OH del C5 al C1.',
      ataque: 'El O del –OH del <b>C5</b> ataca al C del grupo aldehído (C1). La línea magenta marca el enlace que se va a formar.',
      cerrada: 'Se ha formado el <b>enlace hemiacetal C1–O5</b>: anillo de 6 átomos (<b>piranosa</b>). El H del –OH del C5 ha pasado al O del aldehído, que ahora es el <b>–OH anomérico</b>.',
    },
    info: {
      composicion: 'En disolución acuosa la glucosa está casi toda en forma <b>cíclica</b> (más del 99 %): ≈ 64 % β y ≈ 36 % α; la forma lineal es minoritaria.',
      enlaces: 'Pulsa <b>▶ Ciclar</b>: el –OH del C5 reacciona con el aldehído del C1 dentro de la misma molécula y se forma un <b>enlace hemiacetal</b>. Elige arriba si el anillo se cierra hacia α o hacia β.',
      funcion: 'La forma cíclica es la que forma los disacáridos y polisacáridos: el –OH anomérico es el que participa en el enlace O-glucosídico.',
      pau: 'Al ciclarse aparece un <b>nuevo carbono asimétrico</b> (el C1, <b>anomérico</b>). <b>α</b>: –OH anomérico en el lado opuesto al CH₂OH (abajo en Haworth). <b>β</b>: en el mismo lado (arriba). Los dos anómeros se interconvierten en disolución: <b>mutarrotación</b>.',
    },
    test: [
      { p: '¿Qué grupos reaccionan en la ciclación de la glucosa?', op: ['El aldehído del C1 y el –OH del C5', 'El –OH del C1 y el del C6', 'Dos grupos –OH con pérdida de agua', 'El C1 de dos glucosas distintas'], ok: 0,
        exp: 'Es una reacción intramolecular aldehído + alcohol → hemiacetal.' },
      { p: '¿Se libera agua al formarse el anillo de la glucosa?', op: ['Sí, una molécula', 'No: es una adición intramolecular', 'Sí, dos moléculas', 'Depende del anómero'], ok: 1,
        exp: 'El H del –OH del C5 pasa al O del carbonilo: no se pierde ningún átomo. Al contrario que el enlace glucosídico, no es una condensación.' },
      { p: 'En la α-D-glucopiranosa (proyección de Haworth), el –OH del C1 está…', op: ['Arriba, del mismo lado que el CH₂OH', 'Abajo, en el lado opuesto al CH₂OH', 'En el plano del anillo', 'Unido al C6'], ok: 1, variante: 0,
        exp: 'α = trans respecto al CH₂OH (abajo); β = cis (arriba). Mira el botón 2D → Haworth.' },
      { p: '¿Cómo se llama el nuevo carbono asimétrico que aparece al ciclarse?', op: ['Carbono quiral terminal', 'Carbono anomérico', 'Carbono epimérico', 'Carbono α'], ok: 1,
        exp: 'El C1 de las aldosas (C2 en las cetosas) pasa a ser anomérico.' },
    ],
  },
  {
    id: 'ciclacion_fructosa', bloque: 'glucidos', nombre: 'Ciclación de la fructosa (hemicetal)', estructura: 'cicl_fructosa_b',
    fuente: 'Animación construida a partir de la α- y β-D-fructofuranosa de PubChem (CID 11105942 y 439709)', vista: 'bolas', monosacarido: true, ciclacion: true,
    proyeccion: { tipo: 'cetosa', nombre: 'D-fructosa', nombreAnillo: 'D-fructofuranosa', oh: ['I', 'D', 'D'], anillo: 'furanosa', anomero: 'β' },
    variantes: [
      { nombre: 'Cierre hacia β-D-fructofuranosa', estructura: 'cicl_fructosa_b', proyeccion: { tipo: 'cetosa', nombre: 'D-fructosa', nombreAnillo: 'D-fructofuranosa', oh: ['I', 'D', 'D'], anillo: 'furanosa', anomero: 'β' } },
      { nombre: 'Cierre hacia α-D-fructofuranosa', estructura: 'cicl_fructosa_a', proyeccion: { tipo: 'cetosa', nombre: 'D-fructosa', nombreAnillo: 'D-fructofuranosa', oh: ['I', 'D', 'D'], anillo: 'furanosa', anomero: 'α' } },
    ],
    pasos: {
      abierta: 'Forma <b>lineal</b>: la fructosa es una cetosa y su grupo <b>cetona</b> (C=O) está en el <b>C2</b>.',
      plegando: 'La cadena gira por sus enlaces simples y se pliega, acercando el –OH del C5 al C2.',
      ataque: 'El O del –OH del <b>C5</b> ataca al C de la cetona (C2). La línea magenta marca el enlace que se va a formar.',
      cerrada: 'Se ha formado el <b>enlace hemicetal C2–O5</b>: anillo de 5 átomos (<b>furanosa</b>). El C2 es ahora el <b>carbono anomérico</b>.',
    },
    info: {
      composicion: 'Cetohexosa C₆H₁₂O₆. Al ciclarse con el –OH del C5 forma un anillo de 5 átomos (furanosa); también puede formar piranosas con el –OH del C6.',
      enlaces: 'Pulsa <b>▶ Ciclar</b>: el –OH del C5 reacciona con la cetona del C2 y se forma un <b>enlace hemicetal</b>.',
      funcion: 'En la sacarosa la fructosa está como <b>β-D-fructofuranosa</b>, unida por su carbono anomérico (C2).',
      pau: 'En las cetosas el carbono anomérico es el <b>C2</b>. En la β-D-fructofuranosa el –OH anomérico queda arriba en Haworth (del mismo lado que el CH₂OH del C6) y el CH₂OH del C1 abajo.',
    },
    test: [
      { p: '¿Cuál es el carbono anomérico de la fructosa cíclica?', op: ['C1', 'C2', 'C5', 'C6'], ok: 1,
        exp: 'El carbono del grupo cetona (C2).' },
      { p: 'El anillo de la fructofuranosa se forma entre…', op: ['C1 y O5', 'C2 y el O del C5', 'C2 y el O del C6', 'C1 y C6'], ok: 1, marcar: 'hemiacetal',
        exp: 'Cetona del C2 + –OH del C5 → hemicetal, anillo de 5 átomos (4 C + 1 O).' },
      { p: 'El enlace que cierra el anillo de una cetosa se llama…', op: ['Hemiacetal', 'Hemicetal', 'Glucosídico', 'Éster'], ok: 1,
        exp: 'Aldehído + alcohol → hemiacetal; cetona + alcohol → hemicetal.' },
    ],
  },
  {
    id: 'maltosa', bloque: 'glucidos', nombre: 'Maltosa (disacárido α1→4)', estructura: 'maltosa',
    fuente: 'PubChem CID 439341 (α-maltosa)', vista: 'bolas', monosacarido: true, autoResaltar: ['glucosidico'],
    info: {
      composicion: 'Dos moléculas de <b>α-D-glucosa</b>: α-D-glucopiranosil-(1→4)-α-D-glucopiranosa.',
      enlaces: '<b>Enlace O-glucosídico α(1→4)</b> entre el C1 (anomérico, en posición α) de la primera glucosa y el C4 de la segunda.',
      funcion: 'Se obtiene al hidrolizar el almidón (amilasas de la saliva y el páncreas). Azúcar de malta (cerveza).',
      pau: 'Es <b>reductora</b>: la segunda glucosa conserva libre su carbono anomérico (C1). Su hidrólisis da 2 glucosas.',
    },
    test: [
      { p: '¿Qué enlace une las dos glucosas de la maltosa?', op: ['Éster', 'O-glucosídico α(1→4)', 'O-glucosídico β(1→4)', 'Peptídico'], ok: 1, marcar: 'glucosidico',
        exp: 'C1 de una α-glucosa con el C4 de la otra, a través de un O.',
        porque: { 0: 'El enlace éster une un ácido con un alcohol (lípidos).', 2: 'β(1→4) es el de la celobiosa y la celulosa.', 3: 'El peptídico une aminoácidos.' } },
      { p: '¿Es la maltosa un azúcar reductor?', op: ['Sí, porque tiene un carbono anomérico libre', 'No, porque los dos C anoméricos están en el enlace', 'No, porque no tiene grupos –OH', 'Sólo en forma lineal'], ok: 0,
        exp: 'El C1 de la segunda glucosa no participa en el enlace, puede abrirse y reducir el Fehling.',
        porque: { 1: 'Eso pasa en la sacarosa (enlace 1→2 entre los dos C anoméricos).', 2: 'Tiene muchos –OH.' } },
    ],
  },
  {
    id: 'lactosa', bloque: 'glucidos', nombre: 'Lactosa (disacárido β1→4)', estructura: 'lactosa',
    fuente: 'PubChem CID 6134 (β-lactosa)', vista: 'bolas', monosacarido: true, autoResaltar: ['glucosidico'],
    info: {
      composicion: '<b>β-D-galactosa + D-glucosa</b>: β-D-galactopiranosil-(1→4)-D-glucopiranosa.',
      enlaces: '<b>Enlace O-glucosídico β(1→4)</b> entre el C1 de la galactosa (en posición β) y el C4 de la glucosa.',
      funcion: 'Azúcar de la <b>leche</b> de los mamíferos. La enzima <b>lactasa</b> la hidroliza en el intestino.',
      pau: 'Es <b>reductora</b> (la glucosa conserva libre su C1). La falta de lactasa en el adulto produce <b>intolerancia a la lactosa</b>.',
    },
    test: [
      { p: '¿Qué monosacáridos forman la lactosa?', op: ['Glucosa + glucosa', 'Galactosa + glucosa', 'Glucosa + fructosa', 'Galactosa + fructosa'], ok: 1,
        exp: 'Usa «Descomponer»: verás una galactosa y una glucosa.' },
      { p: '¿Qué enlace tiene la lactosa?', op: ['α(1→4)', 'β(1→4)', 'α(1→2)β', 'α(1→6)'], ok: 1, marcar: 'glucosidico',
        exp: 'El C1 de la galactosa está en posición β.' },
      { p: '¿Es la lactosa reductora?', op: ['Sí: la glucosa tiene su carbono anomérico libre', 'No, como la sacarosa', 'Sólo si se calienta', 'No, porque tiene galactosa'], ok: 0, marcar: 'hemiacetal',
        exp: 'El hemiacetal libre de la glucosa (C1–O5) puede abrirse y reducir el reactivo de Fehling.' },
    ],
  },
  {
    id: 'sacarosa', bloque: 'glucidos', nombre: 'Sacarosa (disacárido α1→2β)', estructura: 'sacarosa',
    fuente: 'PubChem CID 5988', vista: 'bolas', monosacarido: true, autoResaltar: ['glucosidico'],
    info: {
      composicion: '<b>α-D-glucosa + β-D-fructosa</b>: α-D-glucopiranosil-(1→2)-β-D-fructofuranósido.',
      enlaces: '<b>Enlace O-glucosídico α(1→2)</b>: une el C1 de la glucosa con el C2 de la fructosa, es decir, los <b>dos carbonos anoméricos</b>.',
      funcion: 'Azúcar de mesa (caña y remolacha). Forma en que las plantas transportan los glúcidos por el floema.',
      pau: 'Es <b>no reductora</b> (Fehling negativo) porque ningún carbono anomérico queda libre. Su hidrólisis da glucosa + fructosa (“azúcar invertido”).',
    },
    test: [
      { p: '¿Por qué la sacarosa no es reductora?', op: ['Porque no tiene oxígeno', 'Porque el enlace une los dos carbonos anoméricos', 'Porque es un polisacárido', 'Porque contiene fructosa'], ok: 1, marcar: 'glucosidico',
        exp: 'El enlace α(1→2) bloquea el C1 de la glucosa y el C2 de la fructosa.',
        porque: { 3: 'La fructosa libre sí es reductora; lo que importa es que su C anomérico está en el enlace.' } },
    ],
  },
  {
    id: 'celobiosa', bloque: 'glucidos', nombre: 'Celobiosa (disacárido β1→4)', estructura: 'celobiosa',
    fuente: 'PubChem CID 10712 (D-celobiosa)', vista: 'bolas', monosacarido: true, autoResaltar: ['glucosidico'],
    info: {
      composicion: 'Dos moléculas de <b>β-D-glucosa</b>: β-D-glucopiranosil-(1→4)-D-glucopiranosa.',
      enlaces: '<b>Enlace O-glucosídico β(1→4)</b>. Compárala con la maltosa: mismas glucosas, distinto enlace (α frente a β).',
      funcion: 'No existe libre en la naturaleza: se obtiene al hidrolizar parcialmente la <b>celulosa</b>, de la que es la unidad que se repite.',
      pau: 'Es <b>reductora</b>. Maltosa y celobiosa sólo se diferencian en la posición α o β del –OH anomérico que forma el enlace: eso basta para que la amilosa sea helicoidal y la celulosa lineal.',
    },
    test: [
      { p: '¿En qué se diferencian la celobiosa y la maltosa?', op: ['En los monosacáridos que las forman', 'En que el enlace es β(1→4) en la celobiosa y α(1→4) en la maltosa', 'En que la celobiosa no es reductora', 'En el número de carbonos'], ok: 1, marcar: 'glucosidico',
        exp: 'Las dos son dos glucosas unidas 1→4; sólo cambia la configuración del C1 que forma el enlace.' },
      { p: '¿De qué polisacárido se obtiene la celobiosa?', op: ['Almidón', 'Glucógeno', 'Celulosa', 'Quitina'], ok: 2,
        exp: 'Es la unidad que se repite en la celulosa.' },
    ],
  },
  {
    id: 'amilosa', guia: true, bloque: 'glucidos', nombre: 'Almidón: amilosa (α1→4, hélice)', estructura: 'amilosa',
    fuente: 'Modelo de 20 α-glucosas: residuos rígidos de PubChem (CID 79025) con ángulos glucosídicos φ/ψ del cristal de V-amilosa (PDB 1C58)', vista: 'varillas', monosacarido: true, hb: 'pesados',
    variantes: [
      { nombre: 'Amilosa (hélice)', estructura: 'amilosa' },
      { nombre: 'Comparar con celulosa', estructura: 'almidon_vs_celulosa', fuente: 'Arriba amilosa (hélice), abajo celulosa (lineal); mismos métodos que cada modelo' },
    ],
    info: {
      composicion: 'Polímero lineal de <b>α-D-glucosas</b> (cientos a miles). Este fragmento tiene 20.',
      enlaces: 'Enlaces <b>O-glucosídicos α(1→4)</b>. La geometría del enlace α hace que cada glucosa quede girada respecto a la anterior y la cadena se enrolle en una <b>hélice</b> (≈ 6-8 glucosas por vuelta).',
      funcion: 'Junto con la amilopectina forma el <b>almidón</b>, polisacárido de <b>reserva energética</b> de los vegetales (amiloplastos).',
      pau: 'El yodo (lugol) se introduce en el interior de la hélice y da <b>color azul-violeta</b>: es la prueba del almidón. Lo hidrolizan las α-amilasas.',
    },
    test: [
      { p: '¿Qué forma espacial tiene la amilosa y por qué?', op: ['Lineal, por el enlace β', 'Helicoidal, por el enlace α(1→4)', 'Ramificada, por el enlace α(1→6)', 'Plana, por los puentes disulfuro'], ok: 1, marcar: 'glucosidico',
        exp: 'El enlace α(1→4) obliga a la cadena a girar siempre hacia el mismo lado: se forma una hélice.',
        porque: { 0: 'Lineal es la celulosa, con enlaces β(1→4).', 2: 'Las ramificaciones α(1→6) son de la amilopectina y el glucógeno.', 3: 'Los glúcidos no tienen azufre.' } },
      { p: 'Al romper los enlaces de este fragmento de 20 glucosas, ¿cuántas moléculas de agua se consumen?', op: ['20', '19', '10', 'Ninguna'], ok: 1,
        exp: 'Hay 19 enlaces glucosídicos; cada hidrólisis consume 1 H₂O. Pruébalo con el modo «Descomponer».',
        porque: { 0: 'n monómeros están unidos por n − 1 enlaces.', 3: 'La hidrólisis siempre consume agua.' } },
    ],
  },
  {
    id: 'amilopectina', guia: true, bloque: 'glucidos', nombre: 'Amilopectina / glucógeno (ramificación α1→6)', estructura: 'amilopectina',
    fuente: 'Modelo: cadena de 8 α-glucosas + rama de 4 unida α(1→6). Residuos de PubChem (CID 79025); φ/ψ de 1C58 (α1→4) y de isomaltosa PubChem CID 439193 (α1→6)', vista: 'varillas', monosacarido: true, autoResaltar: ['glucosidico'],
    info: {
      composicion: 'α-D-glucosas en cadenas α(1→4) con <b>ramificaciones α(1→6)</b>.',
      enlaces: 'En los puntos de ramificación, el C1 de una glucosa se une al <b>C6</b> de una glucosa de la cadena principal. Pulsa sobre los enlaces resaltados para ver cuál es 1→4 y cuál 1→6.',
      funcion: '<b>Amilopectina</b>: componente mayoritario del almidón (≈ 80 %), ramificada cada 15-30 glucosas. <b>Glucógeno</b>: reserva de los animales (hígado y músculo), más ramificado (cada 8-12 glucosas).',
      pau: 'Las ramificaciones dan muchos extremos libres sobre los que actúan las enzimas a la vez: la glucosa se libera más rápido. Por eso el glucógeno es la reserva de movilización rápida.',
    },
    test: [
      { p: '¿Qué enlace forma los puntos de ramificación?', op: ['α(1→4)', 'α(1→6)', 'β(1→4)', 'α(1→2)'], ok: 1,
        exp: 'El C1 de la rama se une al C6 de la cadena principal.',
        porque: { 0: 'α(1→4) es el enlace de las cadenas lineales.', 2: 'β(1→4) es el de la celulosa.', 3: 'α(1→2) aparece en la sacarosa.' } },
      { p: 'Comparado con la amilopectina, el glucógeno está…', op: ['Menos ramificado', 'Más ramificado', 'Igual de ramificado', 'Sin ramificar'], ok: 1,
        exp: 'Ramificaciones cada 8-12 glucosas (frente a 15-30 en la amilopectina).' },
    ],
  },
  {
    id: 'celulosa', guia: true, bloque: 'glucidos', nombre: 'Celulosa (β1→4, lineal)', estructura: 'celulosa_cadena',
    fuente: 'Modelo de 8 β-glucosas: residuos rígidos de PubChem (CID 64689) con φ/ψ de la celulosa Iβ (Wada et al. 2009)', vista: 'varillas', monosacarido: true, hb: 'pesados',
    variantes: [
      { nombre: 'Una cadena', estructura: 'celulosa_cadena' },
      { nombre: 'Tres cadenas paralelas', estructura: 'celulosa', fuente: 'Tres copias de la cadena separadas 8,2 Å (eje b de la celulosa Iβ); disposición esquemática', cortar: ['glucosidico'] },
      { nombre: 'Comparar con amilosa', estructura: 'almidon_vs_celulosa' },
    ],
    info: {
      composicion: 'Polímero lineal y no ramificado de <b>β-D-glucosas</b> (miles).',
      enlaces: 'Enlaces <b>O-glucosídicos β(1→4)</b>. Cada glucosa está <b>girada 180º</b> respecto a la anterior: la cadena es recta (en el modelo, ≈ 2 glucosas por vuelta y 5,2 Å por glucosa). Los –OH quedan hacia fuera y forman <b>puentes de hidrógeno</b> dentro de la cadena y con cadenas vecinas.',
      funcion: '<b>Estructural</b>: forma la pared celular vegetal. Las cadenas se agrupan en microfibrillas y fibras muy resistentes.',
      pau: 'Los humanos no tenemos <b>celulasa</b> y no podemos hidrolizar el enlace β(1→4); los rumiantes y termitas sí gracias a sus microorganismos. En la dieta es fibra.',
    },
    test: [
      { p: '¿Qué diferencia estructural explica que la celulosa sea lineal y la amilosa helicoidal?', op: ['El número de glucosas', 'El tipo de enlace: β(1→4) frente a α(1→4)', 'La presencia de fructosa', 'Que la celulosa tiene enlaces peptídicos'], ok: 1, marcar: 'glucosidico',
        exp: 'Con el enlace β cada glucosa gira 180º respecto a la anterior y la cadena sale recta.',
        porque: { 0: 'Ambas tienen miles de glucosas.', 2: 'Las dos están formadas sólo por glucosa.' } },
      { p: '¿Qué mantiene unidas las cadenas de celulosa entre sí?', op: ['Enlaces glucosídicos', 'Puentes de hidrógeno', 'Puentes disulfuro', 'Enlaces éster'], ok: 1,
        exp: 'Los numerosos –OH de cadenas vecinas forman puentes de H: muchos enlaces débiles juntos dan gran resistencia.', variante: 1 },
    ],
  },

  /* =========================== LÍPIDOS =========================== */
  {
    id: 'acidos_grasos', bloque: 'lipidos', nombre: 'Ácidos grasos: saturado e insaturado', estructura: 'acidos_grasos_comparar',
    fuente: 'Conectividad de PubChem (esteárico CID 5281, oleico CID 445639); conformación extendida generada con RDKit', vista: 'bolas', autoResaltar: ['doble_cc'],
    variantes: [
      { nombre: 'Comparar ambos', estructura: 'acidos_grasos_comparar' },
      { nombre: 'Ácido esteárico (18:0)', estructura: 'estearico' },
      { nombre: 'Ácido oleico (18:1 cis-Δ9)', estructura: 'oleico' },
    ],
    info: {
      composicion: 'Cadena hidrocarbonada larga (número par de C, 12-24) con un grupo <b>carboxilo</b> en un extremo. <b>Esteárico</b>: 18 C, saturado. <b>Oleico</b>: 18 C con un doble enlace <b>cis</b> en el C9.',
      enlaces: 'Saturado: sólo enlaces simples C–C, la cadena es recta. Insaturado: el doble enlace C=C cis produce un <b>codo</b> de ≈ 30º en la cadena.',
      funcion: 'Forman parte de triglicéridos, fosfolípidos y ceras. Su oxidación (β-oxidación) proporciona mucha energía.',
      pau: 'Los <b>saturados</b> se empaquetan bien: punto de fusión alto, sólidos a temperatura ambiente (grasas animales). Los <b>insaturados</b>, por el codo, se empaquetan peor: líquidos (aceites). Son <b>anfipáticos</b> (carboxilo polar, cola apolar).',
    },
    test: [
      { p: '¿Qué produce el “codo” en la cadena del ácido oleico?', op: ['Un enlace éster', 'Un doble enlace C=C en configuración cis', 'Un doble enlace C=C trans', 'El grupo carboxilo'], ok: 1, marcar: 'doble_cc',
        exp: 'En la configuración cis los dos tramos de cadena quedan del mismo lado del doble enlace, que no puede girar.',
        porque: { 2: 'Los dobles enlaces trans dejan la cadena casi recta (grasas trans).', 3: 'El carboxilo está en el extremo y no dobla la cadena.' } },
      { p: '¿Cuál tendrá mayor punto de fusión?', op: ['El ácido esteárico', 'El ácido oleico', 'Los dos igual'], ok: 0,
        exp: 'Las cadenas rectas del esteárico se empaquetan mejor y se establecen más interacciones de Van der Waals.' },
    ],
  },
  {
    id: 'trigliceridos', bloque: 'lipidos', nombre: 'Triglicérido (triacilglicerol)', estructura: 'trigliceridos',
    fuente: 'Triacilglicerol mixto (palmítico–oleico–esteárico) generado con RDKit (ETKDG) y búsqueda de torsiones; no es un archivo experimental', vista: 'bolas', autoResaltar: ['ester'],
    info: {
      composicion: '<b>Glicerol + 3 ácidos grasos</b>. En este modelo: palmítico (16:0), oleico (18:1) y esteárico (18:0).',
      enlaces: 'Tres <b>enlaces éster</b>: cada –COOH de un ácido graso con uno de los tres –OH del glicerol.',
      funcion: '<b>Reserva energética</b> (≈ 9 kcal/g, más del doble que los glúcidos), aislante térmico (tejido adiposo) y protección mecánica.',
      pau: 'Son lípidos <b>saponificables</b> y <b>apolares</b> (no anfipáticos: el glicerol queda “tapado”). Se forman por esterificación liberando 3 H₂O; la saponificación con NaOH/KOH da glicerina + 3 jabones.',
    },
    test: [
      { p: '¿Qué enlace une cada ácido graso con el glicerol?', op: ['O-glucosídico', 'Éster', 'Peptídico', 'Fosfodiéster'], ok: 1, marcar: 'ester',
        exp: 'Grupo carboxilo del ácido graso + grupo hidroxilo del glicerol → enlace éster + H₂O.',
        porque: { 0: 'El glucosídico une monosacáridos.', 3: 'El fosfodiéster aparece en fosfolípidos y ácidos nucleicos, no en triglicéridos.' } },
      { p: 'Al formarse un triglicérido, ¿cuántas moléculas de agua se liberan?', op: ['1', '2', '3', '4'], ok: 2,
        exp: 'Una por cada enlace éster. Compruébalo con el modo «Descomponer».' },
    ],
  },
  {
    id: 'fosfolipido', bloque: 'lipidos', nombre: 'Fosfolípido (fosfatidilcolina)', estructura: 'fosfolipido',
    fuente: 'POPC (PubChem CID 5497103, estereoquímica sn-3); conformación generada con RDKit', vista: 'bolas', anfipatico: true, autoResaltar: ['cabeza_polar', 'cola_apolar'],
    info: {
      composicion: '<b>Glicerol + 2 ácidos grasos + ácido fosfórico + un alcohol</b> (aquí colina). En este modelo: palmítico (16:0) en sn-1 y oleico (18:1) en sn-2.',
      enlaces: 'Dos <b>enlaces éster</b> (ácidos grasos–glicerol) y un <b>enlace fosfodiéster</b> (glicerol–fosfato–colina).',
      funcion: 'Componente principal de las <b>membranas celulares</b>.',
      pau: 'Es <b>anfipático</b>: cabeza polar (fosfato + colina) y dos colas apolares. En agua forma espontáneamente <b>bicapas</b>, micelas y liposomas.',
    },
    test: [
      { p: '¿Qué significa que un fosfolípido es anfipático?', op: ['Que es totalmente soluble en agua', 'Que tiene una parte polar y otra apolar', 'Que no tiene ácidos grasos', 'Que tiene carga positiva'], ok: 1,
        exp: 'La cabeza (fosfato + colina) es hidrófila; las colas de ácidos grasos son hidrófobas.' },
      { p: 'El enlace que une el fosfato al glicerol y a la colina es…', op: ['Éster', 'Fosfodiéster', 'Glucosídico', 'Peptídico'], ok: 1, marcar: 'fosfodiester',
        exp: 'El fosfato forma dos enlaces éster, uno con el glicerol y otro con la colina: fosfodiéster.',
        porque: { 0: 'Los ésteres simples (carboxílicos) unen los ácidos grasos al glicerol.' } },
    ],
  },
  {
    id: 'bicapa', bloque: 'lipidos', rotacion: [80, 'x'], nombre: 'Bicapa lipídica (modelo)', estructura: 'bicapa',
    fuente: 'Modelo esquemático: 32 moléculas de DPPC (PubChem CID 452110) generadas con RDKit y colocadas en una red (9 Å). No es una simulación de membrana', vista: 'esferas', anfipatico: true, cortar: [], autoResaltar: ['cabeza_polar', 'cola_apolar'],
    info: {
      composicion: 'Dos monocapas de fosfolípidos (aquí dipalmitoilfosfatidilcolina, DPPC) enfrentadas por sus colas.',
      enlaces: 'Entre las moléculas <b>no hay enlaces covalentes</b>: las colas se mantienen juntas por el <b>efecto hidrofóbico</b> y fuerzas de Van der Waals; las cabezas interaccionan con el agua.',
      funcion: 'Base estructural de la membrana plasmática y de las membranas de los orgánulos: barrera semipermeable.',
      pau: '<b>Modelo de mosaico fluido</b> (Singer y Nicolson, 1972): los lípidos se mueven lateralmente (difusión lateral, rotación) y raramente pasan de una monocapa a otra (flip-flop). Los insaturados y el colesterol regulan la fluidez.',
    },
    test: [
      { p: '¿Qué parte de los fosfolípidos queda en el interior de la bicapa?', op: ['Las cabezas polares', 'Las colas apolares', 'El grupo fosfato', 'La colina'], ok: 1,
        exp: 'Las colas hidrófobas se alejan del agua y quedan enfrentadas en el centro.' },
      { p: '¿Qué mantiene unidas las moléculas de la bicapa?', op: ['Enlaces covalentes', 'Interacciones débiles (efecto hidrofóbico, Van der Waals)', 'Enlaces peptídicos', 'Puentes disulfuro'], ok: 1,
        exp: 'Por eso la membrana es fluida: los lípidos pueden desplazarse lateralmente.' },
    ],
  },
  {
    id: 'colesterol', bloque: 'lipidos', nombre: 'Colesterol (esteroide)', estructura: 'colesterol',
    fuente: 'PubChem CID 5997', vista: 'bolas',
    info: {
      composicion: 'C₂₇H₄₆O. Derivado del <b>esterano</b> (ciclopentanoperhidrofenantreno): 4 anillos fusionados (3 de 6 C y 1 de 5 C), un –OH en el C3, un doble enlace en C5=C6 y una cadena lateral en el C17.',
      enlaces: 'Sólo enlaces covalentes C–C, C–H, C=C y un C–O. <b>No tiene enlaces éster</b> en su estructura: es un lípido <b>insaponificable</b>.',
      funcion: 'Componente de las membranas animales (regula la fluidez). Precursor de las hormonas esteroideas (sexuales, corticoides), la vitamina D y las sales biliares.',
      pau: 'Es ligeramente anfipático: el –OH es la “cabeza” polar y se orienta hacia el exterior de la membrana. Su exceso en sangre (LDL) se relaciona con la aterosclerosis.',
    },
    test: [
      { p: '¿El colesterol es saponificable?', op: ['Sí, tiene enlaces éster', 'No, no tiene ácidos grasos unidos por enlace éster', 'Sí, porque es un lípido', 'Sólo en las membranas'], ok: 1,
        exp: 'Los esteroides derivan del esterano y no contienen ácidos grasos: son insaponificables.' },
    ],
  },

  /* ========================== PROTEÍNAS ========================== */
  {
    id: 'aminoacido', bloque: 'proteinas', nombre: 'Aminoácido genérico', estructura: 'alanina',
    fuente: 'PubChem CID 5950 (L-alanina, forma neutra)', vista: 'bolas', aminoacido: true, autoResaltar: ['amino', 'carboxilo', 'radical'],
    info: {
      composicion: 'Un <b>carbono α</b> unido a cuatro grupos: un grupo <b>amino</b> (–NH₂), un grupo <b>carboxilo</b> (–COOH), un <b>H</b> y un <b>radical R</b> variable. Aquí el ejemplo es la alanina (R = –CH₃).',
      enlaces: 'Los cuatro sustituyentes forman un tetraedro alrededor del Cα. Al ser distintos, el Cα es <b>asimétrico</b> (quiral): existen formas D y L.',
      funcion: 'Monómeros de las proteínas (20 aminoácidos proteicos). Algunos son precursores de neurotransmisores y hormonas.',
      pau: 'En disolución acuosa a pH neutro se encuentran como <b>ión dipolar (zwitterión)</b>: –NH₃⁺ y –COO⁻. Son <b>anfóteros</b>. Las proteínas sólo tienen <b>L-aminoácidos</b>. El modelo muestra la forma neutra.',
    },
    test: [
      { p: '¿Qué grupo diferencia a unos aminoácidos de otros?', op: ['El grupo amino', 'El grupo carboxilo', 'El radical R', 'El carbono α'], ok: 2, marcar: 'radical',
        exp: 'Amino, carboxilo, H y Cα son comunes a todos; el radical R es distinto en cada uno.' },
      { p: '¿Cuál es el único aminoácido proteico sin carbono asimétrico?', op: ['Alanina', 'Glicina', 'Cisteína', 'Lisina'], ok: 1,
        exp: 'En la glicina R = H: el Cα tiene dos sustituyentes iguales.' },
    ],
  },
  {
    id: 'aminoacidos', bloque: 'proteinas', nombre: 'Aminoácidos: radicales distintos', estructura: 'glicina',
    fuente: 'PubChem (formas neutras)', vista: 'bolas', aminoacido: true, autoResaltar: ['radical'],
    variantes: [
      { nombre: 'Glicina (R = H)', estructura: 'glicina', fuente: 'PubChem CID 750' },
      { nombre: 'Serina (polar)', estructura: 'serina', fuente: 'PubChem CID 5951' },
      { nombre: 'Cisteína (–SH)', estructura: 'cisteina', fuente: 'PubChem CID 5862' },
      { nombre: 'Fenilalanina (aromático)', estructura: 'fenilalanina', fuente: 'PubChem CID 6140' },
      { nombre: 'Lisina (básico)', estructura: 'lisina', fuente: 'PubChem CID 5962' },
      { nombre: 'Ácido aspártico (ácido)', estructura: 'aspartico', fuente: 'PubChem CID 5960' },
    ],
    info: {
      composicion: 'Todos comparten la misma estructura básica; cambia el radical R (en morado).',
      enlaces: '<b>Glicina</b>: R = H. <b>Serina</b>: R con –OH (polar sin carga). <b>Cisteína</b>: R con –SH, puede formar puentes disulfuro. <b>Fenilalanina</b>: anillo aromático (apolar). <b>Lisina</b>: un segundo grupo amino (básico, carga +). <b>Aspártico</b>: un segundo carboxilo (ácido, carga −).',
      funcion: 'Las propiedades de los radicales determinan cómo se pliega la proteína: los apolares tienden al interior, los polares y con carga hacia el exterior.',
      pau: 'Clasificación por el radical: <b>apolares</b>, <b>polares sin carga</b>, <b>ácidos</b> (carga −) y <b>básicos</b> (carga +). Los aminoácidos <b>esenciales</b> deben ingerirse con la dieta.',
    },
    test: [
      { p: '¿Qué aminoácido puede formar puentes disulfuro?', op: ['Serina', 'Cisteína', 'Glicina', 'Lisina'], ok: 1,
        exp: 'Su radical tiene un grupo tiol (–SH); dos cisteínas se oxidan y forman –S–S–.', variante: 2 },
      { p: 'La lisina es un aminoácido básico porque su radical tiene…', op: ['Un grupo carboxilo', 'Un grupo amino', 'Un anillo aromático', 'Un –OH'], ok: 1,
        exp: 'El –NH₂ del radical capta H⁺ y queda con carga positiva.', variante: 4 },
    ],
  },
  {
    id: 'dipeptido', bloque: 'proteinas', nombre: 'Dipéptido y enlace peptídico', estructura: 'gly_ala',
    fuente: 'PubChem CID 1551643 (glicil-L-alanina)', vista: 'bolas', aminoacido: true, autoResaltar: ['peptidico'],
    info: {
      composicion: 'Glicina + alanina (Gly-Ala). El primer aminoácido conserva el extremo amino libre (<b>N-terminal</b>) y el segundo el carboxilo libre (<b>C-terminal</b>).',
      enlaces: '<b>Enlace peptídico</b> entre el –COOH de la glicina y el –NH₂ de la alanina: –CO–NH–.',
      funcion: 'Las cadenas de muchos aminoácidos unidos por enlaces peptídicos forman péptidos (&lt; 50 aa aprox.) y proteínas.',
      pau: 'El enlace peptídico tiene <b>carácter parcial de doble enlace</b> (resonancia): es corto, rígido y <b>plano</b>; los átomos C, O, N, H y los dos Cα están en el mismo plano. Sólo pueden girar los enlaces del Cα.',
    },
    test: [
      { p: '¿Qué enlace une estos dos aminoácidos?', op: ['Enlace éster', 'Enlace peptídico', 'Puente de hidrógeno', 'Enlace O-glucosídico'], ok: 1, marcar: 'peptidico',
        exp: 'Es un enlace amida entre el carboxilo de un aminoácido y el amino del siguiente, con pérdida de H₂O.',
        porque: { 0: 'El éster se forma entre un ácido y un ALCOHOL (–OH); aquí reacciona un grupo amino.', 2: 'El puente de H es débil y no covalente; el enlace peptídico es covalente.', 3: 'El glucosídico une monosacáridos.' } },
      { p: '¿Por qué el enlace peptídico no puede girar?', op: ['Porque es un enlace iónico', 'Porque tiene carácter parcial de doble enlace', 'Porque está formado por azufre', 'Sí puede girar libremente'], ok: 1,
        exp: 'La resonancia entre el C=O y el N reparte el doble enlace y lo vuelve rígido y plano.' },
    ],
  },
  {
    id: 'gb1', bloque: 'proteinas', nombre: 'Estructura primaria y secundaria (proteína G, dominio B1)', estructura: '1PGA', macro: true,
    fuente: 'RCSB PDB 1PGA (dominio B1 de la proteína G de Streptococcus, 56 aa, rayos X 2,07 Å)', vista: 'cartoon', hb: 'esqueleto', colorInicial: 'ss',
    grupos: [
      { id: 'helice', nombre: 'Hélice α', color: '#e64980', sel: { ss: 'h' }, texto: 'Hélice α (residuos 23-36): la cadena se enrolla en espiral dextrógira, con 3,6 aminoácidos por vuelta. Cada C=O forma un puente de H con el N–H del aminoácido situado 4 posiciones más adelante. Los radicales quedan hacia fuera.' },
      { id: 'lamina', nombre: 'Lámina β', color: '#fab005', sel: { ss: 's' }, texto: 'Lámina β (4 segmentos): la cadena se extiende en zigzag y varios segmentos se colocan uno junto a otro, unidos por puentes de H entre sus esqueletos. Los radicales quedan alternativamente por encima y por debajo de la lámina.' },
    ],
    info: {
      composicion: 'Una sola cadena de 56 aminoácidos. La <b>estructura primaria</b> es su secuencia (debajo del visor, pulsa un aminoácido para localizarlo).',
      enlaces: 'Enlaces <b>peptídicos</b> en el esqueleto. La <b>estructura secundaria</b> se mantiene por <b>puentes de hidrógeno</b> entre los grupos C=O y N–H del esqueleto (no de los radicales). Esta proteína tiene una hélice α y una lámina β de 4 segmentos.',
      funcion: 'Se une a los anticuerpos (IgG). Es muy usada en investigación como modelo de plegamiento por ser pequeña y muy estable.',
      pau: '<b>Primaria</b>: secuencia de aminoácidos (enlaces peptídicos). <b>Secundaria</b>: hélice α y lámina β (puentes de H del esqueleto). En la hélice los puentes de H son paralelos al eje; en la lámina, perpendiculares a las cadenas.',
    },
    test: [
      { p: '¿Qué enlaces mantienen la estructura secundaria?', op: ['Puentes disulfuro', 'Puentes de hidrógeno entre los C=O y N–H del esqueleto', 'Enlaces peptídicos', 'Interacciones entre radicales R'], ok: 1, marcar: 'puente_h',
        exp: 'Se establecen entre los grupos del enlace peptídico (esqueleto), no entre radicales.',
        porque: { 0: 'Los disulfuro estabilizan sobre todo la terciaria y cuaternaria.', 2: 'Los peptídicos forman la estructura primaria.', 3: 'Las interacciones entre radicales son propias de la estructura terciaria.' } },
      { p: 'En la hélice α, el C=O de un aminoácido forma puente de H con el N–H del aminoácido…', op: ['Siguiente (n+1)', 'n+4', 'De otra cadena', 'n+10'], ok: 1,
        exp: 'Con 3,6 aminoácidos por vuelta, el aminoácido n+4 queda justo encima del n.' },
    ],
  },
  {
    id: 'hemoglobina', bloque: 'proteinas', nombre: 'Terciaria y cuaternaria: hemoglobina', estructura: '4HHB', macro: true,
    fuente: 'RCSB PDB 4HHB (desoxihemoglobina humana, rayos X 1,74 Å)', vista: 'cartoon', hb: 'esqueleto', colorInicial: 'cadena',
    vistas: [
      { nombre: 'Cuaternaria (α₂β₂)', sel: {} },
      { nombre: 'Terciaria (una cadena α)', sel: { chain: 'A' } },
      { nombre: 'Terciaria (una cadena β)', sel: { chain: 'B' } },
    ],
    grupos: [
      { id: 'hemo', nombre: 'Grupos hemo (Fe²⁺)', color: '#e03131', sel: { resn: 'HEM' }, texto: 'Grupo prostético hemo: anillo de porfirina con un ion Fe²⁺ en el centro, que es donde se une el O₂. Hay uno en cada cadena: la hemoglobina transporta 4 O₂.' },
      { id: 'his_prox', nombre: 'Histidinas proximales', color: '#7048e8', sel: [{ chain: 'A', resi: 87 }, { chain: 'C', resi: 87 }, { chain: 'B', resi: 92 }, { chain: 'D', resi: 92 }], texto: 'His87 (cadenas α) e His92 (cadenas β): su radical se une al Fe²⁺ del hemo y lo mantiene en su sitio. Ejemplo de cómo un radical concreto es clave para la función.' },
    ],
    info: {
      composicion: '<b>4 cadenas polipeptídicas</b>: 2 α (141 aa) y 2 β (146 aa), cada una con un grupo <b>hemo</b>. Es una <b>heteroproteína</b> (cromoproteína).',
      enlaces: '<b>Terciaria</b>: cada cadena se pliega en una forma globular compacta (8 hélices α) gracias a interacciones entre radicales: hidrofóbicas, puentes de H, iónicas. <b>Cuaternaria</b>: las 4 cadenas se unen entre sí por enlaces débiles (no covalentes).',
      funcion: 'Transporte de O₂ (y parte del CO₂) en los glóbulos rojos.',
      pau: 'Sólo tienen estructura <b>cuaternaria</b> las proteínas con varias cadenas. La unión de un O₂ cambia la conformación y facilita la unión de los siguientes (<b>cooperatividad</b>, efecto alostérico). Usa el selector de vista para pasar de cuaternaria a terciaria.',
    },
    test: [
      { p: '¿Qué nivel estructural se observa al ver las 4 cadenas juntas?', op: ['Primaria', 'Secundaria', 'Terciaria', 'Cuaternaria'], ok: 3,
        exp: 'La cuaternaria es la asociación de varias cadenas polipeptídicas.' },
      { p: '¿Dónde se une el O₂ en la hemoglobina?', op: ['Al grupo amino N-terminal', 'Al Fe²⁺ del grupo hemo', 'A los puentes disulfuro', 'A las láminas β'], ok: 1, marcarGrupo: 'hemo',
        exp: 'Cada grupo hemo tiene un Fe²⁺ que une una molécula de O₂.' },
    ],
  },
  {
    id: 'insulina', bloque: 'proteinas', nombre: 'Insulina: puentes disulfuro', estructura: '4INS', macro: true,
    fuente: 'RCSB PDB 4INS (insulina de cerdo, rayos X 1,5 Å; se muestra un monómero: cadenas A y B)', vista: 'cartoon', colorInicial: 'cadena', autoResaltar: ['disulfuro'],
    info: {
      composicion: '51 aminoácidos en <b>dos cadenas</b>: A (21 aa) y B (30 aa). La de cerdo difiere de la humana en un solo aminoácido (B30).',
      enlaces: '<b>Tres puentes disulfuro</b>: dos entre cadenas (A7–B7 y A20–B19) y uno dentro de la cadena A (A6–A11).',
      funcion: 'Hormona del páncreas (células β de los islotes de Langerhans). <b>Hipoglucemiante</b>: favorece la entrada de glucosa en las células y la síntesis de glucógeno.',
      pau: 'Los puentes disulfuro son enlaces <b>covalentes</b> entre dos cisteínas; estabilizan la estructura terciaria (y unen cadenas). Su ausencia o mal funcionamiento se relaciona con la <b>diabetes</b>.',
    },
    test: [
      { p: '¿Qué aminoácido forma los puentes disulfuro?', op: ['Serina', 'Metionina', 'Cisteína', 'Glicina'], ok: 2, marcar: 'disulfuro',
        exp: 'El grupo –SH de dos cisteínas se oxida y forma –S–S–.',
        porque: { 1: 'La metionina tiene S, pero en forma de tioéter (–S–CH₃): no forma puentes disulfuro.' } },
      { p: '¿Cuántos puentes disulfuro unen las cadenas A y B?', op: ['1', '2', '3', '0'], ok: 1,
        exp: 'A7–B7 y A20–B19 son intercatenarios; A6–A11 es intracatenario.' },
    ],
  },

  /* =========================== ENZIMAS =========================== */
  {
    id: 'lisozima', bloque: 'enzimas', nombre: 'Lisozima: centro activo', estructura: '1HEW', macro: true,
    fuente: 'RCSB PDB 1HEW (lisozima de clara de huevo con el inhibidor tri-N-acetilquitotriosa, rayos X 1,75 Å)', vista: 'cartoon', colorInicial: 'ss', autoResaltarGrupos: ['catalitico', 'inhibidor'],
    variantes: [
      { nombre: 'Con inhibidor (1HEW)', estructura: '1HEW' },
      { nombre: 'Sin ligando (1LYZ)', estructura: '1LYZ', fuente: 'RCSB PDB 1LYZ (lisozima de clara de huevo, 2,0 Å)' },
    ],
    grupos: [
      { id: 'catalitico', nombre: 'Residuos catalíticos Glu35 y Asp52', color: '#e03131', sel: { chain: 'A', resi: [35, 52] }, texto: 'Glu35 y Asp52 rompen el enlace glucosídico: el Glu35 cede un H⁺ al oxígeno del enlace y el Asp52 estabiliza el intermedio. Son los aminoácidos <b>catalíticos</b> del centro activo.' },
      { id: 'centro', nombre: 'Centro activo (a < 4 Å del ligando)', color: '#f59f00', cerca: { resn: 'NAG' }, texto: 'Aminoácidos que rodean al ligando: forman la hendidura del <b>centro activo</b>. Algunos sólo fijan el sustrato (aminoácidos de unión) y otros participan en la reacción (catalíticos). Sólo hay ligando en 1HEW.' },
      { id: 'inhibidor', nombre: 'Inhibidor (NAG)₃', color: '#37b24d', sel: { resn: 'NAG' }, estilo: 'bolas', texto: 'Tri-N-acetilquitotriosa: tres N-acetilglucosaminas unidas por enlaces β(1→4). Se parece al sustrato y ocupa parte del centro activo, pero no se hidroliza: actúa como <b>inhibidor competitivo</b>.' },
    ],
    info: {
      composicion: 'Una cadena de <b>129 aminoácidos</b> con 4 puentes disulfuro. En 1HEW lleva unido un inhibidor, (NAG)₃.',
      enlaces: 'Hidroliza el <b>enlace β(1→4)</b> entre el ácido N-acetilmurámico (NAM) y la N-acetilglucosamina (NAG) del <b>peptidoglicano</b> de la pared bacteriana.',
      funcion: 'Defensa antibacteriana: está en lágrimas, saliva, moco y clara de huevo. La descubrió Fleming en 1922.',
      pau: 'El <b>centro activo</b> es una pequeña hendidura de la enzima formada por aminoácidos que pueden estar muy alejados en la secuencia (Glu35 y Asp52) pero se acercan por el plegamiento: la función depende de la <b>estructura terciaria</b>.',
    },
    test: [
      { p: '¿Qué tipo de enlace del sustrato rompe la lisozima?', op: ['Peptídico', 'O-glucosídico β(1→4)', 'Éster', 'Fosfodiéster'], ok: 1,
        exp: 'Hidroliza el enlace β(1→4) entre NAM y NAG del peptidoglicano.' },
      { p: 'Glu35 y Asp52 están lejos en la secuencia pero juntos en el centro activo. ¿Por qué?', op: ['Por la estructura primaria', 'Por el plegamiento (estructura terciaria)', 'Por un puente disulfuro entre ellos', 'Porque están en cadenas distintas'], ok: 1, marcarGrupo: 'catalitico',
        exp: 'El plegamiento acerca aminoácidos distantes en la secuencia: si se desnaturaliza, el centro activo desaparece.' },
    ],
  },
  {
    id: 'esquema_enzima', bloque: 'enzimas', nombre: 'Esquema: cómo actúa una enzima', esquema: true,
    fuente: 'Esquema didáctico (no es una estructura real)',
    info: {
      composicion: 'Enzima (E) + sustrato (S) ⇄ complejo enzima-sustrato (ES) → enzima + producto (E + P).',
      enlaces: 'El sustrato se une al centro activo mediante <b>enlaces débiles</b> (puentes de H, iónicos, hidrofóbicos). Los aminoácidos catalíticos rompen o forman enlaces covalentes del sustrato.',
      funcion: 'Las enzimas son <b>biocatalizadores</b>: aceleran las reacciones disminuyendo la <b>energía de activación</b>. No se consumen y no cambian el equilibrio de la reacción.',
      pau: '<b>Llave-cerradura</b> (Fischer, 1894): el centro activo tiene la forma exacta del sustrato. <b>Ajuste inducido</b> (Koshland, 1958): el centro activo cambia de forma al unirse el sustrato y se adapta a él (p. ej. la hexoquinasa). Este segundo modelo es el aceptado actualmente.',
    },
    test: [
      { p: '¿Qué hacen las enzimas con la energía de activación?', op: ['La aumentan', 'La disminuyen', 'No la modifican', 'La aportan ellas'], ok: 1,
        exp: 'Al disminuir la energía de activación, la reacción ocurre más deprisa a la temperatura del organismo.' },
      { p: 'En el modelo de ajuste inducido…', op: ['El centro activo es rígido', 'El centro activo cambia de forma al unirse el sustrato', 'La enzima se consume', 'El sustrato no se une a la enzima'], ok: 1,
        exp: 'Propuesto por Koshland: la enzima es flexible y se adapta al sustrato.' },
    ],
  },

  /* ======================= ÁCIDOS NUCLEICOS ======================= */
  {
    id: 'nucleotido', bloque: 'nucleicos', nombre: 'Nucleótido', estructura: 'damp',
    fuente: 'PubChem CID 12599 (dAMP)', vista: 'bolas', nucleotido: true, autoResaltar: ['n_glucosidico', 'fosfoester'],
    variantes: [
      { nombre: 'dAMP (desoxirribonucleótido, ADN)', estructura: 'damp', fuente: 'PubChem CID 12599' },
      { nombre: 'AMP (ribonucleótido, ARN)', estructura: 'amp', fuente: 'PubChem CID 6083' },
    ],
    info: {
      composicion: '<b>Base nitrogenada + pentosa + ácido fosfórico</b>. Base + pentosa = <b>nucleósido</b>. Aquí: adenina + desoxirribosa (dAMP) o ribosa (AMP) + un fosfato.',
      enlaces: '<b>Enlace N-glucosídico</b> entre el C1′ de la pentosa y el N9 de la adenina. <b>Enlace fosfoéster</b> entre el fosfato y el –OH del C5′.',
      funcion: 'Monómeros de los ácidos nucleicos. También forman parte de coenzimas (NAD⁺, FAD, CoA) y del AMP cíclico (segundo mensajero).',
      pau: 'Usa «Descomponer» para separar base, pentosa y fosfato. Los nucleótidos de ADN llevan desoxirribosa y no tienen uracilo; los de ARN llevan ribosa y no tienen timina.',
    },
    test: [
      { p: '¿Qué enlace une la base nitrogenada con la pentosa?', op: ['Fosfoéster', 'N-glucosídico', 'Peptídico', 'Fosfodiéster'], ok: 1, marcar: 'n_glucosidico',
        exp: 'Une el C1′ de la pentosa con un N de la base (N9 en púricas, N1 en pirimidínicas).',
        porque: { 0: 'El fosfoéster une el fosfato al C5′.', 3: 'El fosfodiéster une nucleótidos entre sí.' } },
      { p: '¿A qué carbono de la pentosa se une el fosfato?', op: ['C1′', 'C2′', 'C3′', 'C5′'], ok: 3, marcar: 'fosfoester',
        exp: 'El fosfato se une al –OH del C5′ mediante un enlace fosfoéster.' },
    ],
  },
  {
    id: 'atp', bloque: 'nucleicos', nombre: 'ATP (adenosín trifosfato)', estructura: 'atp',
    fuente: 'PubChem CID 5957 (forma neutra)', vista: 'bolas', nucleotido: true, autoResaltar: ['fosfoanhidrido'],
    info: {
      composicion: 'Adenina + ribosa + <b>3 grupos fosfato</b> (α, β, γ).',
      enlaces: 'N-glucosídico (adenina–ribosa), fosfoéster (ribosa–fosfato α) y <b>dos enlaces fosfoanhídrido</b> entre los fosfatos (α–β y β–γ).',
      funcion: '<b>Moneda energética</b> de la célula: almacena energía en sus enlaces fosfoanhídrido y la cede al hidrolizarse.',
      pau: 'ATP + H₂O → ADP + Pᵢ + ≈ 30,5 kJ/mol (7,3 kcal/mol). Se sintetiza por fosforilación a nivel de sustrato, fosforilación oxidativa (mitocondria) y fotofosforilación (cloroplasto).',
    },
    test: [
      { p: '¿Cuántos enlaces fosfoanhídrido tiene el ATP?', op: ['1', '2', '3', '0'], ok: 1, marcar: 'fosfoanhidrido',
        exp: 'Entre α y β, y entre β y γ. El enlace del fosfato α con la ribosa es un fosfoéster.',
        porque: { 2: 'Son tres fosfatos, pero sólo dos enlaces P–O–P; el tercero (con la ribosa) es fosfoéster.' } },
    ],
  },
  {
    id: 'bases', bloque: 'nucleicos', nombre: 'Bases nitrogenadas', estructura: 'adenina',
    fuente: 'PubChem', vista: 'bolas',
    variantes: [
      { nombre: 'Adenina (A, púrica)', estructura: 'adenina', fuente: 'PubChem CID 190' },
      { nombre: 'Guanina (G, púrica)', estructura: 'guanina', fuente: 'PubChem CID 135398634' },
      { nombre: 'Citosina (C, pirimidínica)', estructura: 'citosina', fuente: 'PubChem CID 597' },
      { nombre: 'Timina (T, pirimidínica)', estructura: 'timina', fuente: 'PubChem CID 1135' },
      { nombre: 'Uracilo (U, pirimidínica)', estructura: 'uracilo', fuente: 'PubChem CID 1174' },
    ],
    info: {
      composicion: 'Compuestos cíclicos con nitrógeno. <b>Púricas</b> (dos anillos, derivadas de la purina): adenina y guanina. <b>Pirimidínicas</b> (un anillo): citosina, timina y uracilo.',
      enlaces: 'Anillos planos con dobles enlaces conjugados. Los grupos N–H (dadores) y C=O / N (aceptores) del borde forman los <b>puentes de hidrógeno</b> entre bases complementarias.',
      funcion: 'Contienen la información genética: su secuencia es el mensaje.',
      pau: 'ADN: A, G, C y <b>T</b>. ARN: A, G, C y <b>U</b>. La timina es un uracilo con un grupo metilo (–CH₃) en el C5.',
    },
    test: [
      { p: '¿Cuál de estas bases es púrica?', op: ['Citosina', 'Timina', 'Guanina', 'Uracilo'], ok: 2,
        exp: 'Las púricas (A y G) tienen dos anillos; las pirimidínicas (C, T, U), uno.' },
    ],
  },
  {
    id: 'pares', bloque: 'nucleicos', plano2d: true, nombre: 'Pares de bases y puentes de H', estructura: 'par_AT',
    fuente: 'Bases reales extraídas del cristal PDB 1BNA (A5–T20); hidrógenos añadidos con RDKit', vista: 'bolas', hb: 'H', cortar: [], autoResaltar: ['puente_h'],
    variantes: [
      { nombre: 'A–T (ADN)', estructura: 'par_AT', fuente: 'PDB 1BNA, par A5–T20; H añadidos con RDKit' },
      { nombre: 'G–C', estructura: 'par_GC', fuente: 'PDB 1BNA, par G4–C21; H añadidos con RDKit' },
      { nombre: 'A–U (ARN)', estructura: 'par_AU', fuente: 'PDB 1EHZ (ARNt), par A5–U68; H añadidos con RDKit' },
    ],
    info: {
      composicion: 'Una base púrica frente a una pirimidínica. El carbono marcado como C1′ es el que se une a la pentosa.',
      enlaces: '<b>A–T: 2 puentes de H</b>; <b>G–C: 3 puentes de H</b>; A–U (en ARN): 2. Las distancias del cristal son de 2,6-3,2 Å entre los átomos N y O.',
      funcion: 'La complementariedad de bases permite la replicación, la transcripción y la traducción (codón-anticodón).',
      pau: '<b>Regla de Chargaff</b>: en el ADN de doble cadena A = T y G = C. Las zonas ricas en G–C son más estables (3 puentes de H) y necesitan más temperatura para desnaturalizarse.',
    },
    test: [
      { p: '¿Cuántos puentes de hidrógeno hay entre guanina y citosina?', op: ['1', '2', '3', '4'], ok: 2, variante: 1,
        exp: 'G≡C forma 3 puentes de H; A=T sólo 2.' },
      { p: 'Un ADN rico en G–C, comparado con uno rico en A–T, se desnaturaliza…', op: ['A menor temperatura', 'A mayor temperatura', 'A la misma temperatura'], ok: 1,
        exp: 'Más puentes de H por par de bases: hace falta más energía para separar las cadenas.' },
    ],
  },
  {
    id: 'adn', bloque: 'nucleicos', nombre: 'ADN: doble hélice', estructura: '1BNA', macro: true,
    fuente: 'RCSB PDB 1BNA (dodecámero de Dickerson CGCGAATTCGCG, ADN-B, rayos X 1,9 Å)', vista: 'varillas', hb: 'bases', extremos: true, colorInicial: 'cadena', autoResaltar: ['puente_h'],
    grupos: [
      { id: 'esqueleto', nombre: 'Esqueleto azúcar-fosfato', color: '#ff922b', sel: { atom: ['P', 'OP1', 'OP2', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'", "C1'"] }, texto: 'Alternancia de desoxirribosa y fosfato unidos por enlaces fosfodiéster. Queda en el exterior de la hélice, en contacto con el agua; los fosfatos tienen carga negativa.' },
      { id: 'bases_n', nombre: 'Bases nitrogenadas', color: '#4c6ef5', sel: { atom: ['N1', 'C2', 'N2', 'O2', 'N3', 'C4', 'N4', 'O4', 'C5', 'C7', 'C6', 'N6', 'O6', 'N7', 'C8', 'N9'] }, texto: 'Las bases quedan hacia el interior, apiladas como los peldaños de una escalera y emparejadas por puentes de H.' },
    ],
    info: {
      composicion: 'Dos cadenas de 12 desoxirribonucleótidos cada una (5′-CGCGAATTCGCG-3′), complementarias.',
      enlaces: '<b>Fosfodiéster</b> entre el C3′ de un nucleótido y el C5′ del siguiente (esqueleto). <b>Puentes de H</b> entre las bases (2 en A–T, 3 en G–C). Las cadenas son <b>antiparalelas</b>: una va 5′→3′ y la otra 3′→5′ (mira las etiquetas 5′ y 3′).',
      funcion: 'Almacenar y transmitir la información genética.',
      pau: 'Modelo de <b>Watson y Crick</b> (1953): doble hélice <b>dextrógira</b>, ≈ 2 nm de diámetro, 10 pares de bases por vuelta (3,4 nm). Cadenas antiparalelas y complementarias; bases dentro, esqueleto fuera; surco mayor y menor.',
    },
    test: [
      { p: '¿Qué enlace une los nucleótidos de una misma cadena?', op: ['Puente de hidrógeno', 'Fosfodiéster', 'N-glucosídico', 'Peptídico'], ok: 1, marcar: 'fosfodiester',
        exp: 'El fosfato une el C3′ de un nucleótido con el C5′ del siguiente.',
        porque: { 0: 'Los puentes de H unen las dos cadenas (entre bases), no los nucleótidos de una cadena.', 2: 'El N-glucosídico une la base con la pentosa dentro de cada nucleótido.' } },
      { p: '¿Qué significa que las cadenas son antiparalelas?', op: ['Que son idénticas', 'Que tienen sentidos 5′→3′ opuestos', 'Que no se unen', 'Que una es de ARN'], ok: 1,
        exp: 'Frente al extremo 5′ de una cadena está el extremo 3′ de la otra.' },
    ],
  },
  {
    id: 'arnt', bloque: 'nucleicos', nombre: 'ARN de transferencia (ARNt)', estructura: '1EHZ', macro: true,
    fuente: 'RCSB PDB 1EHZ (ARNt de fenilalanina de levadura, 76 nt, rayos X 1,93 Å)', vista: 'cartoon', hb: 'bases', extremos: true, colorInicial: 'monomero',
    grupos: [
      { id: 'anticodon', nombre: 'Anticodón (Gm34-A35-A36)', color: '#e03131', sel: { resi: [34, 35, 36] }, texto: 'Tres bases que se emparejan con el codón complementario del ARNm (anticodón 5′-GAA-3′ ↔ codón 5′-UUC-3′, fenilalanina). La G34 está metilada (Gm).' },
      { id: 'cca', nombre: 'Extremo 3′ CCA (unión del aminoácido)', color: '#37b24d', sel: { resi: [74, 75, 76] }, texto: 'Secuencia C-C-A del extremo 3′. El aminoácido (aquí fenilalanina) se une al –OH de la adenosina terminal A76 mediante un enlace éster.' },
      { id: 'modificados', nombre: 'Nucleótidos modificados', color: '#be4bdb', sel: { resn: ['2MG', 'H2U', 'M2G', 'OMC', 'OMG', 'YYG', 'PSU', '5MC', '7MG', '5MU', '1MA'] }, texto: 'El ARNt tiene muchas bases modificadas tras la transcripción (pseudouridina, dihidrouridina, bases metiladas…). Ayudan a su plegamiento y función.' },
    ],
    info: {
      composicion: 'Una sola cadena de 76 ribonucleótidos, con muchas bases modificadas.',
      enlaces: 'Esqueleto con enlaces <b>fosfodiéster</b>. La cadena se pliega sobre sí misma y se forman <b>puentes de H entre bases complementarias</b> de la misma cadena (brazos o tallos).',
      funcion: 'Transporta los aminoácidos al ribosoma y “traduce” el código genético: su anticodón reconoce el codón del ARNm.',
      pau: 'Estructura secundaria en <b>hoja de trébol</b> (brazo aceptor, brazo D, anticodón y brazo T) y estructura terciaria en forma de <b>L</b>, que es la que se ve aquí.',
    },
    test: [
      { p: '¿Qué región del ARNt reconoce el codón del ARNm?', op: ['El extremo CCA', 'El anticodón', 'El brazo T', 'El extremo 5′'], ok: 1, marcarGrupo: 'anticodon',
        exp: 'El anticodón es complementario y antiparalelo al codón.' },
      { p: '¿Dónde se une el aminoácido?', op: ['Al anticodón', 'Al extremo 3′ (CCA)', 'Al extremo 5′', 'Al brazo D'], ok: 1, marcarGrupo: 'cca',
        exp: 'Al –OH de la adenosina terminal del extremo 3′-CCA.' },
    ],
  },
];

/* =====================================================================
   PREGUNTAS ADICIONALES DEL TEST
   Se añaden a las de cada ficha (clave = id de la molécula).
   Formato: { p, op, ok, exp, porque, marcar, marcarGrupo, variante }
   ===================================================================== */
const PREGUNTAS_EXTRA = {
  agua: [
    { p: '¿A qué se debe el elevado calor específico del agua?', op: ['A su bajo peso molecular', 'A los puentes de hidrógeno entre sus moléculas', 'A que es una molécula apolar', 'A sus enlaces iónicos'], ok: 1,
      exp: 'Para calentar el agua hay que romper muchos puentes de H, por eso absorbe mucho calor con poca subida de temperatura: actúa como amortiguador térmico.',
      porque: { 0: 'Un peso molecular bajo daría, al contrario, un líquido muy volátil.', 2: 'El agua es polar.', 3: 'El agua no tiene enlaces iónicos.' } },
    { p: '¿Por qué el agua es un buen disolvente de las sales (sustancias iónicas)?', op: ['Porque es apolar', 'Porque sus dipolos rodean y separan los iones (hidratación)', 'Porque reacciona con ellas', 'Porque tiene enlaces peptídicos'], ok: 1,
      exp: 'El O (δ⁻) se orienta hacia los cationes y los H (δ⁺) hacia los aniones, formando una capa de hidratación. Tiene una constante dieléctrica muy alta.' },
    { p: '¿Por qué el hielo flota sobre el agua líquida?', op: ['Porque el hielo tiene más masa', 'Porque los puentes de H forman una red abierta y el hielo es menos denso', 'Porque el hielo contiene aire', 'Porque el agua líquida es apolar'], ok: 1,
      exp: 'En el hielo cada molécula forma 4 puentes de H fijos en una red hexagonal con huecos. El agua tiene su densidad máxima a 4 ºC; el hielo aísla el agua de debajo y permite la vida en lagos helados.' },
  ],
  agua_puentes: [
    { p: '¿Entre qué átomos se forma un puente de hidrógeno en el agua?', op: ['Entre el O y el H de la misma molécula', 'Entre un H (δ⁺) de una molécula y el O (δ⁻) de otra', 'Entre dos átomos de O', 'Entre dos átomos de H'], ok: 1, marcar: 'puente_h',
      exp: 'El H, unido a un O muy electronegativo, queda con carga parcial positiva y es atraído por el O de otra molécula.',
      porque: { 0: 'Eso es el enlace covalente O–H, dentro de la molécula.' } },
    { p: 'La capilaridad y la tensión superficial del agua se deben a…', op: ['Su carácter apolar', 'La cohesión y adhesión producidas por los puentes de H', 'Su baja densidad', 'Los enlaces covalentes O–H'], ok: 1,
      exp: 'La cohesión (entre moléculas de agua) y la adhesión (con otras superficies) permiten, por ejemplo, el ascenso de la savia bruta por el xilema.' },
  ],
  glucosa: [
    { p: '¿En qué se diferencian la α-glucosa y la β-glucosa?', op: ['En el número de carbonos', 'En la posición del –OH del carbono anomérico (C1)', 'En que una es aldosa y otra cetosa', 'En la posición del grupo CH₂OH'], ok: 1,
      exp: 'Son anómeros: sólo cambia la orientación del –OH del C1. En la α queda en el lado opuesto al CH₂OH (C6); en la β, en el mismo lado. Compara las dos variantes.',
      porque: { 0: 'Ambas tienen 6 C.', 2: 'Las dos son aldosas: son la misma molécula ciclada de dos formas.' } },
    { p: 'El anillo de la glucosa se forma por un enlace…', op: ['Hemiacetal entre el C1 y el –OH del C5', 'Glucosídico entre dos glucosas', 'Éster entre el C1 y el C6', 'Peptídico intramolecular'], ok: 0,
      exp: 'El –OH del C5 reacciona con el grupo aldehído del C1 dentro de la misma molécula: hemiacetal intramolecular, anillo de piranosa.' },
    { p: 'Según el número de carbonos y su grupo carbonilo, la glucosa es una…', op: ['Cetopentosa', 'Aldohexosa', 'Cetohexosa', 'Aldopentosa'], ok: 1,
      exp: '6 carbonos (hexosa) y grupo aldehído en el C1 (aldosa).' },
    { p: '¿Es la glucosa un azúcar reductor?', op: ['Sí: su grupo aldehído (C1) puede oxidarse', 'No, porque es cíclica', 'Sólo la forma β', 'No, porque no tiene grupo carbonilo'], ok: 0,
      exp: 'En disolución el anillo se abre y el aldehído libre reduce el Cu²⁺ del reactivo de Fehling (precipitado rojo).' },
  ],
  fructosa: [
    { p: '¿Cuál es el carbono anomérico de la fructosa?', op: ['C1', 'C2', 'C5', 'C6'], ok: 1,
      exp: 'En las cetosas el grupo carbonilo está en el C2, que es el que se convierte en anomérico al ciclarse.' },
    { p: 'Glucosa y fructosa tienen la misma fórmula (C₆H₁₂O₆). Son…', op: ['La misma molécula', 'Isómeros (aldosa y cetosa)', 'Polímeros', 'Anómeros'], ok: 1,
      exp: 'Misma fórmula molecular, distinta estructura: isómeros de función (aldehído / cetona).',
      porque: { 3: 'Los anómeros (α/β) sólo difieren en el carbono anomérico de una misma molécula.' } },
  ],
  pentosas: [
    { p: '¿Qué ácido nucleico contiene ribosa?', op: ['ADN', 'ARN', 'Los dos', 'Ninguno'], ok: 1,
      exp: 'El ARN lleva ribosa; el ADN, desoxirribosa (de ahí sus nombres).' },
    { p: 'La ribosa forma un anillo de 5 átomos llamado…', op: ['Piranosa', 'Furanosa', 'Purina', 'Esterano'], ok: 1,
      exp: 'Furanosa: 4 C y 1 O, como el furano. La piranosa tiene 6 átomos (5 C y 1 O).' },
  ],
  maltosa: [
    { p: '¿Qué se obtiene al hidrolizar la maltosa?', op: ['Glucosa + fructosa', '2 glucosas', 'Glucosa + galactosa', '2 fructosas'], ok: 1,
      exp: 'La maltosa está formada por dos α-glucosas.',
      porque: { 0: 'Eso da la sacarosa.', 2: 'Eso da la lactosa.' } },
    { p: '¿De dónde procede la maltosa en nuestra digestión?', op: ['De la hidrólisis del almidón por las amilasas', 'De la hidrólisis de la celulosa', 'De los triglicéridos', 'De las proteínas'], ok: 0,
      exp: 'La amilasa salival y la pancreática rompen los enlaces α(1→4) del almidón y liberan maltosa; la maltasa la rompe en 2 glucosas.' },
  ],
  sacarosa: [
    { p: '¿Qué monosacáridos forman la sacarosa?', op: ['2 glucosas', 'Glucosa y fructosa', 'Glucosa y galactosa', 'Ribosa y glucosa'], ok: 1,
      exp: 'α-D-glucosa y β-D-fructosa unidas por un enlace α(1→2).' },
    { p: '¿En qué forma transportan las plantas los glúcidos por el floema?', op: ['Almidón', 'Sacarosa', 'Celulosa', 'Glucógeno'], ok: 1,
      exp: 'La sacarosa es soluble y no reductora (poco reactiva): ideal para el transporte en la savia elaborada.' },
  ],
  amilosa: [
    { p: '¿Con qué reactivo se identifica el almidón?', op: ['Fehling', 'Lugol (yodo)', 'Biuret', 'Sudán III'], ok: 1,
      exp: 'El yodo se aloja dentro de la hélice de la amilosa y da color azul-violeta.',
      porque: { 0: 'El Fehling detecta azúcares reductores.', 2: 'El Biuret detecta proteínas (enlaces peptídicos).', 3: 'El Sudán III tiñe lípidos.' } },
    { p: '¿Cuál es la función del almidón?', op: ['Estructural en la pared celular', 'Reserva energética en vegetales', 'Reserva energética en animales', 'Transporte de oxígeno'], ok: 1,
      exp: 'Se almacena en amiloplastos (p. ej. en tubérculos y semillas). La reserva de los animales es el glucógeno.' },
    { p: 'Activa «Forma de la cadena». ¿Qué forma tiene la amilosa?', op: ['Recta', 'Hélice', 'Lámina plegada', 'Anillo cerrado'], ok: 1,
      exp: 'La línea naranja une los centros de las glucosas y dibuja una hélice, con unas 6-8 glucosas por vuelta.' },
  ],
  amilopectina: [
    { p: '¿Dónde se almacena el glucógeno en los animales?', op: ['En el tejido adiposo', 'En el hígado y los músculos', 'En la sangre', 'En los huesos'], ok: 1,
      exp: 'El glucógeno hepático mantiene la glucemia; el muscular aporta glucosa al propio músculo.' },
    { p: '¿Qué ventaja tienen las ramificaciones del glucógeno?', op: ['Lo hacen insoluble', 'Ofrecen muchos extremos donde actúan las enzimas a la vez: movilización rápida', 'Impiden su hidrólisis', 'Le dan función estructural'], ok: 1,
      exp: 'Las enzimas que liberan glucosa actúan desde los extremos; cuantas más ramas, más rápida es la movilización.' },
  ],
  celulosa: [
    { p: '¿Cuál es la función de la celulosa?', op: ['Reserva energética', 'Estructural: forma la pared celular vegetal', 'Hormonal', 'Transporte de glúcidos'], ok: 1,
      exp: 'Las cadenas lineales se unen por puentes de H y forman microfibrillas muy resistentes.' },
    { p: '¿Por qué los humanos no podemos digerir la celulosa?', op: ['Porque es un lípido', 'Porque no tenemos enzimas (celulasas) que rompan el enlace β(1→4)', 'Porque tiene enlaces peptídicos', 'Porque es demasiado pequeña'], ok: 1, marcar: 'glucosidico',
      exp: 'Sí rompemos los enlaces α (amilasas), pero no los β. Los rumiantes la digieren gracias a microorganismos de su aparato digestivo.' },
  ],
  acidos_grasos: [
    { p: 'El ácido esteárico (18:0) es…', op: ['Saturado: sin dobles enlaces', 'Insaturado: un doble enlace', 'Poliinsaturado', 'Un esteroide'], ok: 0, variante: 1,
      exp: 'La notación 18:0 indica 18 carbonos y 0 dobles enlaces.' },
    { p: 'Los ácidos grasos son anfipáticos porque tienen…', op: ['Un grupo carboxilo polar y una cadena hidrocarbonada apolar', 'Dos grupos carboxilo', 'Un grupo amino', 'Un anillo aromático'], ok: 0, marcar: 'carboxilo',
      exp: 'El –COOH (–COO⁻ a pH fisiológico) es hidrófilo; la cadena de C e H, hidrófoba. En agua forman micelas.' },
    { p: '¿Por qué los aceites vegetales son líquidos a temperatura ambiente?', op: ['Porque tienen más glicerol', 'Porque abundan los ácidos grasos insaturados, cuyos codos dificultan el empaquetamiento', 'Porque son saturados', 'Porque no tienen enlaces éster'], ok: 1,
      exp: 'Menos interacciones de Van der Waals entre cadenas → menor punto de fusión.' },
  ],
  trigliceridos: [
    { p: '¿Qué se obtiene en la saponificación de un triglicérido?', op: ['Glicerina y jabones (sales de ácidos grasos)', 'Glucosa y fructosa', 'Aminoácidos', 'Colesterol'], ok: 0,
      exp: 'Es la hidrólisis alcalina (con NaOH o KOH) de los enlaces éster.' },
    { p: '¿Son anfipáticos los triglicéridos?', op: ['Sí, como los fosfolípidos', 'No: son apolares (hidrófobos)', 'Sólo si son insaturados', 'Sí, por el glicerol'], ok: 1,
      exp: 'Los tres –OH del glicerol están esterificados; no queda ninguna parte polar libre. Por eso forman gotas de grasa y no bicapas.' },
    { p: '¿Cuál es la función principal de los triglicéridos?', op: ['Estructural en membranas', 'Reserva energética y aislante térmico', 'Catalizar reacciones', 'Transportar información genética'], ok: 1,
      exp: 'Aportan unas 9 kcal/g y se almacenan en los adipocitos sin agua asociada.' },
  ],
  fosfolipido: [
    { p: '¿Qué componentes forman un fosfoglicérido como la fosfatidilcolina?', op: ['Glicerol + 3 ácidos grasos', 'Glicerol + 2 ácidos grasos + fosfato + un alcohol (colina)', 'Esfingosina + 1 ácido graso', 'Colesterol + ácido graso'], ok: 1,
      exp: 'Prueba «Descomponer»: verás glicerol, dos ácidos grasos, el fosfato y la colina.',
      porque: { 0: 'Eso es un triglicérido.', 2: 'Esos son los esfingolípidos.' } },
    { p: '¿Qué estructuras forman espontáneamente los fosfolípidos en el agua?', op: ['Hélices', 'Bicapas, micelas y liposomas', 'Cristales', 'Láminas β'], ok: 1,
      exp: 'Las colas apolares se esconden del agua y las cabezas polares quedan en contacto con ella.' },
  ],
  bicapa: [
    { p: '¿Quiénes propusieron el modelo de mosaico fluido?', op: ['Watson y Crick', 'Singer y Nicolson', 'Fischer y Koshland', 'Schleiden y Schwann'], ok: 1,
      exp: 'Singer y Nicolson, en 1972: bicapa lipídica fluida con proteínas que se desplazan en ella.' },
    { p: '¿Qué movimiento de los lípidos de membrana es muy poco frecuente?', op: ['Difusión lateral', 'Rotación', 'Flip-flop (paso de una monocapa a otra)', 'Flexión de las colas'], ok: 2,
      exp: 'Para pasar de una monocapa a otra la cabeza polar debería atravesar el interior hidrófobo: necesita enzimas (flipasas).' },
  ],
  colesterol: [
    { p: '¿De qué molécula es precursor el colesterol?', op: ['De la glucosa', 'De las hormonas esteroideas, la vitamina D y las sales biliares', 'De los aminoácidos', 'Del ATP'], ok: 1,
      exp: 'Hormonas sexuales (testosterona, estrógenos), corticoides, vitamina D y ácidos biliares derivan del colesterol.' },
    { p: '¿De qué hidrocarburo derivan los esteroides?', op: ['Del glicerol', 'Del esterano (ciclopentanoperhidrofenantreno)', 'Del isopreno lineal', 'De la purina'], ok: 1,
      exp: 'Cuatro anillos fusionados: tres de 6 carbonos y uno de 5.' },
    { p: '¿Dónde se encuentra el colesterol formando parte de las membranas?', op: ['En las membranas de las células animales', 'En la pared de las bacterias', 'En la pared celular vegetal', 'Sólo en el núcleo'], ok: 0,
      exp: 'Se intercala entre los fosfolípidos y regula la fluidez. Las plantas tienen otros esteroles (fitoesteroles).' },
  ],
  aminoacido: [
    { p: '¿Por qué los aminoácidos son anfóteros?', op: ['Porque son apolares', 'Porque tienen un grupo ácido (–COOH) y uno básico (–NH₂)', 'Porque tienen azufre', 'Porque son azúcares'], ok: 1, marcar: 'carboxilo',
      exp: 'Pueden comportarse como ácidos (ceden H⁺) o como bases (aceptan H⁺) según el pH del medio.' },
    { p: '¿Cómo se encuentra un aminoácido en disolución a pH neutro?', op: ['Sin carga en ningún grupo', 'Como ión dipolar o zwitterión (–NH₃⁺ y –COO⁻)', 'Con carga negativa en el grupo amino', 'Unido a otro aminoácido'], ok: 1,
      exp: 'El carboxilo cede su H⁺ y el amino lo capta: carga neta cero pero con dos cargas opuestas.' },
    { p: '¿Qué tipo de aminoácidos forman las proteínas?', op: ['D-aminoácidos', 'L-aminoácidos', 'β-aminoácidos', 'Ambos isómeros por igual'], ok: 1,
      exp: 'Salvo la glicina (sin C asimétrico), los aminoácidos proteicos son α-L-aminoácidos.' },
  ],
  aminoacidos: [
    { p: 'La fenilalanina tiene un radical…', op: ['Polar con –OH', 'Aromático y apolar', 'Ácido', 'Básico'], ok: 1, variante: 3,
      exp: 'Su anillo bencénico sólo tiene C e H: es hidrófobo.' },
    { p: 'El ácido aspártico, a pH fisiológico, tiene en su radical…', op: ['Carga positiva', 'Carga negativa', 'Ninguna carga', 'Un grupo –SH'], ok: 1, variante: 5,
      exp: 'Su radical tiene un segundo –COOH, que cede un H⁺ y queda como –COO⁻.' },
    { p: 'La serina se clasifica como aminoácido…', op: ['Apolar', 'Polar sin carga (por su –OH)', 'Ácido', 'Básico'], ok: 1, variante: 1,
      exp: 'El –OH del radical forma puentes de H con el agua pero no se ioniza.' },
  ],
  dipeptido: [
    { p: '¿Cuántas moléculas de agua se liberan al formarse un dipéptido?', op: ['0', '1', '2', '3'], ok: 1,
      exp: 'Una condensación = un enlace peptídico = una molécula de H₂O.' },
    { p: 'En el dipéptido Gly-Ala, ¿qué aminoácido tiene el extremo amino libre (N-terminal)?', op: ['La glicina', 'La alanina', 'Los dos', 'Ninguno'], ok: 0, marcar: 'amino',
      exp: 'Por convenio los péptidos se escriben del extremo N-terminal (izquierda) al C-terminal (derecha).' },
    { p: '¿Cuántos enlaces peptídicos tiene un pentapéptido?', op: ['5', '4', '6', '10'], ok: 1,
      exp: 'n aminoácidos están unidos por n − 1 enlaces peptídicos.' },
  ],
  gb1: [
    { p: '¿Qué enlaces mantienen la estructura primaria?', op: ['Puentes de hidrógeno', 'Enlaces peptídicos', 'Puentes disulfuro', 'Interacciones hidrofóbicas'], ok: 1, marcar: 'peptidico',
      exp: 'La estructura primaria es la secuencia, unida por enlaces peptídicos (covalentes).' },
    { p: 'En la desnaturalización de una proteína, ¿qué estructura se conserva?', op: ['La cuaternaria', 'La terciaria', 'La secundaria', 'La primaria'], ok: 3,
      exp: 'El calor o los cambios de pH rompen los enlaces débiles; los enlaces peptídicos no se rompen. Por eso a veces es reversible (renaturalización).' },
    { p: 'En la lámina β, los radicales de los aminoácidos se sitúan…', op: ['Todos hacia el interior', 'Alternativamente por encima y por debajo de la lámina', 'Hacia el eje de la hélice', 'Unidos entre sí por puentes de H'], ok: 1, marcarGrupo: 'lamina',
      exp: 'La cadena en zigzag deja los radicales alternos a uno y otro lado del plano.' },
  ],
  hemoglobina: [
    { p: '¿Cuántas cadenas polipeptídicas tiene la hemoglobina?', op: ['1', '2', '4', '8'], ok: 2,
      exp: '2 cadenas α y 2 cadenas β (α₂β₂). Usa el color por cadenas.' },
    { p: 'La estructura terciaria se mantiene, sobre todo, por…', op: ['Enlaces peptídicos', 'Interacciones entre los radicales R', 'Puentes de H del esqueleto únicamente', 'Enlaces glucosídicos'], ok: 1,
      exp: 'Interacciones hidrofóbicas, puentes de H, enlaces iónicos y puentes disulfuro entre radicales.' },
    { p: '¿Por qué la hemoglobina es una heteroproteína?', op: ['Porque tiene 4 cadenas', 'Porque además de aminoácidos tiene un grupo prostético (hemo)', 'Porque es globular', 'Porque transporta oxígeno'], ok: 1, marcarGrupo: 'hemo',
      exp: 'Heteroproteína = parte proteica + grupo prostético no proteico. El hemo hace de la hemoglobina una cromoproteína.' },
  ],
  insulina: [
    { p: '¿Qué función tiene la insulina?', op: ['Aumenta la glucemia', 'Disminuye la glucemia (hipoglucemiante)', 'Transporta O₂', 'Digiere proteínas'], ok: 1,
      exp: 'Favorece la entrada de glucosa en las células y su almacenamiento como glucógeno. El glucagón tiene el efecto contrario.' },
    { p: '¿Qué tipo de enlace es el puente disulfuro?', op: ['Débil, como un puente de H', 'Covalente', 'Iónico', 'Hidrofóbico'], ok: 1, marcar: 'disulfuro',
      exp: 'Es un enlace covalente S–S; por eso es muy estable y resiste a muchos agentes desnaturalizantes.' },
  ],
  lisozima: [
    { p: 'Un inhibidor competitivo actúa…', op: ['Uniéndose al centro activo y compitiendo con el sustrato', 'Destruyendo la enzima', 'Uniéndose siempre a otro lugar de la enzima', 'Aumentando la temperatura'], ok: 0, marcarGrupo: 'inhibidor',
      exp: 'Se parece al sustrato y ocupa el centro activo. Su efecto disminuye si aumenta la concentración de sustrato.' },
    { p: '¿Qué le ocurre a la lisozima si se calienta mucho?', op: ['Actúa más rápido indefinidamente', 'Se desnaturaliza: pierde su forma y su actividad', 'Se convierte en otra enzima', 'Nada'], ok: 1,
      exp: 'Por encima de la temperatura óptima se rompen los enlaces que mantienen la estructura terciaria y desaparece el centro activo.' },
    { p: '¿Dónde se encuentra la lisozima en el ser humano?', op: ['En la sangre únicamente', 'En lágrimas, saliva y mucosas', 'En el núcleo', 'En los cloroplastos'], ok: 1,
      exp: 'Forma parte de la defensa inespecífica frente a bacterias (sobre todo grampositivas).' },
  ],
  esquema_enzima: [
    { p: 'Al terminar la reacción, la enzima…', op: ['Se consume', 'Queda intacta y puede volver a actuar', 'Se convierte en producto', 'Se desnaturaliza'], ok: 1,
      exp: 'Por eso basta una cantidad pequeña de enzima.' },
    { p: 'La especificidad de una enzima se debe a…', op: ['Su tamaño', 'La forma y composición de su centro activo', 'Su color', 'La cantidad de sustrato'], ok: 1,
      exp: 'Sólo los sustratos que encajan y establecen las interacciones adecuadas con el centro activo son transformados.' },
    { p: 'Holoenzima = apoenzima + …', op: ['Sustrato', 'Cofactor (ion metálico o coenzima)', 'Producto', 'Inhibidor'], ok: 1,
      exp: 'La apoenzima es la parte proteica; muchas enzimas necesitan un cofactor para ser activas (p. ej. Mg²⁺, NAD⁺, FAD).' },
    { p: '¿Qué pasa con la velocidad de una reacción enzimática si aumenta mucho la concentración de sustrato?', op: ['Crece sin límite', 'Aumenta hasta un máximo (Vmáx) cuando la enzima se satura', 'Disminuye', 'No cambia nunca'], ok: 1,
      exp: 'Cuando todas las moléculas de enzima están ocupadas formando complejos ES se alcanza la velocidad máxima.' },
  ],
  nucleotido: [
    { p: 'Base nitrogenada + pentosa (sin fosfato) se llama…', op: ['Nucleótido', 'Nucleósido', 'Ácido nucleico', 'Codón'], ok: 1,
      exp: 'Nucleósido + fosfato(s) = nucleótido.' },
    { p: '¿Qué enlace une los nucleótidos entre sí en un ácido nucleico?', op: ['N-glucosídico', 'Fosfodiéster', 'Peptídico', 'Puente de hidrógeno'], ok: 1,
      exp: 'El fosfato del C5′ de un nucleótido se une al –OH del C3′ del anterior.' },
    { p: 'El dAMP se diferencia del AMP en que tiene…', op: ['Timina', 'Desoxirribosa (sin –OH en el C2′)', 'Tres fosfatos', 'Uracilo'], ok: 1, variante: 0,
      exp: 'La "d" significa desoxi. Compara las dos variantes: falta un O en el C2′.' },
  ],
  atp: [
    { p: '¿Qué productos da la hidrólisis del ATP?', op: ['AMP + glucosa', 'ADP + fosfato inorgánico (Pᵢ) + energía', 'Adenina + 3 ribosas', 'ADN'], ok: 1,
      exp: 'ATP + H₂O → ADP + Pᵢ, liberando unos 30,5 kJ/mol.' },
    { p: '¿Dónde se sintetiza la mayor parte del ATP en una célula animal?', op: ['En el núcleo', 'En las mitocondrias (fosforilación oxidativa)', 'En los ribosomas', 'En el aparato de Golgi'], ok: 1,
      exp: 'La ATP sintasa de la membrana mitocondrial interna usa el gradiente de protones de la cadena respiratoria.' },
    { p: '¿Qué pentosa forma parte del ATP?', op: ['Desoxirribosa', 'Ribosa', 'Glucosa', 'Fructosa'], ok: 1,
      exp: 'El ATP es un ribonucleótido: adenina + ribosa + 3 fosfatos.' },
  ],
  bases: [
    { p: '¿Qué base sólo aparece en el ADN?', op: ['Adenina', 'Uracilo', 'Timina', 'Guanina'], ok: 2, variante: 3,
      exp: 'En el ARN su lugar lo ocupa el uracilo.' },
    { p: '¿Qué diferencia hay entre la timina y el uracilo?', op: ['La timina tiene un grupo metilo (–CH₃) en el C5', 'El uracilo tiene dos anillos', 'La timina es púrica', 'No hay ninguna diferencia'], ok: 0, variante: 4,
      exp: 'Compara las variantes timina y uracilo: sólo cambia el –CH₃.' },
    { p: 'Las bases púricas tienen…', op: ['Un anillo', 'Dos anillos fusionados', 'Tres anillos', 'Ningún nitrógeno'], ok: 1, variante: 0,
      exp: 'Adenina y guanina derivan de la purina (anillo de 6 + anillo de 5).' },
  ],
  pares: [
    { p: 'Un ADN de doble cadena tiene un 30 % de adenina. ¿Qué porcentaje de guanina tiene?', op: ['30 %', '20 %', '40 %', '70 %'], ok: 1,
      exp: 'A = T = 30 % (60 % en total); queda un 40 % para G + C, y como G = C, G = 20 % (regla de Chargaff).' },
    { p: 'En el ARN, la adenina se empareja con…', op: ['Timina', 'Uracilo', 'Guanina', 'Citosina'], ok: 1, variante: 2,
      exp: 'A–U, con 2 puentes de H (por ejemplo en los tallos del ARNt o al emparejarse codón y anticodón).' },
  ],
  adn: [
    { p: '¿Dónde se sitúa el esqueleto azúcar-fosfato en la doble hélice?', op: ['En el interior', 'En el exterior', 'En el eje central', 'No tiene esqueleto'], ok: 1, marcarGrupo: 'esqueleto',
      exp: 'Los fosfatos, polares y con carga negativa, quedan hacia fuera en contacto con el agua; las bases, hacia dentro.' },
    { p: 'Si una cadena es 5′-ATGC-3′, la complementaria es…', op: ['5′-ATGC-3′', '3′-TACG-5′', '5′-TACG-3′', '3′-UACG-5′'], ok: 1,
      exp: 'Complementaria (A–T, G–C) y antiparalela (3′→5′ frente a 5′→3′). Escrita 5′→3′ sería 5′-GCAT-3′.',
      porque: { 2: 'Las bases son correctas, pero el sentido no: la cadena complementaria es antiparalela.', 3: 'El uracilo no está en el ADN.' } },
    { p: '¿Cuántos pares de bases hay aproximadamente por vuelta en el ADN-B?', op: ['3,6', '10', '20', '100'], ok: 1,
      exp: 'Unos 10 pares de bases por vuelta, cada 3,4 nm.',
      porque: { 0: '3,6 son los aminoácidos por vuelta de la hélice α.' } },
    { p: 'Los dos extremos de una cadena de ADN se llaman…', op: ['N y C', '5′ y 3′', 'α y β', 'Amino y carboxilo'], ok: 1,
      exp: '5′ = extremo con el fosfato del C5′ libre; 3′ = extremo con el –OH del C3′ libre.',
      porque: { 0: 'N-terminal y C-terminal son los extremos de las proteínas.' } },
  ],
  arnt: [
    { p: '¿Qué forma tiene el ARNt en su estructura secundaria (en dos dimensiones)?', op: ['Doble hélice', 'Hoja de trébol', 'Lámina β', 'Anillo'], ok: 1,
      exp: 'Hoja de trébol con 4 brazos; en 3D se pliega en forma de L.' },
    { p: 'El anticodón 5′-GAA-3′ reconoce el codón 5′-UUC-3′. ¿Qué aminoácido transporta este ARNt?', op: ['Glicina', 'Fenilalanina', 'Lisina', 'Alanina'], ok: 1, marcarGrupo: 'anticodon',
      exp: 'UUC codifica fenilalanina: este es el ARNt-Phe de levadura (PDB 1EHZ).' },
    { p: '¿Qué tienen de especial muchos nucleótidos del ARNt?', op: ['Que son desoxirribonucleótidos', 'Que tienen bases modificadas (pseudouridina, metilaciones…)', 'Que no tienen fosfato', 'Que son aminoácidos'], ok: 1, marcarGrupo: 'modificados',
      exp: 'Se modifican tras la transcripción y ayudan al plegamiento y a la lectura del código.' },
  ],
};
MOLECULAS.forEach(m => { m.test = (m.test || []).concat(PREGUNTAS_EXTRA[m.id] || []); });
