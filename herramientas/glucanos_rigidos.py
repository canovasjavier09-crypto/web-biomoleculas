"""
Construcción de polisacáridos con residuos RÍGIDOS copiados de los conformeros
3D de PubChem (α-D-glucosa CID 79025, β-D-glucosa CID 64689; silla 4C1).
Cada residuo «donador» (aporta su C1) se coloca sobre el O4 (o el O6) del
residuo «aceptor» imponiendo:
    ángulo C1–O–Cx = 117º, φ = O5–C1–O–Cx, ψ = C1–O–Cx–C(x-1)
En la condensación se eliminan el O1–H del donador y el H del hidroxilo aceptor.
"""
import os
import numpy as np
from rdkit import Chem

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(RAIZ, 'datos_raw')
ANG_GLUC = 117.0
# orden de los átomos pesados en el patrón (sin estereoquímica):
PATRON = Chem.MolFromSmarts('C(C1C(C(C(C(O1)O)O)O)O)O')
NOMBRES = ['C6', 'C5', 'C4', 'C3', 'C2', 'C1', 'O5', 'O1', 'O2', 'O3', 'O4', 'O6']


def plantilla(cid):
    m = Chem.MolFromMolFile(os.path.join(RAW, f'cid_{cid}.sdf'), removeHs=False)
    idx = dict(zip(NOMBRES, m.GetSubstructMatch(PATRON)))
    # H de cada hidroxilo
    for o in ('O1', 'O2', 'O3', 'O4', 'O6'):
        idx['H' + o] = [n.GetIdx() for n in m.GetAtomWithIdx(idx[o]).GetNeighbors() if n.GetAtomicNum() == 1][0]
    return m, idx


def nerf(a, b, c, enlace, angulo, diedro):
    """Posición de d tal que |cd| = enlace, ∠bcd = angulo, diedro abcd = diedro (grados)."""
    ang, die = np.radians(angulo), np.radians(diedro)
    bc = c - b; bc /= np.linalg.norm(bc)
    n = np.cross(b - a, bc); n /= np.linalg.norm(n)
    m = np.cross(n, bc)
    d2 = np.array([-enlace * np.cos(ang), enlace * np.sin(ang) * np.cos(die), enlace * np.sin(ang) * np.sin(die)])
    return c + d2[0] * bc + d2[1] * m + d2[2] * n


def kabsch(P, Q):
    Pc, Qc = P.mean(0), Q.mean(0)
    H = (P - Pc).T @ (Q - Qc)
    U, S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ np.diag([1, 1, d]) @ U.T
    return R, Qc - R @ Pc


def angulo(a, b, c):
    u, v = a - b, c - b
    return np.degrees(np.arccos(u @ v / np.linalg.norm(u) / np.linalg.norm(v)))


def construir(residuos, enlaces, nombre=''):
    """
    residuos: lista de 'a' / 'b' (anómero). El residuo 0 se coloca primero (extremo reductor).
    enlaces: lista de (donador, aceptor, posicion 4|6, phi, psi) en orden de construcción;
             el aceptor ya debe estar colocado.
    Devuelve una molécula RDKit con coordenadas y la propiedad 'res' (1..n) en cada átomo.
    """
    plant = {'a': plantilla(79025), 'b': plantilla(64689)}
    X = {}
    X[0] = plant[residuos[0]][0].GetConformer().GetPositions()
    quitar = {i: set() for i in range(len(residuos))}
    for don, acc, pos, phi, psi in enlaces:
        md, idd = plant[residuos[don]]
        ma, ida = plant[residuos[acc]]
        Xd = md.GetConformer().GetPositions()
        Xa = X[acc]
        if pos == 4:
            prev2, prev1, O = Xa[ida['C3']], Xa[ida['C4']], Xa[ida['O4']]
            hO = 'HO4'
        else:
            prev2, prev1, O = Xa[ida['C5']], Xa[ida['C6']], Xa[ida['O6']]
            hO = 'HO6'
        dCO = np.linalg.norm(Xd[idd['C1']] - Xd[idd['O1']])
        dC1O5 = np.linalg.norm(Xd[idd['C1']] - Xd[idd['O5']])
        aOCO5 = angulo(Xd[idd['O1']], Xd[idd['C1']], Xd[idd['O5']])
        C1 = nerf(prev2, prev1, O, dCO, ANG_GLUC, psi)       # ψ = C(x-1)–Cx–O–C1
        O5 = nerf(prev1, O, C1, dC1O5, aOCO5, phi)           # φ = Cx–O–C1–O5
        R, t = kabsch(Xd[[idd['O1'], idd['C1'], idd['O5']]], np.array([O, C1, O5]))
        X[don] = (R @ Xd.T).T + t
        quitar[don] |= {idd['O1'], idd['HO1']}
        quitar[acc] |= {ida[hO]}
        enlaces_por_hacer = None
    # ensamblar molécula
    rw = Chem.RWMol()
    conf = Chem.Conformer()
    mapa = {}
    for r, an in enumerate(residuos):
        m, idx = plant[an]
        for a in m.GetAtoms():
            if a.GetIdx() in quitar[r]:
                continue
            na = Chem.Atom(a.GetAtomicNum())
            na.SetIntProp('res', r + 1)
            k = rw.AddAtom(na)
            mapa[(r, a.GetIdx())] = k
        for b in m.GetBonds():
            i, j = b.GetBeginAtomIdx(), b.GetEndAtomIdx()
            if (r, i) in mapa and (r, j) in mapa:
                rw.AddBond(mapa[(r, i)], mapa[(r, j)], b.GetBondType())
    for don, acc, pos, phi, psi in enlaces:
        idd = plant[residuos[don]][1]
        ida = plant[residuos[acc]][1]
        rw.AddBond(mapa[(don, idd['C1'])], mapa[(acc, ida['O4' if pos == 4 else 'O6'])], Chem.BondType.SINGLE)
    conf = Chem.Conformer(rw.GetNumAtoms())
    for (r, i), k in mapa.items():
        conf.SetAtomPosition(k, X[r][i].tolist())
    mol = rw.GetMol()
    mol.AddConformer(conf, assignId=True)
    Chem.SanitizeMol(mol)
    Chem.AssignStereochemistryFrom3D(mol)
    return mol


def choques(mol, umbral=2.6):
    """Pares de átomos pesados de residuos distintos, no enlazados (>3 enlaces), más cerca de 'umbral'."""
    X = mol.GetConformer().GetPositions()
    dm = Chem.GetDistanceMatrix(mol)
    pes = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    malos = []
    for ii, i in enumerate(pes):
        for j in pes[ii + 1:]:
            if dm[i, j] > 3 and np.linalg.norm(X[i] - X[j]) < umbral:
                malos.append((i, j, round(float(np.linalg.norm(X[i] - X[j])), 2)))
    hs = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() == 1]
    malos_h = sum(1 for i in hs for j in range(mol.GetNumAtoms()) if j != i and dm[i, j] > 3 and np.linalg.norm(X[i] - X[j]) < 1.5)
    return malos, malos_h
