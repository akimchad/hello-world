#!/usr/bin/env python3
"""Turn a huge binary STL into a game-ready indexed mesh (.mkm) by vertex
clustering. Pure Python, no dependencies.

Usage: python3 tools/decimate_stl.py input.stl output.mkm [target_vertices]

.mkm layout (little endian): b'MKM1', uint32 nVerts, uint32 nTris,
float32[nVerts*3] positions, uint32[nTris*3] indices.
"""
import struct
import sys


def read_stl(path):
    with open(path, 'rb') as f:
        f.read(80)
        n = struct.unpack('<I', f.read(4))[0]
        data = f.read(50 * n)
    return n, data


def decimate(n, data, cell):
    clusters = {}   # cell key -> [sx, sy, sz, count, index]
    tris = set()
    order = []
    it = struct.iter_unpack('<12fH', data)
    for rec in it:
        ids = []
        for k in (3, 6, 9):
            x, y, z = rec[k], rec[k + 1], rec[k + 2]
            key = (int(x // cell), int(y // cell), int(z // cell))
            c = clusters.get(key)
            if c is None:
                c = [0.0, 0.0, 0.0, 0, len(order)]
                clusters[key] = c
                order.append(c)
            c[0] += x; c[1] += y; c[2] += z; c[3] += 1
            ids.append(c[4])
        a, b, c3 = ids
        if a == b or b == c3 or a == c3:
            continue
        # keep winding, drop duplicates
        m = min(ids)
        i = ids.index(m)
        tri = (ids[i], ids[(i + 1) % 3], ids[(i + 2) % 3])
        tris.add(tri)
    verts = [(c[0] / c[3], c[1] / c[3], c[2] / c[3]) for c in order]
    return verts, list(tris)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    target = int(sys.argv[3]) if len(sys.argv) > 3 else 70000
    n, data = read_stl(src)
    # bounding box from a sample of vertices
    lo = [1e30] * 3; hi = [-1e30] * 3
    for rec in struct.iter_unpack('<12fH', data[: 50 * min(n, 200000)]):
        for k in (3, 6, 9):
            for a in range(3):
                v = rec[k + a]
                lo[a] = min(lo[a], v); hi[a] = max(hi[a], v)
    size = max(hi[a] - lo[a] for a in range(3))
    cell = size / 260.0
    for _ in range(6):
        verts, tris = decimate(n, data, cell)
        print(f'cell {cell:.4f}: {len(verts)} verts, {len(tris)} tris')
        if len(verts) <= target * 1.15:
            break
        cell *= (len(verts) / target) ** 0.5
    with open(dst, 'wb') as f:
        f.write(b'MKM1')
        f.write(struct.pack('<II', len(verts), len(tris)))
        f.write(struct.pack(f'<{len(verts) * 3}f', *[c for v in verts for c in v]))
        f.write(struct.pack(f'<{len(tris) * 3}I', *[i for t in tris for i in t]))
    print(f'wrote {dst}: {len(verts)} verts, {len(tris)} tris (from {n} triangles)')


if __name__ == '__main__':
    main()
