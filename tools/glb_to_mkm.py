#!/usr/bin/env python3
"""Decimate a huge (e.g. Nomad Sculpt) GLB into a game-ready multi-part .mkm by
vertex clustering, keeping each mesh as a named part and preserving painted
vertex colors. Pure Python, no dependencies.

Usage: python3 tools/glb_to_mkm.py input.glb output.mkm [target_vertices_total]

MKM2 layout (little endian):
  b'MKM2', uint32 nParts, then per part:
  uint8 nameLen, name bytes, uint32 nVerts, uint32 nTris, uint8 hasColor,
  float32[nVerts*3] positions, (uint8[nVerts*3] sRGB colors if hasColor), uint32[nTris*3] indices
"""
import json
import struct
import sys
from array import array

CT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
NORM = {5121: 255.0, 5123: 65535.0, 5126: 1.0}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def mat_mul(a, b):
    # column-major 4x4, like glTF
    return [sum(a[r + 4 * k] * b[k + 4 * c] for k in range(4)) for c in range(4) for r in range(4)]


def local_matrix(n):
    if 'matrix' in n:
        return n['matrix']
    tx, ty, tz = n.get('translation', [0, 0, 0])
    qx, qy, qz, qw = n.get('rotation', [0, 0, 0, 1])
    sx, sy, sz = n.get('scale', [1, 1, 1])
    return [(1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
            2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
            2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
            tx, ty, tz, 1]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    target = int(sys.argv[3]) if len(sys.argv) > 3 else 90000
    with open(src, 'rb') as f:
        data = f.read()
    jl = struct.unpack_from('<I', data, 12)[0]
    j = json.loads(data[20:20 + jl])
    bo = 20 + jl
    bl = struct.unpack_from('<I', data, bo)[0]
    binc = memoryview(data)[bo + 8: bo + 8 + bl]

    def read(ai):
        """flat array of an accessor's components, plus its component count"""
        a = j['accessors'][ai]
        bv = j['bufferViews'][a['bufferView']]
        code = CT[a['componentType']]
        n = NC[a['type']]
        size = array(code).itemsize
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', size * n)
        out = array(code)
        if stride == size * n:
            out.frombytes(binc[off: off + a['count'] * n * size])
        else:
            for i in range(a['count']):
                out.frombytes(binc[off + i * stride: off + i * stride + n * size])
        return out, n, a

    # world matrices (Nomad parents every mesh to a skewed 'nomad_unskew' node)
    world = {}

    def walk(ni, parent):
        world[ni] = mat_mul(parent, local_matrix(j['nodes'][ni]))
        for c in j['nodes'][ni].get('children', []):
            walk(c, world[ni])
    for ni in j['scenes'][j.get('scene', 0)]['nodes']:
        walk(ni, IDENT)

    parts = []
    for ni, node in enumerate(j['nodes']):
        if 'mesh' not in node or ni not in world:
            continue
        mesh = j['meshes'][node['mesh']]
        prims = mesh['primitives']
        pos, _, _ = read(prims[0]['attributes']['POSITION'])
        col = None
        if 'COLOR_0' in prims[0]['attributes']:
            c, cn, ca = read(prims[0]['attributes']['COLOR_0'])
            col = (c, cn, NORM[ca['componentType']])
        idx = array('I')
        for p in prims:  # primitives share the vertex buffer and split the faces
            if p['attributes']['POSITION'] != prims[0]['attributes']['POSITION']:
                continue
            ii, _, _ = read(p['indices'])
            idx.extend(ii)
        m = world[ni]
        if m != IDENT:
            for i in range(0, len(pos), 3):
                x, y, z = pos[i], pos[i + 1], pos[i + 2]
                pos[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
                pos[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
                pos[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
        name = (mesh.get('name') or node.get('name') or 'part').strip()
        parts.append({'name': name, 'pos': pos, 'col': col, 'idx': idx})
        print(f'part {name}: {len(pos) // 3} verts, {len(idx) // 3} tris, color={"yes" if col else "no"}', flush=True)

    total = sum(len(p['pos']) // 3 for p in parts)
    lo, hi = [1e30] * 3, [-1e30] * 3
    for p in parts:
        ps = p['pos']
        for a in range(3):
            s = ps[a::3]
            lo[a] = min(lo[a], min(s)); hi[a] = max(hi[a], max(s))
    size = max(hi[a] - lo[a] for a in range(3))
    print('bounds', [round(x, 3) for x in lo], [round(x, 3) for x in hi], flush=True)

    def cluster(p, c):
        ps = p['pos']
        nv = len(ps) // 3
        inv = 1.0 / c
        cells = {}
        remap = array('I', bytes(4 * nv))
        acc = []
        for i in range(nv):
            x, y, z = ps[3 * i], ps[3 * i + 1], ps[3 * i + 2]
            key = (int(x * inv + 1e6), int(y * inv + 1e6), int(z * inv + 1e6))
            k = cells.get(key)
            if k is None:
                k = len(acc)
                cells[key] = k
                acc.append([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0])
            e = acc[k]
            e[0] += x; e[1] += y; e[2] += z; e[6] += 1
            remap[i] = k
        if p['col']:
            cs, cn, norm = p['col']
            for i in range(nv):
                e = acc[remap[i]]
                e[3] += cs[cn * i]; e[4] += cs[cn * i + 1]; e[5] += cs[cn * i + 2]
        tris = set()
        ix = p['idx']
        for t in range(0, len(ix) - 2, 3):
            a, b, d = remap[ix[t]], remap[ix[t + 1]], remap[ix[t + 2]]
            if a == b or b == d or a == d:
                continue
            tris.add((a, b, d) if a < b and a < d else (b, d, a) if b < d else (d, a, b))
        verts = array('f')
        cols = bytearray()
        for e in acc:
            verts.extend((e[0] / e[6], e[1] / e[6], e[2] / e[6]))
            if p['col']:
                for k in (3, 4, 5):
                    lin = max(0.0, min(1.0, e[k] / e[6] / p['col'][2]))
                    cols.append(int(lin ** (1 / 2.2) * 255 + 0.5))  # store sRGB for precision in the darks
        return verts, (cols if p['col'] else None), tris

    # estimate the cell size from a cheap pass on the biggest part, then refine
    cell = size / 240.0
    for attempt in range(5):
        out = []
        nv = 0
        for p in parts:
            # faces and eyes keep a finer grid so they stay readable
            small = len(p['pos']) // 3 < 0.03 * total
            fine = 0.35 if small else 0.5 if 'head' in p['name'].lower() else 1.0
            v, c, t = cluster(p, cell * fine)
            out.append((p['name'], v, c, t))
            nv += len(v) // 3
        print(f'cell {cell:.5f}: {nv} verts', flush=True)
        if nv <= target * 1.15 and (nv >= target * 0.7 or attempt == 4):
            break
        cell *= (nv / target) ** 0.5

    with open(dst, 'wb') as f:
        f.write(b'MKM2')
        f.write(struct.pack('<I', len(out)))
        for name, verts, cols, tris in out:
            nb = name.encode('utf-8')[:255]
            f.write(struct.pack('<B', len(nb)))
            f.write(nb)
            f.write(struct.pack('<IIB', len(verts) // 3, len(tris), 1 if cols else 0))
            f.write(verts.tobytes())
            if cols:
                f.write(bytes(cols))
            ia = array('I')
            for t in tris:
                ia.extend(t)
            f.write(ia.tobytes())
    for name, verts, cols, tris in out:
        avg = [round(sum(cols[k::3]) / max(1, len(cols) // 3)) for k in range(3)] if cols else None
        print(f'  {name}: {len(verts) // 3} verts, {len(tris)} tris, avg sRGB {avg}')
    print('wrote', dst)


if __name__ == '__main__':
    main()
