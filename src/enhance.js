// Character shading upgrades injected into three.js materials:
// - a view-dependent cinematic rim light (color set per arena)
// - a subsurface-scattering approximation for skin (warm light bleed in
//   shadowed areas and a red-tinted terminator)
// - sweat/oil: skin clearcoat that builds up during a fight
import * as THREE from 'three';

export const RIM = { color: { value: new THREE.Color(0x7fb8ff) }, strength: { value: 0.55 } };

export function setRim(color, strength) {
  RIM.color.value.set(color);
  RIM.strength.value = strength;
}

export function enhanceMaterial(m) {
  if (!m || m.userData.enhanced || !(m.isMeshStandardMaterial)) return;
  m.userData.enhanced = true;
  const skin = !!m.userData.skin;
  if (skin && m.isMeshPhysicalMaterial) {
    m.clearcoat = Math.max(m.clearcoat, 0.04);
    m.clearcoatRoughness = 0.35;
    m.userData.baseCC = m.clearcoat;
  }
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev && prev.call(m, sh, r);
    sh.uniforms.uRimColor = RIM.color; sh.uniforms.uRimStrength = RIM.strength;
    sh.fragmentShader = 'uniform vec3 uRimColor; uniform float uRimStrength;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        vec3 Vd = normalize(vViewPosition);
        float ndv = clamp(dot(normalize(normal), Vd), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 3.0);
        outgoingLight += uRimColor * rim * uRimStrength * (0.35 + 0.65 * dot(diffuseColor.rgb, vec3(0.33)));
        ${skin ? `
        // subsurface approximation: warm bleed where direct light is weak, red terminator
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        outgoingLight += diffuseColor.rgb * vec3(0.55, 0.16, 0.1) * (0.07 + 0.12 * (1.0 - smoothstep(0.0, 0.35, lum)));
        outgoingLight += vec3(0.5, 0.08, 0.04) * pow(1.0 - ndv, 1.5) * 0.06;` : ''}
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => (prev ? 'p' : '') + 'heroShade' + (skin ? 'S' : '');
  m.needsUpdate = true;
}

export function enhanceRig(rig) {
  const mats = new Set();
  rig.root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mats.add(mm)); });
  rig.skinMats = [];
  for (const m of mats) { enhanceMaterial(m); if (m.userData.skin && m.isMeshPhysicalMaterial) rig.skinMats.push(m); }
}

// sweat: 0 = dry, 1 = drenched (shiny oily highlights)
export function setSweat(rig, v) {
  if (!rig.skinMats) return;
  for (const m of rig.skinMats) {
    m.clearcoat = (m.userData.baseCC ?? 0.04) + v * 0.6;
    m.clearcoatRoughness = 0.35 - v * 0.22;
  }
}
