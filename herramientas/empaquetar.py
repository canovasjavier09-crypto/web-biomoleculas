"""
empaquetar.py
-------------
Genera index.html AUTOCONTENIDO (un único archivo) a partir de fuente.html:
mete dentro la librería 3Dmol.js, los estilos, el código y TODAS las
estructuras de la carpeta estructuras/. Así la web funciona aunque se abra
el archivo suelto, desde una vista previa o sin internet.

Uso (después de editar fuente.html, css/, js/ o estructuras/):
    python3 herramientas/empaquetar.py
"""
import os, re, json, glob

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
leer = lambda p: open(os.path.join(RAIZ, p), encoding='utf-8').read()


def seguro(js):
    # evita que un "</script" dentro del código cierre la etiqueta antes de tiempo
    return js.replace('</script', '<\\/script')


def estructuras():
    """Lee estructuras/*.js y devuelve un único bloque JS con todos los datos."""
    datos = {}
    patron = re.compile(r'window\.registrarEstructura\((".*?"), (\{.*\})\);\s*$', re.S)
    for ruta in sorted(glob.glob(os.path.join(RAIZ, 'estructuras', '*.js'))):
        m = patron.search(open(ruta, encoding='utf-8').read())
        if not m:
            raise SystemExit(f'Formato no reconocido: {ruta}')
        datos[json.loads(m.group(1))] = json.loads(m.group(2))
    cuerpo = ',\n'.join(f'{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in datos.items())
    return f'/* {len(datos)} estructuras incluidas */\nwindow.ESTRUCTURAS = {{\n{cuerpo}\n}};', len(datos)


def principal():
    html = leer('fuente.html')
    html = html.replace('<link rel="stylesheet" href="css/estilos.css">', '<style>\n' + leer('css/estilos.css') + '\n</style>')
    # la librería se incluye dentro: ya no hace falta el respaldo del CDN
    html = re.sub(r'\s*<script>\s*if \(!window\.\$3Dmol\).*?</script>', '', html, flags=re.S)
    bloque, n = estructuras()

    def incrustar(m):
        ruta = m.group(1)
        extra = f'<script>\n{seguro(bloque)}\n</script>\n  ' if ruta == 'js/app.js' else ''
        return f'{extra}<script>/* {ruta} */\n{seguro(leer(ruta))}\n</script>'
    html = re.sub(r'<script src="([^"]+)"></script>', incrustar, html)
    aviso = '<!-- ARCHIVO GENERADO por herramientas/empaquetar.py a partir de fuente.html. No lo edites a mano. -->\n'
    html = html.replace('<!doctype html>', '<!doctype html>\n' + aviso, 1)
    with open(os.path.join(RAIZ, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'index.html generado: {n} estructuras, {os.path.getsize(os.path.join(RAIZ, "index.html")) / 1e6:.1f} MB')


if __name__ == '__main__':
    principal()
