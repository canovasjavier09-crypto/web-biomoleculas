"""
construir_modelos.py
--------------------
Script (no necesario para usar la web) que genera los modelos 3D que NO existen
como conformero 3D en PubChem y empaqueta todas las estructuras en archivos .js
para que la web funcione sin servidor y sin internet.

Requisitos: Python 3 + RDKit + numpy  (pip install rdkit numpy)
Uso:        python herramientas/construir_modelos.py

Fuentes:
  * Estructuras pequeñas: conformeros 3D de PubChem (datos_raw/cid_XXXX.sdf).
  * Macromoléculas: archivos PDB de RCSB (datos_raw/XXXX.pdb).
  * Polisacáridos, lípidos y bicapa: conectividad y estereoquímica de PubChem
    (SMILES isoméricos), coordenadas generadas aquí con RDKit (ETKDG + MMFF).
    Los ángulos glucosídicos phi/psi se toman de los conformeros 3D de PubChem
    de maltosa (CID 439341), celobiosa (CID 10712) e isomaltosa (CID 439193).
  * Racimo de agua: construido con la geometría experimental del agua
    (O-H 0,9572 Å, H-O-H 104,52º) y distancia O···O de 2,8 Å.
"""
import os, sys, json, random
import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem, rdMolTransforms as T
from rdkit.Chem import rdMolAlign

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(RAIZ, 'datos_raw')
OUT = os.path.join(RAIZ, 'estructuras')
FUENTES = os.path.join(OUT, 'fuentes')
os.makedirs(FUENTES, exist_ok=True)
random.seed(7)

# ---------------------------------------------------------------- utilidades

def escribir_js(clave, formato, texto, multi=False, extra=None):
    """Guarda la estructura como JS (window.ESTRUCTURAS) y como archivo fuente."""
    ext = {'sdf': 'sdf', 'pdb': 'pdb'}[formato]
    with open(os.path.join(FUENTES, f'{clave}.{ext}'), 'w') as f:
        f.write(texto)
    obj = {'formato': formato, 'multi': multi, 'datos': texto}
    obj.update(extra or {})
    payload = json.dumps(obj)
    with open(os.path.join(OUT, f'{clave}.js'), 'w') as f:
        f.write(f'/* Estructura "{clave}" (generada por herramientas/construir_modelos.py) */\n')
        f.write(f'window.registrarEstructura({json.dumps(clave)}, {payload});\n')


def sdf_de(mol, nombre):
    mol.SetProp('_Name', nombre)
    return Chem.MolToMolBlock(mol) + '$$$$\n'


def coords(mol, conf=None):
    c = (conf or mol.GetConformer()).GetPositions()
    return np.array(c)


def kabsch(P, Q):
    """Rotación R y traslación t tal que R·P + t ≈ Q."""
    Pc, Qc = P.mean(0), Q.mean(0)
    H = (P - Pc).T @ (Q - Qc)
    U, S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1, 1, d])
    R = Vt.T @ D @ U.T
    return R, Qc - R @ Pc


def choques(mol, umbral_pesado=2.9, umbral_h=1.9):
    """Número de pares de átomos no enlazados (separados > 3 enlaces) demasiado cerca."""
    dm = Chem.GetDistanceMatrix(mol)
    X = coords(mol)
    n = mol.GetNumAtoms()
    D = np.linalg.norm(X[:, None] - X[None], axis=-1)
    malo = 0
    for i in range(n):
        for j in range(i + 1, n):
            if dm[i, j] <= 3:
                continue
            hi = mol.GetAtomWithIdx(i).GetAtomicNum() == 1
            hj = mol.GetAtomWithIdx(j).GetAtomicNum() == 1
            u = umbral_h if (hi or hj) else umbral_pesado
            if hi and hj:
                u = 1.7
            if D[i, j] < u:
                malo += 1
    return malo

# ------------------------------------------------------------ glúcidos (polímeros)
# Plantillas a partir de los SMILES isoméricos de PubChem.
#   α-D-glucosa CID 79025: C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O
#   β-D-glucosa CID 64689: C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O)O)O)O)O
# Orden de los hidroxilos en ese SMILES: O1 (anomérico), O2, O3, O4 y O6.
# Se sustituyen por puntos de unión [*:n] SIN cambiar el orden de escritura,
# así la estereoquímica se conserva; molzip une los fragmentos.

def glc(anomero, o1=None, o4=None, o6=None):
    c1 = '[C@H]' if anomero == 'a' else '[C@@H]'
    s1 = f'[*:{o1}]' if o1 else 'O'                 # C1 donador: pierde su OH
    s4 = f'O[*:{o4}]' if o4 else 'O'                # O4 aceptor
    s6 = f'O[*:{o6}]' if o6 else 'O'                # O6 aceptor (ramificación)
    return f'C([C@@H]1[C@H]([C@@H]([C@H]({c1}(O1){s1})O)O){s4}){s6}'


def ensamblar(residuos):
    """residuos: lista de SMILES con puntos de unión. Devuelve mol con átomos marcados por residuo."""
    frags = []
    for i, s in enumerate(residuos):
        m = Chem.MolFromSmiles(s)
        for a in m.GetAtoms():
            if a.GetAtomicNum() > 0:
                a.SetIntProp('res', i + 1)
        frags.append(m)
    combo = frags[0]
    for f in frags[1:]:
        combo = Chem.CombineMols(combo, f)
    m = Chem.molzip(combo)
    Chem.SanitizeMol(m)
    return m


def torsiones_glucosidicas(mol):
    """Encuentra los enlaces glucosídicos C1–O–Cx y devuelve las cuaternas phi/psi (y omega para 1→6)."""
    patt14 = Chem.MolFromSmarts('[O;R:1][C;R:2]-[O;!R:3]-[C;R:4]-[C;R:5]')
    resultado = []
    ri = mol.GetRingInfo()
    for o5, c1, o, cx, cy in mol.GetSubstructMatches(patt14):
        r1 = mol.GetAtomWithIdx(c1).GetIntProp('res')
        rx = mol.GetAtomWithIdx(cx).GetIntProp('res')
        if r1 == rx:
            continue
        # cy debe ser C3 (no C5: el vecino de C4 que no tiene O de anillo)
        if any(n.GetAtomicNum() == 8 and n.IsInRing() for n in mol.GetAtomWithIdx(cy).GetNeighbors()):
            continue
        resultado.append(('1-4', (o5, c1, o, cx), (c1, o, cx, cy)))
    patt16 = Chem.MolFromSmarts('[O;R:1][C;R:2]-[O;!R:3]-[CH2;!R:4]-[C;R:5]-[O;R:6]')
    for o5, c1, o, c6, c5, o5b in mol.GetSubstructMatches(patt16):
        resultado.append(('1-6', (o5, c1, o, c6), (c1, o, c6, c5), (o, c6, c5, o5b)))
    return resultado


def medir_referencia(cid):
    m = Chem.MolFromMolFile(os.path.join(RAW, f'cid_{cid}.sdf'), removeHs=False)
    # marcar residuos: componentes conexas tras cortar el enlace C1–O glucosídico
    patt = Chem.MolFromSmarts('[O;R][C;R]-[O;!R]-[C]')
    o5, c1, o, cx = m.GetSubstructMatch(patt)
    conf = m.GetConformer()
    phi = T.GetDihedralDeg(conf, o5, c1, o, cx)
    if m.GetAtomWithIdx(cx).IsInRing():
        cy = [n.GetIdx() for n in m.GetAtomWithIdx(cx).GetNeighbors()
              if n.GetAtomicNum() == 6 and not any(k.GetAtomicNum() == 8 and k.IsInRing() for k in n.GetNeighbors())][0]
        psi = T.GetDihedralDeg(conf, c1, o, cx, cy)
        return phi, psi, None
    c5 = [n.GetIdx() for n in m.GetAtomWithIdx(cx).GetNeighbors() if n.GetAtomicNum() == 6][0]
    o5b = [n.GetIdx() for n in m.GetAtomWithIdx(c5).GetNeighbors() if n.GetAtomicNum() == 8 and n.IsInRing()][0]
    psi = T.GetDihedralDeg(conf, c1, o, cx, c5)
    omega = T.GetDihedralDeg(conf, o, cx, c5, o5b)
    return phi, psi, omega


def es_silla_4C1(mol, res):
    """Comprueba que el anillo de piranosa del residuo es una silla (torsiones alternas > 35º)."""
    ri = mol.GetRingInfo()
    for anillo in ri.AtomRings():
        if len(anillo) != 6:
            continue
        if mol.GetAtomWithIdx(anillo[0]).GetIntProp('res') != res:
            continue
        conf = mol.GetConformer()
        t = [T.GetDihedralDeg(conf, anillo[i], anillo[(i + 1) % 6], anillo[(i + 2) % 6], anillo[(i + 3) % 6]) for i in range(6)]
        if not all(abs(x) > 35 for x in t):
            return False
        if not all(np.sign(t[i]) != np.sign(t[(i + 1) % 6]) for i in range(6)):
            return False
        # 4C1 frente a 1C4: en 4C1 el CH2OH (C6) es ecuatorial → lejos del eje del anillo
        return True
    return False


def ecuatorial_c6(mol):
    """En la silla 4C1 de la D-glucosa el C6 es ecuatorial. Devuelve el nº de residuos con C6 axial."""
    X = coords(mol)
    axiales = 0
    for anillo in mol.GetRingInfo().AtomRings():
        if len(anillo) != 6:
            continue
        P = X[list(anillo)]
        c = P.mean(0)
        _, _, vt = np.linalg.svd(P - c)
        normal = vt[2]
        c5 = [i for i in anillo if mol.GetAtomWithIdx(i).GetAtomicNum() == 6 and
              any(n.GetAtomicNum() == 6 and not n.IsInRing() for n in mol.GetAtomWithIdx(i).GetNeighbors())]
        if not c5:
            continue
        c5 = c5[0]
        c6 = [n.GetIdx() for n in mol.GetAtomWithIdx(c5).GetNeighbors() if n.GetAtomicNum() == 6 and not n.IsInRing()][0]
        v = X[c6] - X[c5]
        v /= np.linalg.norm(v)
        if abs(v @ normal) > 0.7:
            axiales += 1
    return axiales


def construir_glucano(residuos, angulos, nombre, intentos=40):
    mol = Chem.AddHs(ensamblar(residuos))
    for a in mol.GetAtoms():
        if a.GetAtomicNum() == 1:
            a.SetIntProp('res', a.GetNeighbors()[0].GetIntProp('res'))
    mejor = None
    for semilla in range(intentos):
        ps = AllChem.ETKDGv3()
        ps.randomSeed = 1000 + semilla
        ps.useRandomCoords = True
        if AllChem.EmbedMolecule(mol, ps) != 0:
            continue
        conf = mol.GetConformer()
        tors = torsiones_glucosidicas(mol)
        restric = []
        for t in tors:
            tipo = t[0]
            phi, psi, omega = angulos[tipo]
            T.SetDihedralDeg(conf, *t[1], phi)
            T.SetDihedralDeg(conf, *t[2], psi)
            restric += [(t[1], phi), (t[2], psi)]
            if tipo == '1-6':
                T.SetDihedralDeg(conf, *t[3], omega)
                restric.append((t[3], omega))
        # pequeño refinamiento MMFF manteniendo phi/psi fijados
        props = AllChem.MMFFGetMoleculeProperties(mol)
        ff = AllChem.MMFFGetMoleculeForceField(mol, props)
        for (i, j, k, l), v in restric:
            ff.MMFFAddTorsionConstraint(i, j, k, l, False, v - 2, v + 2, 1000.0)
        ff.Minimize(maxIts=2000)
        nres = max(a.GetIntProp('res') for a in mol.GetAtoms())
        sillas = sum(es_silla_4C1(mol, r) for r in range(1, nres + 1))
        ax = ecuatorial_c6(mol)
        ch = choques(mol)
        puntos = (nres - sillas) * 10 + ax * 10 + ch
        print(f'  {nombre} semilla {semilla}: sillas {sillas}/{nres}, C6 axiales {ax}, choques {ch}')
        if mejor is None or puntos < mejor[0]:
            mejor = (puntos, Chem.Mol(mol))
        if puntos == 0:
            break
    return mejor[1]


def eje_helice(mol):
    """Eje de la hélice: eje de giro medio de la transformación entre anillos consecutivos."""
    X = coords(mol)
    anillos = sorted([r for r in mol.GetRingInfo().AtomRings() if len(r) == 6], key=lambda r: mol.GetAtomWithIdx(r[0]).GetIntProp('res'))
    ejes = []
    for a, b in zip(anillos[:-1], anillos[1:]):
        R, t = kabsch(X[list(a)], X[list(b)])
        w, v = np.linalg.eig(R)
        e = np.real(v[:, np.argmin(np.abs(w - 1))])
        if ejes and e @ ejes[0] < 0:
            e = -e
        ejes.append(e)
    e = np.mean(ejes, axis=0)
    return e / np.linalg.norm(e)


def orientar_en_x(mol):
    """Rota la molécula para que el eje de la hélice quede en x y la centra."""
    e = eje_helice(mol)
    x = np.array([1.0, 0, 0])
    v = np.cross(e, x); s_ = np.linalg.norm(v); c = e @ x
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    R = np.eye(3) + K + K @ K * ((1 - c) / (s_ ** 2)) if s_ > 1e-6 else np.eye(3)
    X = coords(mol)
    pes = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    return trasladar(mol, -(R @ X[pes].mean(0)), R)


def parametros_helice(mol):
    """Residuos por vuelta y avance por residuo a partir de los centroides de los anillos."""
    X = coords(mol)
    anillos = [r for r in mol.GetRingInfo().AtomRings() if len(r) == 6]
    anillos.sort(key=lambda r: mol.GetAtomWithIdx(r[0]).GetIntProp('res'))
    marcos = []
    for r in anillos:
        P = X[list(r)]
        marcos.append(P)
    # transformación entre residuos consecutivos (media)
    giros, avances = [], []
    for a, b in zip(marcos[:-1], marcos[1:]):
        R, t = kabsch(a, b)
        ang = np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1)))
        w, v = np.linalg.eig(R)
        eje = np.real(v[:, np.argmin(np.abs(w - 1))])
        avances.append(abs(t @ eje))
        giros.append(ang)
    g = np.mean(giros)
    return 360 / g if g > 1 else float('inf'), np.mean(avances)


def glucanos():
    ref14a = medir_referencia(439341)    # α-maltosa
    ref14b = medir_referencia(10712)     # celobiosa
    ref16 = medir_referencia(439193)     # isomaltosa
    print('phi/psi maltosa (PubChem 439341):', ref14a)
    print('phi/psi celobiosa (PubChem 10712):', ref14b)
    print('phi/psi/omega isomaltosa (PubChem 439193):', ref16)
    return ref14a, ref14b, ref16


if __name__ == '__main__' and 'medir' in sys.argv:
    glucanos()

# ------------------------------------------------------------------ lípidos

def cadenas_trans(mol, conf):
    """Pone en anti (180º) todas las torsiones C-C-C-C de cadenas hidrocarbonadas;
    junto a un doble enlace cis usa 120º (conformación sesgada habitual)."""
    fijadas = set()
    for b in mol.GetBonds():
        if b.GetBondType() != Chem.BondType.SINGLE or b.IsInRing():
            continue
        j, k = b.GetBeginAtom(), b.GetEndAtom()
        if j.GetAtomicNum() != 6 or k.GetAtomicNum() != 6:
            continue
        ij = [n for n in j.GetNeighbors() if n.GetAtomicNum() == 6 and n.GetIdx() != k.GetIdx()]
        kl = [n for n in k.GetNeighbors() if n.GetAtomicNum() == 6 and n.GetIdx() != j.GetIdx()]
        if not ij or not kl:
            continue
        # sólo cadenas CH2 (sin heteroátomos en j y k)
        if any(n.GetAtomicNum() not in (1, 6) for n in list(j.GetNeighbors()) + list(k.GetNeighbors())):
            continue
        i, l = ij[0].GetIdx(), kl[0].GetIdx()
        alilico = any(bb.GetBondType() == Chem.BondType.DOUBLE for a in (j, k) for bb in a.GetBonds())
        T.SetDihedralDeg(conf, i, j.GetIdx(), k.GetIdx(), l, 120.0 if alilico else 180.0)
        fijadas.add(b.GetIdx())
    return fijadas


def extremos_cadenas(mol):
    """Pares (C carbonilo, C metilo terminal) de cada cadena acilo."""
    carbonilos = [m[0] for m in mol.GetSubstructMatches(Chem.MolFromSmarts('[CX3](=O)[CH2]'))]
    metilos = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() == 6 and a.GetTotalNumHs() == 3
               and a.GetNeighbors()[0].GetAtomicNum() == 6 and a.GetDegree() == 4 and
               sum(n.GetAtomicNum() == 6 for n in a.GetNeighbors()) == 1]
    dm = Chem.GetDistanceMatrix(mol)
    pares = []
    for c in carbonilos:
        cand = [m for m in metilos if all(mol.GetAtomWithIdx(x).GetAtomicNum() in (6, 1) for x in [m])]
        m = min(cand, key=lambda x: dm[c, x] if dm[c, x] > 8 else 999)
        # el metilo de la misma cadena es el que está a distancia topológica = longitud de cadena
        pares.append((c, m))
    return pares


def construir_lipido(smiles, nombre, cabeza=None, muestras=6000, semilla=11):
    """Genera una conformación 'de libro': colas extendidas y paralelas, cabeza hacia el lado opuesto."""
    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    ps = AllChem.ETKDGv3(); ps.randomSeed = semilla; ps.useRandomCoords = True
    AllChem.EmbedMolecule(mol, ps)
    AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
    conf = mol.GetConformer()
    fijadas = cadenas_trans(mol, conf)
    # enlaces rotables restantes (cabeza y glicerol)
    rot = Chem.MolFromSmarts('[!$([NH])&!$([NH2])&!$([OH])&!$(*#*)&!D1]-&!@[!$([NH])&!$([NH2])&!$([OH])&!D1]')
    candidatos = []
    for j, k in mol.GetSubstructMatches(rot):
        b = mol.GetBondBetweenAtoms(j, k)
        if b.GetIdx() in fijadas:
            continue
        aj, ak = mol.GetAtomWithIdx(j), mol.GetAtomWithIdx(k)
        ni = [n.GetIdx() for n in aj.GetNeighbors() if n.GetIdx() != k and n.GetAtomicNum() > 1]
        nl = [n.GetIdx() for n in ak.GetNeighbors() if n.GetIdx() != j and n.GetAtomicNum() > 1]
        if not ni or not nl:
            continue
        # éster: O-C(=O) se mantiene en trans (Z)
        es_ester = {aj.GetAtomicNum(), ak.GetAtomicNum()} == {6, 8} and any(
            bb.GetBondType() == Chem.BondType.DOUBLE for a in (aj, ak) if a.GetAtomicNum() == 6 for bb in a.GetBonds())
        if es_ester:
            C = aj if aj.GetAtomicNum() == 6 else ak
            O = ak if C is aj else aj
            cn = [n.GetIdx() for n in C.GetNeighbors() if n.GetAtomicNum() == 6][0]
            on = [n.GetIdx() for n in O.GetNeighbors() if n.GetIdx() != C.GetIdx()][0]
            T.SetDihedralDeg(conf, cn, C.GetIdx(), O.GetIdx(), on, 180.0)
            continue
        candidatos.append((ni[0], j, k, nl[0]))
    dm = Chem.GetDistanceMatrix(mol)
    # cada cadena acilo: (C del carbonilo, C del metilo terminal unido sólo por carbonos)
    def n_h(a):
        return sum(n.GetAtomicNum() == 1 for n in a.GetNeighbors())
    metilos = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() == 6 and n_h(a) == 3
               and all(n.GetAtomicNum() in (1, 6) for n in a.GetNeighbors())]
    pares = []
    for c in [m[0] for m in mol.GetSubstructMatches(Chem.MolFromSmarts('[CX3](=O)[CX4]'))]:
        for mt in metilos:
            camino = Chem.GetShortestPath(mol, c, mt)
            if all(mol.GetAtomWithIdx(x).GetAtomicNum() == 6 for x in camino):
                pares.append((c, mt))
    pesados = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    lejos = dm[np.ix_(pesados, pesados)] > 3
    base = Chem.Conformer(conf)
    idx_cabeza = mol.GetSubstructMatch(Chem.MolFromSmarts(cabeza))[0] if cabeza else None

    def puntuar(c):
        X = np.array(c.GetPositions())
        P = X[pesados]
        D = np.linalg.norm(P[:, None] - P[None], axis=-1)
        choque = np.sum((D < 3.2) & lejos) / 2
        vec = [X[m] - X[cc] for cc, m in pares]
        vec = [v / np.linalg.norm(v) for v in vec]
        if len(vec) > 1:
            paral = np.mean([vec[i] @ vec[j] for i in range(len(vec)) for j in range(i + 1, len(vec))])
            centros = [X[list(Chem.GetShortestPath(mol, cc, m))].mean(0) for cc, m in pares]
            separ = np.mean([np.linalg.norm(centros[i] - centros[j]) for i in range(len(centros)) for j in range(i + 1, len(centros))])
        else:
            paral, separ = 1.0, 0.0
        punt = -choque * 3 + paral * 10 - max(0, separ - 5.0) * 2
        if idx_cabeza is not None:
            media = np.mean(vec, axis=0)
            centro_glicerol = np.mean([X[cc] for cc, _ in pares], axis=0)
            vh = X[idx_cabeza] - centro_glicerol
            vh /= np.linalg.norm(vh)
            punt += -(vh @ (media / np.linalg.norm(media))) * 6
        return punt, choque, paral, separ

    rng = random.Random(semilla)
    valores = {}
    mejor = None
    for s in range(muestras):
        c = Chem.Conformer(base)
        vals = [rng.choice([60.0, 180.0, -60.0, 120.0, -120.0]) for _ in candidatos]
        for t, v in zip(candidatos, vals):
            T.SetDihedralDeg(c, *t, v)
        r = puntuar(c)
        if mejor is None or r[0] > mejor[0][0]:
            mejor = (r, vals)
    # refinamiento local: se cambia una torsión cada vez y se acepta si mejora
    r, vals = mejor
    if candidatos:
        for it in range(muestras):
            prueba = list(vals)
            k = rng.randrange(len(candidatos))
            prueba[k] = prueba[k] + rng.uniform(-40, 40)
            c = Chem.Conformer(base)
            for t, v in zip(candidatos, prueba):
                T.SetDihedralDeg(c, *t, v)
            r2 = puntuar(c)
            if r2[0] >= r[0]:
                r, vals = r2, prueba
    c = Chem.Conformer(base)
    for t, v in zip(candidatos, vals):
        T.SetDihedralDeg(c, *t, v)
    mejor = (r[0], c, r[1], r[2], r[3])
    for i in range(mol.GetNumAtoms()):
        conf.SetAtomPosition(i, mejor[1].GetAtomPosition(i))
    print(f'  {nombre}: puntuación {mejor[0]:.1f}, choques {mejor[2]}, paralelismo {mejor[3]:.2f}, separación colas {mejor[4]:.1f} Å')
    return mol, pares


def alinear_eje(mol, desde, hacia):
    """Orienta la molécula para que el vector desde→hacia apunte a +z y la centra."""
    X = coords(mol)
    v = X[hacia] - X[desde]
    v /= np.linalg.norm(v)
    z = np.array([0, 0, 1.0])
    eje = np.cross(v, z)
    s = np.linalg.norm(eje)
    if s < 1e-6:
        R = np.eye(3) if v @ z > 0 else np.diag([1, -1, -1])
    else:
        eje /= s
        ang = np.arccos(np.clip(v @ z, -1, 1))
        K = np.array([[0, -eje[2], eje[1]], [eje[2], 0, -eje[0]], [-eje[1], eje[0], 0]])
        R = np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * K @ K
    Y = (R @ (X - X.mean(0)).T).T
    c = mol.GetConformer()
    for i, p in enumerate(Y):
        c.SetAtomPosition(i, p.tolist())


def trasladar(mol, v, R=None):
    m = Chem.Mol(mol)
    X = coords(m)
    if R is not None:
        X = (R @ X.T).T
    X = X + np.array(v)
    c = m.GetConformer()
    for i, p in enumerate(X):
        c.SetAtomPosition(i, p.tolist())
    return m


def rot_z(grados):
    a = np.radians(grados)
    return np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])

# ------------------------------------------------------------------ agua

def racimo_agua():
    """Agua central + 4 vecinas en disposición tetraédrica (O···O = 2,8 Å).
    Geometría experimental: O-H 0,9572 Å, ángulo 104,52º."""
    dOH, ang, dOO = 0.9572, np.radians(104.52), 2.80

    def agua(O, h_dir1, h_dir2):
        return [('O', O), ('H', O + dOH * h_dir1), ('H', O + dOH * h_dir2)]

    def unit(v):
        return v / np.linalg.norm(v)
    # direcciones tetraédricas aproximadas para la molécula central
    hA = unit(np.array([np.sin(ang / 2), 0, np.cos(ang / 2)]))
    hB = unit(np.array([-np.sin(ang / 2), 0, np.cos(ang / 2)]))
    pA = unit(np.array([0, np.sin(np.radians(109.47 / 2)), -np.cos(np.radians(109.47 / 2))]))   # pares solitarios
    pB = unit(np.array([0, -np.sin(np.radians(109.47 / 2)), -np.cos(np.radians(109.47 / 2))]))
    O0 = np.zeros(3)
    atomos = agua(O0, hA, hB)
    # vecinas aceptoras (reciben H de la central): situadas a lo largo de O-H
    for h in (hA, hB):
        O = O0 + dOO * h
        # sus H apuntan hacia fuera, formando ~104,5º, en un plano perpendicular aleatorio
        perp = unit(np.cross(h, [0, 1, 0]) if abs(h[1]) < 0.9 else np.cross(h, [1, 0, 0]))
        d1 = unit(h * np.cos(np.radians(180 - 125)) + perp * np.sin(np.radians(55)))
        # construir dos H con ángulo exacto alrededor del eje h
        eje = unit(h + 0.0)
        otro = unit(np.cross(eje, perp))
        semi = ang / 2
        inc = np.radians(125)   # inclinación respecto a la dirección del enlace de H recibido
        bis = unit(np.cos(np.radians(180 - 125)) * eje + np.sin(np.radians(180 - 125)) * perp)
        n = unit(np.cross(bis, otro))
        h1 = unit(np.cos(semi) * bis + np.sin(semi) * otro)
        h2 = unit(np.cos(semi) * bis - np.sin(semi) * otro)
        atomos += agua(O, h1, h2)
    # vecinas dadoras (dan un H a la central): situadas a lo largo de los pares solitarios
    for p in (pA, pB):
        O = O0 + dOO * p
        h1 = unit(-p)                       # H apuntando a la central (enlace lineal)
        perp = unit(np.cross(p, [1, 0, 0]))
        h2 = unit(np.cos(ang) * h1 + np.sin(ang) * perp)
        atomos += agua(O, h1, h2)
    rw = Chem.RWMol()
    conf = Chem.Conformer(len(atomos))
    for i, (e, p) in enumerate(atomos):
        idx = rw.AddAtom(Chem.Atom(e))
        conf.SetAtomPosition(idx, p.tolist())
        if e == 'H':
            rw.AddBond((i // 3) * 3, idx, Chem.BondType.SINGLE)
    m = rw.GetMol()
    m.AddConformer(conf)
    Chem.SanitizeMol(m)
    return m

# ------------------------------------------------------------ pares de bases

PLANTILLAS_BASE = {
    'DA': 'Cn1cnc2c(N)ncnc21', 'A': 'Cn1cnc2c(N)ncnc21',
    'DT': 'Cc1cn(C)c(=O)[nH]c1=O',
    'DG': 'Cn1cnc2c1nc(N)[nH]c2=O',
    'DC': 'Cn1ccc(N)nc1=O',
    'U': 'Cn1ccc(=O)[nH]c1=O',
}
ATOMOS_BASE = {"C1'", 'N1', 'C2', 'N3', 'C4', 'C5', 'C6', 'N6', 'N7', 'C8', 'N9', 'O2', 'O4', 'O6', 'N2', 'N4', 'C7', 'C5M'}


def extraer_base(pdbfile, cadena, resi):
    lineas = [l for l in open(pdbfile) if l.startswith(('ATOM', 'HETATM')) and l[21] == cadena
              and int(l[22:26]) == resi and l[12:16].strip() in ATOMOS_BASE and l[16] in ' A']
    resn = lineas[0][17:20].strip()
    m = Chem.MolFromPDBBlock(''.join(lineas), removeHs=True, sanitize=False, proximityBonding=True)
    plantilla = Chem.MolFromSmiles(PLANTILLAS_BASE[resn])
    m = AllChem.AssignBondOrdersFromTemplate(plantilla, m)
    m = Chem.AddHs(m, addCoords=True)
    # quitar los H añadidos sobre C1' (en la molécula real C1' está unido a la pentosa)
    c1 = [a.GetIdx() for a in m.GetAtoms() if a.GetPDBResidueInfo() and a.GetPDBResidueInfo().GetName().strip() == "C1'"][0]
    hs = sorted([n.GetIdx() for n in m.GetAtomWithIdx(c1).GetNeighbors() if n.GetAtomicNum() == 1], reverse=True)
    rw = Chem.RWMol(m)
    for h in hs:
        rw.RemoveAtom(h)
    m = rw.GetMol()
    m.UpdatePropertyCache(strict=False)
    return m, resn


def par_de_bases(pdbfile, a, b, nombre):
    m1, r1 = extraer_base(pdbfile, *a)
    m2, r2 = extraer_base(pdbfile, *b)
    return sdf_de(m1, f'{r1}{a[1]}') + sdf_de(m2, f'{r2}{b[1]}')

# ------------------------------------------------------------------- PDB

def limpiar_pdb(origen, cadenas=None, quitar=('HOH',)):
    """Conserva cabecera útil, estructura secundaria y coordenadas (sin aguas ni ANISOU)."""
    salida = []
    for l in open(origen):
        reg = l[:6].strip()
        if reg in ('HEADER', 'TITLE', 'COMPND', 'HELIX', 'SHEET', 'SSBOND', 'TER', 'END'):
            salida.append(l)
        elif reg in ('ATOM', 'HETATM'):
            if l[17:20].strip() in quitar:
                continue
            if cadenas and l[21] not in cadenas:
                continue
            salida.append(l)
    return ''.join(salida)

# ------------------------------------------------------------------- principal

def principal():
    # 1) Conformeros 3D de PubChem (se copian tal cual)
    pubchem = {
        'agua': 962, 'alfa_glucosa': 79025, 'beta_glucosa': 64689, 'glucosa_lineal': 107526,
        'fructosa': 439709, 'ribosa': 447347, 'desoxirribosa': 439576, 'sacarosa': 5988,
        'maltosa': 439341, 'colesterol': 5997, 'glicerol': 753,
        'glicina': 750, 'alanina': 5950, 'serina': 5951, 'cisteina': 5862, 'fenilalanina': 6140,
        'lisina': 5962, 'aspartico': 5960, 'gly_ala': 1551643,
        'amp': 6083, 'damp': 12599, 'atp': 5957,
        'adenina': 190, 'timina': 1135, 'citosina': 597, 'guanina': 135398634, 'uracilo': 1174,
        # monosacáridos y disacáridos añadidos
        'gliceraldehido': 79014, 'dihidroxiacetona': 670,
        'alfa_manosa': 185698, 'beta_manosa': 439680, 'manosa_lineal': 161658,
        'alfa_galactosa': 439357, 'beta_galactosa': 439353, 'galactosa_lineal': 3037556,
        'alfa_fructosa': 11105942, 'fructosa_lineal': 5984,
        'lactosa': 6134, 'celobiosa': 10712,
    }
    for clave, cid in pubchem.items():
        texto = open(os.path.join(RAW, f'cid_{cid}.sdf')).read()
        escribir_js(clave, 'sdf', texto)
    print('PubChem: ', len(pubchem), 'estructuras')

    # 2) Polisacáridos
    phi_a, psi_a = 103.0, 116.0       # V-amilosa, media del cristal PDB 1C58
    phi_b, psi_b = -98.0, 90.0        # celulosa Iβ (Wada et al. 2009)
    ref16 = medir_referencia(439193)  # isomaltosa PubChem
    import glucanos_rigidos as G
    n = 20
    amilosa = G.construir(['a'] * n, [(i + 1, i, 4, phi_a, psi_a) for i in range(n - 1)])
    print('  amilosa residuos/vuelta, avance:', parametros_helice(amilosa), 'choques:', G.choques(amilosa))
    amilosa = orientar_en_x(amilosa)
    escribir_js('amilosa', 'sdf', sdf_de(amilosa, 'amilosa (20 glucosas, alfa1-4)'))

    # amilopectina / glucógeno: cadena principal de 8 glucosas (0 = extremo reductor)
    # y rama de 4 glucosas unida por α1→6 al O6 del residuo 4
    enl = [(i + 1, i, 4, phi_a, psi_a) for i in range(7)]
    enl += [(8, 4, 6, ref16[0], ref16[1])] + [(i + 1, i, 4, phi_a, psi_a) for i in range(8, 11)]
    amilopectina = G.construir(['a'] * 12, enl)
    print('  amilopectina choques:', G.choques(amilopectina))
    escribir_js('amilopectina', 'sdf', sdf_de(amilopectina, 'amilopectina (rama alfa1-6)'))

    cel = G.construir(['b'] * 8, [(i + 1, i, 4, phi_b, psi_b) for i in range(7)])
    print('  celulosa residuos/vuelta, avance:', parametros_helice(cel), 'choques:', G.choques(cel))
    # orientar: eje de la cadena en x, plano de los anillos en xy
    X = coords(cel)
    pesados = [a.GetIdx() for a in cel.GetAtoms() if a.GetAtomicNum() > 1]
    c = X[pesados].mean(0)
    _, _, vt = np.linalg.svd(X[pesados] - c)
    R = vt  # filas = ejes principales → x (largo), y (ancho), z (grosor)
    cel = trasladar(cel, -R @ c, R)
    escribir_js('celulosa_cadena', 'sdf', sdf_de(cel, 'celulosa (8 glucosas, beta1-4)'))
    # lámina de 3 cadenas paralelas separadas 8,2 Å (parámetro b de la celulosa Iβ)
    lamina = ''.join(sdf_de(trasladar(cel, [0, dy, 0]), f'cadena {k + 1}') for k, dy in enumerate([-8.2, 0, 8.2]))
    escribir_js('celulosa', 'sdf', lamina, multi=True)

    # comparación almidón (hélice) vs celulosa (lineal), ambas a lo largo del eje x
    am2 = amilosa
    comp = sdf_de(trasladar(am2, [0, 12, 0]), 'amilosa') + sdf_de(trasladar(cel, [0, -8, 0]), 'celulosa')
    escribir_js('almidon_vs_celulosa', 'sdf', comp, multi=True)

    # 3) Lípidos
    est, _ = construir_lipido('CCCCCCCCCCCCCCCCCC(=O)O', 'esteárico', muestras=1)
    ole, _ = construir_lipido('CCCCCCCC/C=C\\CCCCCCCC(=O)O', 'oleico', muestras=1)
    for m in (est, ole):
        cs = [a.GetIdx() for a in m.GetAtoms() if a.GetAtomicNum() == 6]
        cooh = m.GetSubstructMatch(Chem.MolFromSmarts('C(=O)[OH]'))[0]
        metilo = max(cs, key=lambda x: Chem.GetDistanceMatrix(m)[cooh, x])
        alinear_eje(m, metilo, cooh)
    escribir_js('estearico', 'sdf', sdf_de(est, 'ácido esteárico (18:0)'))
    escribir_js('oleico', 'sdf', sdf_de(ole, 'ácido oleico (18:1 cis-9)'))
    escribir_js('acidos_grasos_comparar', 'sdf', sdf_de(trasladar(est, [-4, 0, 0]), 'esteárico') +
                sdf_de(trasladar(ole, [5, 0, 0]), 'oleico'), multi=True)

    # Triglicérido mixto: 1-palmitoil-2-oleoil-3-estearoil-glicerol
    tg, pares = construir_lipido('CCCCCCCCCCCCCCCC(=O)OCC(COC(=O)CCCCCCCCCCCCCCCCC)OC(=O)CCCCCCC/C=C\\CCCCCCCC',
                                 'triglicérido', muestras=8000)
    escribir_js('trigliceridos', 'sdf', sdf_de(tg, 'triacilglicerol POS'))

    # Fosfatidilcolina POPC (PubChem CID 5497103: estereoquímica sn-3)
    popc, pares = construir_lipido('CCCCCCCCCCCCCCCC(=O)OC[C@H](COP(=O)([O-])OCC[N+](C)(C)C)OC(=O)CCCCCCC/C=C\\CCCCCCCC',
                                   'POPC', cabeza='[N+](C)(C)C', muestras=8000)
    escribir_js('fosfolipido', 'sdf', sdf_de(popc, 'POPC'))

    # Bicapa esquemática con DPPC (PubChem CID 452110), 4x4 lípidos por monocapa
    dppc, pares = construir_lipido('CCCCCCCCCCCCCCCC(=O)OC[C@H](COP(=O)([O-])OCC[N+](C)(C)C)OC(=O)CCCCCCCCCCCCCCC',
                                   'DPPC', cabeza='[N+](C)(C)C', muestras=8000)
    p = dppc.GetSubstructMatch(Chem.MolFromSmarts('P'))[0]
    colas = [m for _, m in pares]
    X = coords(dppc)
    # eje: del punto medio de los metilos terminales al fósforo
    rw = Chem.RWMol(dppc)
    tmp = rw.AddAtom(Chem.Atom(0))
    rw.GetConformer().SetAtomPosition(tmp, X[colas].mean(0).tolist())
    alinear_eje(rw, tmp, p)
    Xr = coords(rw)
    zmin = Xr[colas].mean(0)[2]
    rw.RemoveAtom(tmp)
    dppc = rw.GetMol()
    dppc = trasladar(dppc, [0, 0, -zmin + 1.0])   # colas terminan en z ≈ +1 Å
    Xd = coords(dppc)
    ancho = np.ptp(Xd[:, :2], axis=0)
    def montar(paso, giro):
        bl = []
        for capa, signo in (('superior', 1), ('inferior', -1)):
            for i in range(4):
                for j in range(4):
                    Rz = rot_z(giro * ((i + j) % 2))
                    R = Rz if signo == 1 else np.diag([1, -1, -1]) @ Rz
                    bl.append(trasladar(dppc, [i * paso + (signo < 0) * paso / 2, j * paso + (signo < 0) * paso / 2, 0], R))
        allX = np.vstack([coords(b)[[a.GetIdx() for a in b.GetAtoms() if a.GetAtomicNum() > 1]] for b in bl])
        et = np.repeat(np.arange(len(bl)), [sum(a.GetAtomicNum() > 1 for a in b.GetAtoms()) for b in bl])
        D = np.linalg.norm(allX[:, None] - allX[None], axis=-1)
        return bl, D[et[:, None] != et[None]].min()
    elegido = None
    for paso in np.arange(7.0, 12.01, 0.25):
        for giro in (0, 90, 180):
            bl, dmin = montar(paso, giro)
            if dmin >= 3.0:
                elegido = (paso, giro, bl, dmin)
                break
        if elegido:
            break
    paso, giro, bloques, dmin = elegido
    print(f'  bicapa: paso {paso} Å, giro alterno {giro}º, distancia mínima entre lípidos {dmin:.2f} Å')
    escribir_js('bicapa', 'sdf', ''.join(sdf_de(b, f'DPPC {i + 1}') for i, b in enumerate(bloques)), multi=True)

    # 4) Agua: racimo de puentes de hidrógeno
    escribir_js('agua_racimo', 'sdf', sdf_de(racimo_agua(), 'racimo de 5 moléculas de agua'))

    # 5) Pares de bases reales extraídos de cristales
    escribir_js('par_AT', 'sdf', par_de_bases(os.path.join(RAW, '1BNA.pdb'), ('A', 5), ('B', 20), 'A-T'), multi=True)
    escribir_js('par_GC', 'sdf', par_de_bases(os.path.join(RAW, '1BNA.pdb'), ('A', 4), ('B', 21), 'G-C'), multi=True)
    escribir_js('par_AU', 'sdf', par_de_bases(os.path.join(RAW, '1EHZ.pdb'), ('A', 5), ('A', 68), 'A-U'), multi=True)

    # 6) Macromoléculas de RCSB PDB (sin aguas)
    escribir_js('4HHB', 'pdb', limpiar_pdb(os.path.join(RAW, '4HHB.pdb')))
    escribir_js('4INS', 'pdb', limpiar_pdb(os.path.join(RAW, '4INS.pdb'), cadenas='AB', quitar=('HOH', 'ZN')))
    escribir_js('1HEW', 'pdb', limpiar_pdb(os.path.join(RAW, '1HEW.pdb')))
    escribir_js('1LYZ', 'pdb', limpiar_pdb(os.path.join(RAW, '1LYZ.pdb')))
    escribir_js('1BNA', 'pdb', limpiar_pdb(os.path.join(RAW, '1BNA.pdb')))
    escribir_js('1EHZ', 'pdb', limpiar_pdb(os.path.join(RAW, '1EHZ.pdb')))
    escribir_js('1PGA', 'pdb', limpiar_pdb(os.path.join(RAW, '1PGA.pdb')))
    print('Listo.')


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if __name__ == '__main__' and 'medir' not in sys.argv:
    principal()
