// Automatic rigging for static character meshes (FBX/OBJ/STL without bones).
// Normalises orientation and size, estimates a humanoid skeleton from the mesh
// itself, builds Mixamo-named bones and computes skin weights from each
// vertex's distance to the bone segments. The result plugs into ModelRig,
// which drives the bones with the game's pose library.
import * as THREE from 'three';

const V = THREE.Vector3;

export function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / (abx * abx + aby * aby + abz * abz || 1)));
  const dx = p.x - (a.x + abx * t), dy = p.y - (a.y + aby * t), dz = p.z - (a.z + abz * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// collect world-space geometries of every mesh
function bake(object) {
  object.updateMatrixWorld(true);
  const parts = [];
  object.traverse((o) => {
    if (!o.isMesh || !(o.geometry.attributes.position && o.geometry.attributes.position.count)) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    parts.push({ geo: g, material: o.material, name: o.name });
  });
  return parts;
}

function bounds(parts) {
  const box = new THREE.Box3();
  for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  return box;
}

function eachVertex(parts, fn, step = 1) {
  const v = new V();
  for (const p of parts) { const a = p.geo.attributes.position; for (let i = 0; i < a.count; i += step) fn(v.fromBufferAttribute(a, i), p, i); }
}

export function autoRig(object, { height = 1.85, upAxis = 'y', flip = false, turn = 0, weldedArms = false } = {}) {
  const parts = bake(object);
  if (!parts.length) return null;
  // ---------- orientation: Y up, facing +Z ----------
  const M = new THREE.Matrix4();
  if (upAxis === 'z') M.makeRotationX(-Math.PI / 2);
  else if (upAxis === 'x') M.makeRotationZ(Math.PI / 2);
  parts.forEach((p) => p.geo.applyMatrix4(M));
  let box = bounds(parts);
  let size = box.getSize(new V());
  // the shoulders are wider than the chest is deep: make X the lateral axis
  const chestBand = (lo, hi) => { let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9; eachVertex(parts, (v) => { const f = (v.y - box.min.y) / size.y; if (f > lo && f < hi) { mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mnz = Math.min(mnz, v.z); mxz = Math.max(mxz, v.z); } }, 3); return [mxx - mnx, mxz - mnz]; };
  const [wx, wz] = chestBand(0.62, 0.74);
  let rotY = turn;
  if (wz > wx * 1.15) rotY += Math.PI / 2;
  if (rotY) { const R = new THREE.Matrix4().makeRotationY(rotY); parts.forEach((p) => p.geo.applyMatrix4(R)); }
  // toes point forward: if the feet extend further toward -Z, turn around
  box = bounds(parts); size = box.getSize(new V());
  let facingBack = false;
  const eyes = parts.filter((p) => /eye/i.test(p.name));
  if (eyes.length && eyes.length < parts.length) {
    // sculpts with separate eyeballs: the eyes sit in front of the head's centre
    const e = bounds(eyes).getCenter(new V());
    let hz = 0, hn = 0;
    eachVertex(parts.filter((p) => !eyes.includes(p)), (v) => { if (Math.abs(v.y - e.y) < 0.06 * size.y) { hz += v.z; hn++; } }, 3);
    facingBack = hn ? e.z < hz / hn : false;
  } else {
    let footZ = 0, footN = 0, midZ = 0, midN = 0;
    eachVertex(parts, (v) => { const f = (v.y - box.min.y) / size.y; if (f < 0.04) { footZ += v.z; footN++; } else if (f > 0.3 && f < 0.5) { midZ += v.z; midN++; } }, 2);
    facingBack = footN && midN ? (footZ / footN) < (midZ / midN) : false;
  }
  if (flip) facingBack = !facingBack;
  if (facingBack) { const R = new THREE.Matrix4().makeRotationY(Math.PI); parts.forEach((p) => p.geo.applyMatrix4(R)); }
  // ---------- scale to the hero height, feet on the floor, centred ----------
  box = bounds(parts); size = box.getSize(new V());
  const s = height / size.y;
  const c = box.getCenter(new V());
  const N = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  parts.forEach((p) => p.geo.applyMatrix4(N));
  const H = height;

  // ---------- skeleton estimation ----------
  const band = (lo, hi, filter = () => true) => { const pts = []; eachVertex(parts, (v) => { const f = v.y / H; if (f >= lo && f <= hi && filter(v)) pts.push(v.clone()); }, 2); return pts; };
  const mean = (pts) => pts.reduce((a, p) => a.add(p), new V()).multiplyScalar(1 / Math.max(1, pts.length));
  const pct = (arr, q) => { const s2 = arr.slice().sort((a, b) => a - b); return s2[Math.min(s2.length - 1, Math.floor(q * s2.length))] || 0; };
  const torso = band(0.6, 0.72, (v) => Math.abs(v.x) < 0.2 * H);
  const cz = torso.length ? mean(torso).z : 0;
  const halfW = pct(torso.map((p) => Math.abs(p.x)), 0.97) || 0.12 * H;
  const shY = 0.815 * H, shX = Math.min(halfW * 0.82, 0.16 * H);
  const J = {
    hips: new V(0, 0.52 * H, cz), spine: new V(0, 0.59 * H, cz), chest: new V(0, 0.7 * H, cz),
    neck: new V(0, 0.835 * H, cz), head: new V(0, 0.875 * H, cz + 0.01 * H), top: new V(0, H, cz),
  };
  const calib = {};
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    const sh = new V(sx * shX, shY, cz);
    // arm: farthest point from the shoulder among vertices outside the torso on this side
    let far = null, fd = 0;
    eachVertex(parts, (v) => { if (v.x * sx > shX * 1.1 && v.y > 0.3 * H && v.y < 0.98 * H) { const d = v.distanceTo(sh); if (d > fd) { fd = d; far = v.clone(); } } }, 2);
    let dir = far ? far.clone().sub(sh).normalize() : new V(sx * 0.15, -1, 0).normalize();
    const len = far ? Math.min(fd, 0.48 * H) : 0.42 * H;
    J[side + 'Sh'] = sh;
    J[side + 'El'] = sh.clone().addScaledVector(dir, len * 0.47);
    J[side + 'Wr'] = sh.clone().addScaledVector(dir, len * 0.86);
    J[side + 'Tip'] = sh.clone().addScaledVector(dir, len * 1.02);
    calib[side + 'Arm'] = dir;
    // leg: centroids of knee and ankle slices on this side
    const knee = mean(band(0.25, 0.31, (v) => v.x * sx > 0.01 * H && Math.abs(v.x) < 0.25 * H));
    const ankle = mean(band(0.04, 0.08, (v) => v.x * sx > 0.01 * H && Math.abs(v.x) < 0.25 * H));
    const hip = new V(knee.x * 0.85 || sx * 0.09 * H, 0.5 * H, cz);
    knee.y = 0.28 * H; ankle.y = 0.06 * H;
    let toe = null, tz = -1e9;
    eachVertex(parts, (v) => { if (v.y < 0.05 * H && v.x * sx > 0 && v.z > tz) { tz = v.z; toe = v.clone(); } }, 2);
    J[side + 'Hip'] = hip; J[side + 'Knee'] = knee; J[side + 'Ankle'] = ankle; J[side + 'Toe'] = toe || ankle.clone().add(new V(0, -0.04 * H, 0.12 * H));
    calib[side + 'Leg'] = ankle.clone().sub(hip).normalize();
  }

  // ---------- bones (identity rest rotations, Mixamo names) ----------
  const bones = {}; const list = [];
  const mk = (name, pos, parent) => { const b = new THREE.Bone(); b.name = 'mixamorig' + name; b.position.copy(pos); if (parent) { parent.add(b); b.position.sub(parent.userData.world); } b.userData.world = pos.clone(); bones[name] = b; list.push(b); return b; };
  const hipsB = mk('Hips', J.hips, null);
  const spineB = mk('Spine', J.spine, hipsB);
  const chestB = mk('Spine2', J.chest, spineB);
  const neckB = mk('Neck', J.neck, chestB);
  mk('Head', J.head, neckB);
  for (const [side, nm] of [['l', 'Left'], ['r', 'Right']]) {
    const arm = mk(nm + 'Arm', J[side + 'Sh'], chestB);
    const fore = mk(nm + 'ForeArm', J[side + 'El'], arm);
    mk(nm + 'Hand', J[side + 'Wr'], fore);
    const up = mk(nm + 'UpLeg', J[side + 'Hip'], hipsB);
    const leg = mk(nm + 'Leg', J[side + 'Knee'], up);
    mk(nm + 'Foot', J[side + 'Ankle'], leg);
  }
  // segments used for skinning: [bone, a, b, side(+1 left, -1 right, 0 centre)]
  const S = [
    ['Hips', new V(0, 0.44 * H, cz), J.spine, 0], ['Spine', J.spine, J.chest, 0], ['Spine2', J.chest, J.neck, 0],
    ['Neck', J.neck, J.head, 0], ['Head', J.head, J.top, 0],
  ];
  for (const [side, nm, sx] of [['l', 'Left', 1], ['r', 'Right', -1]]) {
    S.push([nm + 'Arm', J[side + 'Sh'], J[side + 'El'], sx], [nm + 'ForeArm', J[side + 'El'], J[side + 'Wr'], sx], [nm + 'Hand', J[side + 'Wr'], J[side + 'Tip'], sx]);
    S.push([nm + 'UpLeg', J[side + 'Hip'], J[side + 'Knee'], sx], [nm + 'Leg', J[side + 'Knee'], J[side + 'Ankle'], sx], [nm + 'Foot', J[side + 'Ankle'], J[side + 'Toe'], sx]);
  }
  const idx = (name) => list.indexOf(bones[name]);
  const segs = S.map(([n, a, b, sd]) => ({ name: n, bi: idx(n), a, b, sd, limbArm: /Arm|Hand/.test(n), limbLeg: /Leg|Foot/.test(n) }));
  // multi-part sculpts: named parts constrain which bones may move them
  const LEGPART = /leg|pant|short|belt|boot|shoe|foot/i, HEADPART = /eye|head|face|hair|brow/i;
  const hasLegPart = parts.some((pt) => LEGPART.test(pt.name));

  const skeleton = new THREE.Skeleton(list.map((b) => b));
  const group = new THREE.Group();
  group.add(hipsB);
  group.updateMatrixWorld(true);
  skeleton.calculateInverses();
  const out = [];
  const p = new V();
  // for hanging arms: split arm from body at each height (arms resting on the thighs would otherwise bind to the legs)
  const armX = {}, vertArm = {};
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    const a = J[side + 'Sh'], b = J[side + 'Tip'];
    vertArm[side] = weldedArms && Math.abs(calib[side + 'Arm'].y) > 0.6;
    armX[side] = (y) => { const t = Math.max(0, Math.min(1, (a.y - y) / Math.max(1e-6, a.y - b.y))); return Math.abs(a.x + (b.x - a.x) * t); };
  }
  // arm thickness per height, measured from the outer silhouette (only the arm is out there)
  const BINS = 24, armR = {};
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    if (!vertArm[side]) continue;
    const top = J[side + 'Sh'].y, bot = J[side + 'Tip'].y - 0.03 * H;
    const maxX = new Array(BINS).fill(0);
    eachVertex(parts, (v) => { if (v.x * sx <= 0 || v.y > top || v.y < bot) return; const b = Math.min(BINS - 1, Math.floor((top - v.y) / (top - bot) * BINS)); maxX[b] = Math.max(maxX[b], Math.abs(v.x)); }, 1);
    armR[side] = (y) => { const b = Math.max(0, Math.min(BINS - 1, Math.floor((top - y) / (top - bot) * BINS))); return Math.max(0.03 * H, maxX[b] - armX[side](y)); };
  }
  const isArmVertex = (v) => {
    const side = v.x >= 0 ? 'l' : 'r';
    if (!vertArm[side] || v.y > shY - 0.06 * H || v.y < J[side + 'Tip'].y - 0.05 * H) return null; // not decided here
    const d = segDist(v, J[side + 'Sh'], J[side + 'Tip']);
    return d < armR[side](v.y) * 1.08;
  };
  for (const part of parts) {
    const geo = part.geo;
    const pos = geo.attributes.position;
    const si = new Uint16Array(pos.count * 4), sw = new Float32Array(pos.count * 4);
    const rule = HEADPART.test(part.name) ? 'head' : LEGPART.test(part.name) ? 'legs' : null;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const xs = Math.sign(p.x) || 1;
      let b1 = -1, d1 = 1e9, b2 = -1, d2 = 1e9;
      // legs/belt parts never follow the arms; in an upper-body part only the arms hang below the hips
      const armV = rule ? false : hasLegPart && p.y < J.hips.y - 0.06 * H ? true : isArmVertex(p);
      for (const sg of segs) {
        if (rule === 'head' && sg.name !== 'Head' && sg.name !== 'Neck') continue;
        if (sg.sd && sg.sd !== xs && Math.abs(p.x) > 0.02 * H) continue;      // limbs only on their side
        if (armV === true && !sg.limbArm) continue;
        if (armV === false && sg.limbArm) continue;
        if (sg.limbArm && Math.abs(p.x) < shX * 0.8 && p.y < shY) continue;     // keep the chest off the arms
        if (sg.limbLeg && p.y > 0.56 * H) continue;
        if (!sg.limbLeg && !sg.limbArm && sg.bi === idx('Hips') && p.y < 0.36 * H) continue;
        const d = segDist(p, sg.a, sg.b);
        if (d < d1) { b2 = b1; d2 = d1; b1 = sg.bi; d1 = d; } else if (d < d2 && sg.bi !== b1) { b2 = sg.bi; d2 = d; }
      }
      const w1 = 1 / Math.pow(d1 + 0.004 * H, 4), w2 = b2 >= 0 ? 1 / Math.pow(d2 + 0.004 * H, 4) : 0;
      const t = w1 + w2;
      si[i * 4] = Math.max(0, b1); sw[i * 4] = w1 / t;
      si[i * 4 + 1] = Math.max(0, b2); sw[i * 4 + 1] = w2 / t;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    // sculpts with arms resting on the body get welded together; cut triangles that bridge
    // an arm to the torso/legs (below the shoulder) or the left leg to the right leg
    if ((vertArm.l || vertArm.r) && geo.index && !geo.groups.length) {
      const group = (i) => { const n = list[si[i * 4]].name; return /Arm|Hand/.test(n) ? (n.includes('Left') ? 'la' : 'ra') : /UpLeg|Leg|Foot/.test(n) ? (n.includes('Left') ? 'll' : 'rl') : 'b'; };
      const gid = new Array(pos.count); for (let i = 0; i < pos.count; i++) gid[i] = group(i);
      const src = geo.index.array, keep = [];
      let cut = 0;
      for (let t = 0; t < src.length; t += 3) {
        const a = src[t], b = src[t + 1], c = src[t + 2];
        const gs = new Set([gid[a], gid[b], gid[c]]);
        const hasArm = gs.has('la') || gs.has('ra');
        const low = Math.min(pos.getY(a), pos.getY(b), pos.getY(c)) < shY - 0.08 * H;
        if ((hasArm && gs.size > 1 && low) || (gs.has('ll') && gs.has('rl'))) { cut++; continue; }
        keep.push(a, b, c);
      }
      geo.setIndex(keep);
      geo.userData.cutTriangles = cut;
    }
    const mesh = new THREE.SkinnedMesh(geo, part.material);
    mesh.name = part.name;
    group.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    out.push(mesh);
  }
  return { scene: group, animations: [], calib, joints: J, height: H };
}

// box-projected UVs so tiling detail maps work on meshes without UVs (e.g. STL)
export function boxUVs(geo, scale = 6) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (nx >= ny && nx >= nz) { uv[i * 2] = z * scale; uv[i * 2 + 1] = y * scale; }
    else if (ny >= nz) { uv[i * 2] = x * scale; uv[i * 2 + 1] = z * scale; }
    else { uv[i * 2] = x * scale; uv[i * 2 + 1] = y * scale; }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}
