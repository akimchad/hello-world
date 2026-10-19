// Planar reflections for floors: renders the scene from a mirrored camera
// into a half-res target and blends it into a standard material based on
// its roughness (wet patches reflect more) and a Fresnel term.
import * as THREE from 'three';

const V = THREE.Vector3;

export class PlanarReflection {
  constructor(mesh, { strength = 1, distortion = 0.03, scale = 0.33 } = {}) {
    this.mesh = mesh;
    this.scale = scale;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.frame = 0;
    this.cam = new THREE.PerspectiveCamera();
    this.texMatrix = new THREE.Matrix4();
    this.uniforms = { tReflect: { value: this.target.texture }, uTexMatrix: { value: this.texMatrix }, uReflStrength: { value: strength }, uDistort: { value: distortion } };
    this.n = new V(); this.p = new V(); this.view = new V(); this.target3 = new V(); this.look = new V(); this.rot = new THREE.Matrix4();
    this.plane = new THREE.Plane(); this.clip = new THREE.Vector4(); this.q = new THREE.Vector4();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    this.patch(mats[mesh.userData.reflectIndex ?? 0]);
  }

  patch(m) {
    const u = this.uniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform mat4 uTexMatrix; varying vec4 vReflUv;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vReflUv = uTexMatrix * vec4(transformed, 1.0);');
      sh.fragmentShader = 'uniform sampler2D tReflect; uniform float uReflStrength; uniform float uDistort; varying vec4 vReflUv;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
        {
          vec4 ruv = vReflUv; ruv.xy += normal.xy * uDistort * ruv.w;
          vec3 refl = ruv.w > 0.001 ? texture2DProj(tReflect, ruv).rgb : vec3(0.0);
          refl = clamp(refl, 0.0, 30.0);
          if (any(isnan(refl))) refl = vec3(0.0);
          float wet = clamp(1.0 - roughnessFactor, 0.0, 1.0);
          float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
          outgoingLight = mix(outgoingLight, refl, clamp(wet * wet * (0.35 + fres) * uReflStrength, 0.0, 0.92));
        }
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'planarReflect';
    m.needsUpdate = true;
  }

  setSize(w, h) { this.target.setSize(Math.max(1, Math.floor(w * this.scale)), Math.max(1, Math.floor(h * this.scale))); }

  update(renderer, scene, camera) {
    if ((this.frame++ & 1) === 1) return; // 30 Hz is plenty for a blurry wet floor
    const mesh = this.mesh;
    mesh.updateMatrixWorld();
    this.p.setFromMatrixPosition(mesh.matrixWorld);
    camera.updateMatrixWorld();
    const camPos = new V().setFromMatrixPosition(camera.matrixWorld);
    this.rot.extractRotation(mesh.matrixWorld);
    this.n.set(0, 0, 1).applyMatrix4(this.rot);
    this.view.subVectors(this.p, camPos);
    if (this.view.dot(this.n) > 0) return;
    this.view.reflect(this.n).negate().add(this.p);
    this.rot.extractRotation(camera.matrixWorld);
    this.look.set(0, 0, -1).applyMatrix4(this.rot).add(camPos);
    this.target3.subVectors(this.p, this.look).reflect(this.n).negate().add(this.p);
    const vc = this.cam;
    vc.position.copy(this.view);
    vc.up.set(0, 1, 0).applyMatrix4(this.rot).reflect(this.n);
    vc.lookAt(this.target3);
    vc.far = camera.far; vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(mesh.matrixWorld);
    // oblique near plane so nothing below the floor leaks into the reflection
    this.plane.setFromNormalAndCoplanarPoint(this.n, this.p).applyMatrix4(vc.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = vc.projectionMatrix.elements;
    this.q.set((Math.sign(this.clip.x) + pm[8]) / pm[0], (Math.sign(this.clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    pm[2] = this.clip.x; pm[6] = this.clip.y; pm[10] = this.clip.z + 1 - 0.003; pm[14] = this.clip.w;

    mesh.visible = false;
    const hidden = [];
    scene.traverse((o) => { if (o.userData.noReflect && o.visible) { hidden.push(o); o.visible = false; } });
    const prevTarget = renderer.getRenderTarget(), prevSM = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevSM;
    hidden.forEach((o) => { o.visible = true; });
    mesh.visible = true;
  }

  dispose() { this.target.dispose(); }
}
