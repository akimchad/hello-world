// Cinematic post-processing: a half-res depth prepass, a lens pass
// (depth of field, motion blur, radial impact blur) in linear HDR, and a
// film grade pass (chromatic aberration, lift/gamma/gain, split toning,
// impact flash, vignette, grain, letterbox) after tone mapping.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export class DepthPrepass {
  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    this.hidden = [];
    this.frame = 0;
  }
  setSize(w, h) { this.target.setSize(Math.max(1, Math.floor(w / 3)), Math.max(1, Math.floor(h / 3))); }
  render(renderer, scene, camera) {
    // refresh the list of things that should not occlude depth (particles, lines, glows)
    if (this.frame++ % 20 === 0 || this.scene !== scene) {
      this.scene = scene;
      this.hidden = [];
      scene.traverse((o) => {
        if (o.isPoints || o.isLine || o.isSprite) this.hidden.push(o);
        else if (o.isMesh && o.material && !Array.isArray(o.material) && (o.material.blending === THREE.AdditiveBlending || o.material.userData.noDepth)) this.hidden.push(o);
      });
    }
    const vis = this.hidden.map((o) => o.visible);
    this.hidden.forEach((o) => { o.visible = false; });
    const prevOverride = scene.overrideMaterial, prevBg = scene.background, prevSM = renderer.shadowMap.autoUpdate;
    scene.overrideMaterial = this.mat; scene.background = null; renderer.shadowMap.autoUpdate = false;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(0x000000, 1);
    scene.overrideMaterial = prevOverride; scene.background = prevBg; renderer.shadowMap.autoUpdate = prevSM;
    this.hidden.forEach((o, i) => { o.visible = vis[i]; });
  }
}

export function makeLensPass(depth) {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null }, cameraNear: { value: 0.1 }, cameraFar: { value: 1200 },
      focus: { value: 10 }, focusRange: { value: 6 }, maxBlur: { value: 7 }, dofOn: { value: 1 }, resolution: { value: new THREE.Vector2(1, 1) },
      blurDir: { value: new THREE.Vector2(1, 0) }, blurAmt: { value: 0 }, radialCenter: { value: new THREE.Vector2(0.5, 0.5) }, radialAmt: { value: 0 },
      aoOn: { value: 1 }, aoRadius: { value: 0.55 }, aoStrength: { value: 0.85 }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, depthTexel: { value: new THREE.Vector2(1 / 400, 1 / 300) },
    },
    vertexShader: VERT,
    fragmentShader: `
      #include <packing>
      uniform sampler2D tDiffuse; uniform sampler2D tDepth;
      uniform float cameraNear, cameraFar, focus, focusRange, maxBlur, dofOn, blurAmt, radialAmt;
      uniform vec2 resolution, blurDir, radialCenter, depthTexel;
      uniform float aoOn, aoRadius, aoStrength; uniform mat4 uProj, uInvProj;
      varying vec2 vUv;
      vec3 S(vec2 uv) { vec3 c = texture2D(tDiffuse, uv).rgb; return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : min(c, vec3(60.0)); }
      float viewZ(vec2 uv) { float d = unpackRGBAToDepth(texture2D(tDepth, uv)); return -perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
      vec3 viewPos(vec2 uv) { float d = unpackRGBAToDepth(texture2D(tDepth, uv)); vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec4 v = uInvProj * c; return v.xyz / v.w; }
      float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      // screen-space ambient occlusion from the depth prepass
      float ssao(vec2 uv) {
        float d0 = unpackRGBAToDepth(texture2D(tDepth, uv));
        if (d0 > 0.9999) return 1.0;
        vec3 p = viewPos(uv);
        vec3 px = viewPos(uv + vec2(depthTexel.x, 0.0)), py = viewPos(uv + vec2(0.0, depthTexel.y));
        vec3 n = normalize(cross(px - p, py - p));
        if (dot(n, p) > 0.0) n = -n;
        float occ = 0.0;
        float rnd = hash12(gl_FragCoord.xy) * 6.2831;
        for (int i = 0; i < 10; i++) {
          float fi = float(i);
          float a = fi * 2.39996 + rnd;
          float z = fract(fi * 0.618 + rnd * 0.1);
          vec3 dir = normalize(vec3(cos(a) * sqrt(1.0 - z * z), sin(a) * sqrt(1.0 - z * z), z));
          if (dot(dir, n) < 0.0) dir = -dir;
          float sc = mix(0.15, 1.0, (fi / 10.0) * (fi / 10.0));
          vec3 sp = p + dir * aoRadius * sc;
          vec4 clip = uProj * vec4(sp, 1.0);
          vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
          if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
          float sz = viewPos(suv).z;
          float range = smoothstep(0.0, 1.0, aoRadius / max(abs(p.z - sz), 0.001));
          occ += (sz >= sp.z + 0.02 ? 1.0 : 0.0) * range;
        }
        return 1.0 - aoStrength * occ / 10.0;
      }
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        if (any(isnan(base.rgb)) || any(isinf(base.rgb))) base.rgb = vec3(0.0);
        base.rgb = min(base.rgb, vec3(60.0));
        if (aoOn > 0.5) base.rgb *= ssao(vUv);
        vec3 col = base.rgb;
        if (dofOn > 0.5) {
          float z = viewZ(vUv);
          float coc = clamp((z - focus) / focusRange, -1.0, 1.0);
          float r = abs(coc) * maxBlur;
          if (r > 0.6) {
            vec3 acc = col; float wsum = 1.0;
            for (int i = 0; i < 12; i++) {
              float a = float(i) * 2.39996;
              float rr = sqrt(float(i) + 0.5) / 3.5 * r;
              vec2 uv = vUv + vec2(cos(a), sin(a)) * rr / resolution;
              float zs = viewZ(uv);
              float cs = abs(clamp((zs - focus) / focusRange, -1.0, 1.0));
              float w = zs < z - 0.5 ? cs : 1.0; // keep sharp foreground from bleeding into the blur
              vec3 sc = texture2D(tDiffuse, uv).rgb; if (any(isnan(sc))) sc = vec3(0.0); acc += min(sc, vec3(60.0)) * w; wsum += w;
            }
            col = acc / wsum;
          }
        }
        if (blurAmt > 0.0005) {
          vec3 acc = col;
          for (int i = 1; i <= 8; i++) { float t = float(i) / 8.0 - 0.5; acc += S(vUv + blurDir * blurAmt * t); }
          col = acc / 9.0;
        }
        if (radialAmt > 0.0005) {
          vec2 d = vUv - radialCenter; vec3 acc = col;
          for (int i = 1; i <= 8; i++) acc += S(vUv - d * radialAmt * float(i) / 8.0);
          col = acc / 9.0;
        }
        gl_FragColor = vec4(col, base.a);
      }`,
  });
  // ShaderPass clones uniforms and drops render-target textures, so assign it afterwards
  pass.uniforms.tDepth.value = depth.target.texture;
  return pass;
}

export function makeGradePass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.6 }, ca: { value: 0.0015 }, grain: { value: 0.035 },
      impact: { value: 0 }, saturation: { value: 1.05 }, contrast: { value: 1.12 },
      lift: { value: new THREE.Vector3(-0.015, -0.01, 0.0) }, gamma: { value: new THREE.Vector3(1.0, 1.0, 1.02) }, gain: { value: new THREE.Vector3(1.04, 1.0, 0.96) },
      tintShadows: { value: new THREE.Vector3(0.92, 0.98, 1.08) }, tintHighlights: { value: new THREE.Vector3(1.06, 1.0, 0.92) }, letterbox: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float time, vignette, ca, grain, impact, saturation, contrast, letterbox;
      uniform vec3 lift, gamma, gain, tintShadows, tintHighlights;
      varying vec2 vUv;
      void main() {
        vec2 d = vUv - 0.5; float r2 = dot(d, d);
        vec2 off = d * ca * (1.0 + r2 * 6.0);
        vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        col = col * gain + lift * (1.0 - col);
        col = pow(max(col, 0.0), 1.0 / gamma);
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col *= mix(tintShadows, tintHighlights, smoothstep(0.05, 0.75, l));
        col = mix(vec3(l), col, saturation);
        col = (col - 0.5) * contrast + 0.5;
        col = mix(col, vec3(l) * 1.7 + 0.08, impact * 0.55);
        col *= 1.0 - vignette * r2 * 1.7;
        float n = fract(sin(dot(vUv * 1024.0 + time * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * grain;
        float bar = 0.5 - letterbox * 0.11;
        if (abs(vUv.y - 0.5) > bar) col = vec3(0.0);
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`,
  });
}

// runtime controller the game uses to trigger lens effects
export class Cine {
  constructor(lens, grade) {
    this.lens = lens; this.grade = grade;
    this.blur = 0; this.radial = 0; this.caKick = 0; this.flash = 0; this.bars = 0; this.barsTarget = 0;
    this.focus = 10; this.focusTarget = 10; this.range = 6;
  }
  motion(dirX, amt) { this.lens.uniforms.blurDir.value.set(dirX, 0); this.blur = Math.max(this.blur, amt); }
  impactAt(uv, amt) { this.lens.uniforms.radialCenter.value.copy(uv); this.radial = Math.max(this.radial, amt); this.caKick = Math.max(this.caKick, amt * 0.12); }
  impact(amt) { this.flash = Math.max(this.flash, amt); this.caKick = Math.max(this.caKick, amt * 0.006); }
  letterbox(on) { this.barsTarget = on ? 1 : 0; }
  setFocus(dist, range = 6) { this.focusTarget = dist; this.range = range; }
  update(dt) {
    const k = (rate) => Math.exp(-rate * dt);
    this.blur *= k(9); this.radial *= k(7); this.caKick *= k(6); this.flash *= k(5);
    this.bars += (this.barsTarget - this.bars) * Math.min(1, dt * 5);
    this.focus += (this.focusTarget - this.focus) * Math.min(1, dt * 6);
    const L = this.lens.uniforms, G = this.grade.uniforms;
    L.blurAmt.value = this.blur; L.radialAmt.value = this.radial;
    L.focus.value = this.focus; L.focusRange.value = this.range;
    G.ca.value = 0.0006 + this.caKick; G.impact.value = this.flash; G.letterbox.value = this.bars;
  }
  reset() { this.blur = this.radial = this.caKick = this.flash = 0; this.barsTarget = 0; }
}
