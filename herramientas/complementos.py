"""
complementos.py  (ejecutar DESPUÉS de construir_modelos.py)
--------------------------------------------------------------
1. Animaciones de ciclación de la glucosa y la fructosa (α y β), a partir de las
   formas cíclicas REALES de PubChem:
      α-D-glucopiranosa CID 79025, β-D-glucopiranosa CID 64689,
      α-D-fructofuranosa CID 11105942, β-D-fructofuranosa CID 439709.
   La forma abierta se obtiene "deshaciendo" el hemiacetal/hemicetal en la
   misma molécula (mismos átomos): se rompe C anomérico–O del anillo, el C–O
   exocíclico pasa a C=O y su H vuelve al O del anillo. Fotogramas:
      cadena extendida (zigzag) → cadena plegada (O del anillo a ~2,9 Å del
      C carbonílico) → anillo cerrado (coordenadas de PubChem).
   El plegado se interpola en ángulos de torsión (longitudes y ángulos de
   enlace correctos en todos los fotogramas).
2. Coordenadas 2D (RDKit) con cuñas de estereoquímica para TODAS las
   estructuras SDF, con y sin hidrógenos, para la vista 2D de la web.
"""
import os, sys, json, glob, re
import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem, rdMolTransforms as T, rdDepictor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from construir_modelos import RAW, OUT, escribir_js, kabsch, coords

rdDepictor.SetPreferCoordGen(True)

# ----------------------------------------------------------------- ciclación

def roles(mol):
    """C anomérico, O del anillo, O exocíclico del C anomérico y su H."""
    for a in mol.GetAtoms():
        if a.GetSymbol() != 'C' or not a.IsInRing():
            continue
        os_ = [n for n in a.GetNeighbors() if n.GetSymbol() == 'O']
        oan = [o for o in os_ if o.IsInRing()]
        oex = [o for o in os_ if not o.IsInRing()]
        if len(oan) == 1 and len(oex) == 1:
            h = [n.GetIdx() for n in oex[0].GetNeighbors() if n.GetSymbol() == 'H']
            return a.GetIdx(), oan[0].GetIdx(), oex[0].GetIdx(), h[0]
    raise ValueError('sin carbono anomérico')


def abrir(cyc, ca, oan, oex, h):
    rw = Chem.RWMol(cyc)
    rw.RemoveBond(ca, oan)
    rw.GetBondBetweenAtoms(ca, oex).SetBondType(Chem.BondType.DOUBLE)
    rw.RemoveBond(oex, h)
    rw.AddBond(oan, h, Chem.BondType.SINGLE)
    m = rw.GetMol()
    for a in m.GetAtoms():
        a.SetNoImplicit(True); a.SetNumExplicitHs(0)
    Chem.SanitizeMol(m)
    return m


def cadena_carbonos(m):
    cs = [a.GetIdx() for a in m.GetAtoms() if a.GetSymbol() == 'C']
    dm = Chem.GetDistanceMatrix(m)
    a, b = max(((i, j) for i in cs for j in cs), key=lambda p: dm[p])
    camino = list(Chem.GetShortestPath(m, a, b))
    return camino


def torsiones(m):
    """Cuaternas (i,j,k,l) de todos los enlaces simples rotables, sin anillos."""
    out = []
    for b in m.GetBonds():
        if b.GetBondType() != Chem.BondType.SINGLE or b.IsInRing():
            continue
        j, k = b.GetBeginAtom(), b.GetEndAtom()
        if j.GetDegree() < 2 or k.GetDegree() < 2:
            continue
        pi = sorted([n for n in j.GetNeighbors() if n.GetIdx() != k.GetIdx()], key=lambda n: -n.GetAtomicNum())
        pl = sorted([n for n in k.GetNeighbors() if n.GetIdx() != j.GetIdx()], key=lambda n: -n.GetAtomicNum())
        out.append((pi[0].GetIdx(), j.GetIdx(), k.GetIdx(), pl[0].GetIdx()))
    return out


def ciclacion(cid, clave, nombre):
    cyc = Chem.MolFromMolFile(os.path.join(RAW, f'cid_{cid}.sdf'), removeHs=False)
    ca, oan, oex, h = roles(cyc)
    abierta = abrir(cyc, ca, oan, oex, h)
    Xc = coords(cyc)
    # 1) cadena plegada: se parte del anillo y se relaja con el C anomérico a ~2,9 Å del O
    plegada = Chem.Mol(abierta)
    conf = plegada.GetConformer()
    v = Xc[oan] - Xc[ca]; v /= np.linalg.norm(v)
    conf.SetAtomPosition(h, (Xc[oan] + 0.97 * v).tolist())
    props = AllChem.MMFFGetMoleculeProperties(plegada)
    ff = AllChem.MMFFGetMoleculeForceField(plegada, props)
    ff.MMFFAddDistanceConstraint(ca, oan, False, 2.85, 2.95, 200.0)
    for a in plegada.GetAtoms():
        if a.IsInRing() or a.GetSymbol() == 'H':
            continue
    anillo_ref = [i for i in range(plegada.GetNumAtoms()) if cyc.GetAtomWithIdx(i).IsInRing() and i not in (ca,)]
    for i in anillo_ref:
        ff.MMFFAddPositionConstraint(i, 0.4, 50.0)
    ff.Minimize(maxIts=3000)
    Xp = coords(plegada)
    # 2) cadena extendida: esqueleto carbonado en zigzag (torsiones a 180º)
    extendida = Chem.Mol(plegada)
    ce = extendida.GetConformer()
    cad = cadena_carbonos(extendida)
    esq = [tuple(cad[i:i + 4]) for i in range(len(cad) - 3)]
    for q in esq:
        T.SetDihedralDeg(ce, *q, 180.0)
    props = AllChem.MMFFGetMoleculeProperties(extendida)
    ff = AllChem.MMFFGetMoleculeForceField(extendida, props)
    for q in esq:
        ff.MMFFAddTorsionConstraint(*q, False, 175.0, 185.0, 100.0)
    ff.Minimize(maxIts=3000)
    # 3) fotogramas: interpolación de todas las torsiones extendida → plegada
    tors = torsiones(abierta)
    t_ext = [T.GetDihedralDeg(extendida.GetConformer(), *q) for q in tors]
    t_ple = [T.GetDihedralDeg(plegada.GetConformer(), *q) for q in tors]
    ref = [i for i in anillo_ref if cyc.GetAtomWithIdx(i).GetSymbol() != 'H']
    frames = []
    N1, N2 = 36, 14
    for f in range(N1 + 1):
        t = f / N1
        t = t * t * (3 - 2 * t)
        m = Chem.Mol(extendida)
        c = m.GetConformer()
        for q, a0, a1 in zip(tors, t_ext, t_ple):
            d = (a1 - a0 + 180) % 360 - 180
            T.SetDihedralDeg(c, *q, a0 + d * t)
        X = coords(m)
        R, tr = kabsch(X[ref], Xp[ref])
        frames.append((R @ X.T).T + tr)
    # corrección final suave para llegar exactamente a la plegada minimizada
    delta = Xp - frames[-1]
    frames = [F + delta * (k / N1) ** 2 for k, F in enumerate(frames)]
    # 4) cierre del anillo: interpolación cartesiana plegada → cíclica (PubChem)
    R, tr = kabsch(Xc[ref], Xp[ref])
    Xcc = (R @ Xc.T).T + tr
    for f in range(1, N2 + 1):
        t = f / N2
        t = t * t * (3 - 2 * t)
        frames.append(Xp + (Xcc - Xp) * t)
    saltos = [np.linalg.norm(frames[k + 1] - frames[k], axis=1).max() for k in range(len(frames) - 1)]
    print(f'  {clave}: {len(frames)} fotogramas, desplazamiento máx. entre fotogramas {max(saltos):.2f} Å, '
          f'C–O del anillo plegado {np.linalg.norm(Xp[ca] - Xp[oan]):.2f} Å')
    # topologías
    def enlaces(m):
        return [[b.GetBeginAtomIdx(), b.GetEndAtomIdx(), int(b.GetBondTypeAsDouble())] for b in m.GetBonds()]
    ext_m = Chem.Mol(abierta)
    ce = ext_m.GetConformer()
    for i, p in enumerate(frames[0]):
        ce.SetAtomPosition(i, p.tolist())
    ext_m.SetProp('_Name', nombre)
    texto = Chem.MolToMolBlock(ext_m) + '$$$$\n'
    extra = {'ciclacion': {
        'fotogramas': [np.round(F, 3).flatten().tolist() for F in frames],
        'plegado': N1, 'enlacesAbierta': enlaces(abierta), 'enlacesCerrada': enlaces(cyc),
        'anomerico': ca, 'oAnillo': oan, 'oExo': oex, 'h': h,
    }}
    escribir_js(clave, 'sdf', texto, extra=extra)

# ----------------------------------------------------------------- 2D

def dos_d_registro(m):
    """Coordenadas 2D (con H y sin H) y cuñas de estereoquímica de una molécula."""
    m = Chem.Mol(m)
    Chem.AssignStereochemistryFrom3D(m)
    for a in m.GetAtoms():
        a.SetIntProp('orig', a.GetIdx())
    con_h = Chem.Mol(m)
    con_h.RemoveAllConformers()
    rdDepictor.Compute2DCoords(con_h)
    Chem.WedgeMolBonds(con_h, con_h.GetConformer())
    sin_h = Chem.RemoveHs(m)
    sin_h.RemoveAllConformers()
    rdDepictor.Compute2DCoords(sin_h)
    Chem.WedgeMolBonds(sin_h, sin_h.GetConformer())

    def datos(mm):
        c = mm.GetConformer()
        xy = {mm.GetAtomWithIdx(i).GetIntProp('orig'): [round(c.GetAtomPosition(i).x, 2), round(-c.GetAtomPosition(i).y, 2)] for i in range(mm.GetNumAtoms())}
        cunas = []
        for b in mm.GetBonds():
            d = b.GetBondDir()
            if d in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH):
                cunas.append([b.GetBeginAtom().GetIntProp('orig'), b.GetEndAtom().GetIntProp('orig'), 'w' if d == Chem.BondDir.BEGINWEDGE else 'h'])
        return xy, cunas
    return datos(con_h), datos(sin_h), m.GetNumAtoms()


def anadir_2d():
    n = 0
    for ruta in sorted(glob.glob(os.path.join(OUT, '*.js'))):
        txt = open(ruta).read()
        mt = re.search(r'window\.registrarEstructura\((".*?"), (\{.*\})\);\s*$', txt, re.S)
        clave, obj = json.loads(mt.group(1)), json.loads(mt.group(2))
        if obj['formato'] != 'sdf':
            continue
        bloques = [b[1:] if b.startswith('\n') else b for b in obj['datos'].split('$$$$') if b.strip()]
        if sum(int(b.split('\n')[3][:3]) for b in bloques) > 1000:
            obj.pop('d2', None)
        else:
            todo_h, todo_s, cunas_h, cunas_s = [], [], [], []
            base, dx = 0, 0.0
            for b in bloques:
                m = Chem.MolFromMolBlock(b, removeHs=False)
                (xy_h, cu_h), (xy_s, cu_s), na = dos_d_registro(m)
                # desplazar cada molécula a la derecha de la anterior
                def colocar(xy, lista):
                    xs = [p[0] for p in xy.values()]
                    off = dx - min(xs)
                    for i in range(na):
                        lista.append([round(xy[i][0] + off, 2), xy[i][1]] if i in xy else None)
                    return max(xs) + off
                fin_h = colocar(xy_h, todo_h)
                colocar(xy_s, todo_s)
                cunas_h += [[i + base, j + base, t] for i, j, t in cu_h]
                cunas_s += [[i + base, j + base, t] for i, j, t in cu_s]
                base += na
                dx = fin_h + 3.0
            obj['d2'] = {'conH': todo_h, 'sinH': todo_s, 'cunasH': cunas_h, 'cunasSinH': cunas_s}
            n += 1
        with open(ruta, 'w') as f:
            f.write(f'/* Estructura "{clave}" (generada por herramientas/) */\n')
            f.write(f'window.registrarEstructura({json.dumps(clave)}, {json.dumps(obj)});\n')
    print(f'2D añadido a {n} estructuras')


if __name__ == '__main__':
    ciclacion(79025, 'cicl_glucosa_a', 'D-glucosa: ciclación a α-D-glucopiranosa')
    ciclacion(64689, 'cicl_glucosa_b', 'D-glucosa: ciclación a β-D-glucopiranosa')
    ciclacion(11105942, 'cicl_fructosa_a', 'D-fructosa: ciclación a α-D-fructofuranosa')
    ciclacion(439709, 'cicl_fructosa_b', 'D-fructosa: ciclación a β-D-fructofuranosa')
    anadir_2d()
