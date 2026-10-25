# Biomoléculas 3D

Web educativa de una sola página para explorar en 3D las biomoléculas de Biología de 2.º de Bachillerato
(currículo de Aragón, nivel PAU): qué monómeros las forman, qué enlaces tienen y cómo es su estructura espacial.

## Cómo usarla (sin conocimientos técnicos)

1. Haz doble clic en **`index.html`**. Se abre en el navegador (Chrome, Edge, Firefox o Safari).
   Es un **único archivo autocontenido** (≈ 2 MB): lleva dentro la librería y las 49 estructuras, así que
   funciona sin internet y aunque lo copies suelto a otro ordenador, a un pendrive o lo subas al aula virtual.
2. **Elige una molécula** en el menú de la izquierda (en el móvil, botón ☰). Arriba del visor puedes cambiar
   la representación (bolas y varillas, varillas, esferas, cinta) y el color (por elemento o por monómero).
3. **Gira** la molécula arrastrando con el ratón o el dedo; **zoom** con la rueda o pellizcando; **mover** con
   Mayús + arrastrar o con dos dedos. Pulsa los botones de **Resaltar** (grupos funcionales y enlaces) y luego
   **pulsa sobre lo resaltado**: en la pestaña *Detalle* verás qué une, cómo se forma y cómo se rompe.
4. Pulsa **2D** para ver la fórmula en el plano (cada átomo con su símbolo y rayas para los enlaces; con o sin H).
   En los monosacáridos también tienes la **proyección de Fischer** y la de **Haworth**.
5. En *Ciclación de la glucosa / de la fructosa* pulsa **▶ Ciclar** para ver cómo la cadena abierta se cierra
   en anillo (enlace hemiacetal o hemicetal) y elige si se forma el anómero α o el β.
6. Usa **⇄ Descomponer** para separar el polímero en sus monómeros, y la pestaña **Test** para practicar.
   El cuadro «ID PDB» de arriba abre cualquier proteína del Protein Data Bank (esto sí necesita internet).

En la pestaña **Test** puedes elegir: preguntas de la molécula que estás viendo, todo el bloque, o un
**examen de 15 preguntas al azar de todo el temario** (hay 152 preguntas, con explicación de cada error).

## Estructura de carpetas

```
index.html                 PÁGINA PARA USAR: archivo único generado (no editar a mano)
fuente.html                Versión modular de la página (la que se edita)
css/estilos.css            Diseño (modo claro/oscuro, adaptable a móvil)
js/moleculas.js            CONTENIDOS: bloques, fichas, textos PAU, preguntas del test (PREGUNTAS_EXTRA al final)
js/analisis.js             Detección automática de grupos funcionales, enlaces, puentes de H y monómeros
js/app.js                  Visor 3D (3Dmol.js), resaltados, etiquetas, descomponer, test y paneles
js/esquema-enzima.js       Esquema animado enzima-sustrato (llave-cerradura / ajuste inducido)
js/vista2d.js              Vista 2D: fórmula desarrollada, sin H, Fischer, Haworth y Fischer → Haworth
lib/3Dmol-min.js           Librería 3Dmol.js 2.5.5 (copia local; si falta se usa el CDN)
estructuras/*.js           Una estructura por archivo (cargadas bajo demanda; funcionan con file://)
estructuras/fuentes/       Las mismas estructuras en formato SDF/PDB estándar
herramientas/              construir_modelos.py (modelos 3D), complementos.py (coordenadas 2D y animaciones
                           de ciclación) y empaquetar.py (genera index.html)
datos_raw/                 Descargas originales de PubChem y RCSB usadas por los scripts
```

## Añadir una molécula

1. Descarga el SDF 3D de PubChem (o el PDB de RCSB) y crea `estructuras/<clave>.js` con
   `window.registrarEstructura('<clave>', {formato: 'sdf', datos: \`...contenido...\`});`
   (o añádela al diccionario `pubchem` de `herramientas/construir_modelos.py` y ejecútalo).
2. Añade una entrada al array `MOLECULAS` de `js/moleculas.js` (los campos están comentados al principio
   del archivo). Los grupos funcionales, enlaces y monómeros se detectan solos a partir de los enlaces.
   Para añadir preguntas, edita `PREGUNTAS_EXTRA` al final del mismo archivo.
3. Ejecuta `python3 herramientas/empaquetar.py` para regenerar `index.html` (no necesita RDKit).
   Mientras editas puedes abrir `fuente.html` directamente para ver los cambios sin regenerar.

## Fuentes de datos

| Estructura | Fuente |
|---|---|
| Agua | PubChem CID 962 |
| α-D-glucosa / β-D-glucosa / glucosa lineal | PubChem CID 79025 / 64689 / 107526 |
| β-D-fructofuranosa, β-D-ribosa, 2-desoxi-β-D-ribosa | PubChem CID 439709, 447347, 439576 |
| D-gliceraldehído, dihidroxiacetona | PubChem CID 79014, 670 |
| α-/β-D-manopiranosa, D-manosa lineal | PubChem CID 185698 / 439680, 161658 |
| α-/β-D-galactopiranosa, D-galactosa lineal | PubChem CID 439357 / 439353, 3037556 |
| α-D-fructofuranosa, D-fructosa lineal | PubChem CID 11105942, 5984 |
| α-maltosa, β-lactosa, sacarosa, celobiosa | PubChem CID 439341, 6134, 5988, 10712 |
| Colesterol, glicerol | PubChem CID 5997, 753 |
| Gly, Ala, Ser, Cys, Phe, Lys, Asp; dipéptido Gly-Ala | PubChem CID 750, 5950, 5951, 5862, 6140, 5962, 5960; 1551643 |
| dAMP, AMP, ATP | PubChem CID 12599, 6083, 5957 |
| Adenina, timina, citosina, guanina, uracilo | PubChem CID 190, 1135, 597, 135398634, 1174 |
| Proteína G B1 (primaria/secundaria) | RCSB PDB 1PGA |
| Hemoglobina humana (desoxi) | RCSB PDB 4HHB |
| Insulina (cerdo) | RCSB PDB 4INS (cadenas A y B) |
| Lisozima con inhibidor (NAG)₃ / sin ligando | RCSB PDB 1HEW / 1LYZ |
| ADN-B (dodecámero de Dickerson) | RCSB PDB 1BNA |
| ARNt-Phe de levadura | RCSB PDB 1EHZ |

**Modelos construidos (no son archivos experimentales; se indica en cada ficha):**

- *Animaciones de ciclación:* el estado final son las formas cíclicas de PubChem (α/β-D-glucopiranosa y
  α/β-D-fructofuranosa). La forma abierta se obtiene deshaciendo el hemiacetal con los mismos átomos; el
  plegado se interpola en ángulos de torsión (RDKit/MMFF). La web comprueba la geometría del fotograma final y
  reconoce por sí sola el anómero (α o β).
- *Vista 2D:* coordenadas calculadas con RDKit a partir de las mismas estructuras; las cuñas indican la
  estereoquímica real de cada archivo. Fischer y Haworth se dibujan con la configuración de cada azúcar D.

- *Amilosa (20 glucosas), amilopectina (8 + rama de 4) y celulosa (8; y 3 cadenas):* cada glucosa es una copia
  rígida del conformero de PubChem (silla ⁴C₁). Los ángulos glucosídicos φ/ψ proceden de datos cristalográficos:
  V-amilosa medida en el cristal PDB **1C58** (φ ≈ 103°, ψ ≈ 116°), celulosa Iβ según Wada et al. 2009
  (φ = −98°, ψ = 90°) y α(1→6) del conformero de isomaltosa de PubChem (CID 439193). Resultado comprobado:
  celulosa con 2,03 residuos/vuelta y 5,25 Å por residuo (real: hélice 2₁, 5,19 Å); amilosa con ≈ 7,9 residuos/vuelta.
  La estereoquímica de maltosa y celobiosa construidas coincide exactamente con PubChem.
- *Ácidos esteárico y oleico, triglicérido, POPC y bicapa (DPPC):* conectividad y estereoquímica de PubChem
  (CID 5281, 445639, 5497103, 452110); coordenadas generadas con RDKit (ETKDG) y cadenas extendidas.
  La bicapa es una disposición esquemática en red, no una simulación de membrana.
- *Racimo de 5 aguas:* geometría experimental del agua (O–H 0,957 Å, 104,5°) con O···O = 2,8 Å.
- *Pares de bases:* coordenadas reales de los cristales 1BNA (A5–T20, G4–C21) y 1EHZ (A5–U68); los H se
  añadieron con RDKit. Distancias N/O···N/O de 2,6–3,2 Å.

3Dmol.js: Rego y Koes (2015), licencia BSD-3. Datos: PubChem (NCBI) y RCSB PDB, de dominio público.
