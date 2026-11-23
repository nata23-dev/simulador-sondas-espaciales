// Etapa 25 — llamas y humo del lanzamiento (ilustrativos).
//
// Llamas: conos aditivos cuyo brillo depende del ángulo de visión (más denso en el centro de la silueta) y que se ensanchan y
// alargan al bajar la presión ambiente (escala de altura de 7,2 km). Colores cualitativos de cada propulsante: motores sólidos
// con aluminio (blanco amarillento, muy luminosos y con mucho humo), hipergólicos Aerozine-50/N2O4 (anaranjado translúcido),
// hidrógeno y oxígeno líquidos de los RL10 (casi invisible, azulado) y el sólido del módulo de propulsión.
// Humo: billboards instanciados, ordenados de atrás adelante, con luz solar envolvente y el resplandor de la llama cercana.
import * as THREE from 'three';
import { crearSpritePropio } from './LaunchSharedResources.js';

export const TIPOS_PENACHO = Object.freeze({
  srm: { radioSalida: 1.25, largo: 46, nucleo: [1.0, 0.88, 0.64], borde: [1.0, 0.46, 0.12], intensidad: 2.8, ruido: 0.35, ensanche: 2.6 },
  hipergolico: { radioSalida: 0.75, largo: 13, nucleo: [1.0, 0.72, 0.5], borde: [0.95, 0.42, 0.32], intensidad: 1.6, ruido: 0.25, ensanche: 1.7 },
  rl10: { radioSalida: 0.5, largo: 7, nucleo: [0.75, 0.82, 1.0], borde: [0.45, 0.55, 1.0], intensidad: 0.45, ruido: 0.15, ensanche: 1.7 },
  pm: { radioSalida: 0.32, largo: 5, nucleo: [1.0, 0.9, 0.72], borde: [1.0, 0.55, 0.25], intensidad: 2.6, ruido: 0.3, ensanche: 1.7 }
});

const LOG_V = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOG_F = '#include <logdepthbuf_pars_fragment>\n';

function materialPenacho(tipo) {
  const p = TIPOS_PENACHO[tipo];
  return new THREE.ShaderMaterial({
    uniforms: {
      uR0: { value: p.radioSalida }, uR1: { value: p.radioSalida * 2 }, uL: { value: p.largo }, uTiempo: { value: 0 },
      uNucleo: { value: new THREE.Color(...p.nucleo) }, uBorde: { value: new THREE.Color(...p.borde) },
      uIntensidad: { value: 0 }, uRuido: { value: p.ruido }, uSemilla: { value: Math.random() * 10 }
    },
    vertexShader: LOG_V + `
      uniform float uR0; uniform float uR1; uniform float uL;
      varying float vT; varying vec3 vNormalV; varying vec3 vPosV; varying float vAng;
      void main() {
        vT = -position.y;                                  // 0 en la tobera, 1 en la cola
        float perfil = sqrt(vT);
        float r = mix(uR0, uR1, perfil);
        vec3 p = vec3(position.x * r, -vT * uL, position.z * r);
        vAng = atan(position.z, position.x);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vPosV = mv.xyz;
        vNormalV = normalize(normalMatrix * vec3(position.x, 0.0, position.z));
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      uniform vec3 uNucleo; uniform vec3 uBorde; uniform float uIntensidad; uniform float uTiempo; uniform float uRuido; uniform float uSemilla;
      varying float vT; varying vec3 vNormalV; varying vec3 vPosV; varying float vAng;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 v = normalize(-vPosV);
        float centro = pow(abs(dot(normalize(vNormalV), v)), 1.6);   // grosor aparente del gas atravesado
        float n = ruido(vec2(vT * 9.0 - uTiempo * 11.0 + uSemilla, vAng * 2.0)) * 0.6 + ruido(vec2(vT * 23.0 - uTiempo * 19.0, vAng * 5.0 + uSemilla)) * 0.4;
        float caida = pow(1.0 - vT, 1.8) * smoothstep(0.0, 0.04, vT + 0.02);
        float brillo = uIntensidad * centro * caida * (1.0 - uRuido + uRuido * 2.0 * n);
        vec3 color = mix(uBorde, uNucleo, smoothstep(0.15, 0.85, centro * (1.0 - vT)));
        gl_FragColor = vec4(color * brillo, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: true
  });
}

let texturaResplandor = null;
function resplandor() {
  if (texturaResplandor) return texturaResplandor;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.18, 'rgba(255,215,150,0.55)'); gr.addColorStop(0.5, 'rgba(255,150,70,0.12)'); gr.addColorStop(1, 'rgba(255,120,50,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  texturaResplandor = new THREE.CanvasTexture(c); texturaResplandor.colorSpace = THREE.SRGBColorSpace;
  return texturaResplandor;
}

/** Penacho de un motor. `actualizar` recibe encendido (0–1), presión relativa (1 al nivel del mar) y el tiempo. */
export function crearPenacho(tipo) {
  const p = TIPOS_PENACHO[tipo], grupo = new THREE.Group(); grupo.name = `penacho_${tipo}`;
  const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 24, true); geo.translate(0, -0.5, 0);
  const capas = [materialPenacho(tipo), materialPenacho(tipo)];
  capas[1].uniforms.uSemilla.value += 3.7;
  const mallas = capas.map((m, i) => { const o = new THREE.Mesh(geo, m); o.frustumCulled = false; o.renderOrder = 5 + i; grupo.add(o); return o; });
  // LAN-02: textura propia sobre el lienzo común (misma imagen) y geometría propia: el renderizador del lanzamiento no deja sus
  // oyentes en objetos que sobreviven al lanzamiento (la caché del módulo y la geometría global de los sprites de three).
  const brillo = crearSpritePropio(new THREE.SpriteMaterial({ map: resplandor().clone(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(...p.borde) }));
  brillo.renderOrder = 7; grupo.add(brillo);
  return {
    grupo,
    actualizar(encendido, presionRel, tiempo) {
      grupo.visible = encendido > 0.001;
      if (!grupo.visible) return;
      const vacio = 1 - presionRel; // los gases se expanden al bajar la presión exterior
      const largo = p.largo * (1 + 2.5 * vacio) * (0.6 + 0.4 * encendido), r1 = p.radioSalida * (p.ensanche + 9 * vacio);
      const intensidad = p.intensidad * encendido / (1 + 3.5 * vacio);
      capas.forEach((m, i) => {
        m.uniforms.uL.value = largo * (i ? 0.55 : 1); m.uniforms.uR1.value = r1 * (i ? 0.55 : 1);
        m.uniforms.uIntensidad.value = intensidad * (i ? 1.6 : 1); m.uniforms.uTiempo.value = tiempo;
      });
      brillo.material.opacity = Math.min(1, 0.85 * encendido);
      brillo.scale.setScalar(p.radioSalida * (8 + 6 * presionRel) * (0.7 + 0.3 * encendido));
      brillo.position.y = -p.radioSalida * 0.6;
    },
    destruir() { geo.dispose(); capas.forEach(m => m.dispose()); brillo.geometry.dispose(); brillo.material.map.dispose(); brillo.material.dispose(); }
  };
}

function texturaHumo() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  let s = 21; const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const a = azar() * Math.PI * 2, d = Math.pow(azar(), 0.7) * 34, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 12 + azar() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.16 + azar() * 0.1})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * Humo: billboards instanciados. `actualizar(particulas, camara)` recibe un arreglo de { x, y, z, r, a, calor, semilla }
 * en coordenadas del mundo; se ordenan de atrás adelante.
 */
export function crearHumo(maximo = 2400) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const pos = new Float32Array(maximo * 3), dat = new Float32Array(maximo * 4);
  const aPos = new THREE.InstancedBufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aDat = new THREE.InstancedBufferAttribute(dat, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iDat', aDat); geo.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTextura: { value: texturaHumo() }, uSolVista: { value: new THREE.Vector3(0, 1, 0) },
      uLuz: { value: new THREE.Color(1.0, 0.96, 0.9) }, uSombra: { value: new THREE.Color(0.42, 0.46, 0.53) }, uCalor: { value: new THREE.Color(1.0, 0.5, 0.18) }
    },
    vertexShader: LOG_V + `
      attribute vec3 iPos; attribute vec4 iDat; // r, alfa, calor, semilla
      varying vec2 vUv; varying float vAlfa; varying float vCalor; varying vec2 vRot;
      void main() {
        float a = iDat.w * 6.2831;
        vec2 c = vec2(cos(a), sin(a));
        vec2 q = vec2(position.x * c.x - position.y * c.y, position.x * c.y + position.y * c.x) * iDat.x * 2.0;
        vec4 mv = viewMatrix * vec4(iPos, 1.0);
        mv.xy += q;
        vUv = uv; vAlfa = iDat.y; vCalor = iDat.z; vRot = c;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      uniform sampler2D uTextura; uniform vec3 uSolVista; uniform vec3 uLuz; uniform vec3 uSombra; uniform vec3 uCalor;
      varying vec2 vUv; varying float vAlfa; varying float vCalor; varying vec2 vRot;
      void main() {
        #include <logdepthbuf_fragment>
        float d = texture2D(uTextura, vUv).r;
        vec2 p = (vUv - 0.5) * 2.0;
        vec2 pr = vec2(p.x * vRot.x + p.y * vRot.y, -p.x * vRot.y + p.y * vRot.x);
        vec3 n = normalize(vec3(pr, sqrt(max(0.0, 1.0 - dot(pr, pr))) + 0.25));
        float luz = clamp(dot(n, uSolVista) * 0.55 + 0.5, 0.0, 1.0);
        vec3 color = mix(uSombra, uLuz, luz) + uCalor * vCalor * (0.6 + 0.8 * d);
        float radial = 1.0 - smoothstep(0.4, 1.0, length(p));            // borde redondo y difuso
        float alfa = smoothstep(0.02, 0.5, d) * radial * vAlfa;
        gl_FragColor = vec4(color, alfa);
      }`,
    transparent: true, depthWrite: false
  });
  const malla = new THREE.Mesh(geo, material);
  malla.frustumCulled = false; malla.renderOrder = 4;
  const orden = new Uint32Array(maximo), dist = new Float32Array(maximo), vista = new THREE.Vector3();
  const deAtrasAdelante = (a, b) => dist[b] - dist[a];
  return {
    malla, material,
    actualizar(particulas, camara, solMundo, cuenta = particulas.length) {
      const n = Math.min(cuenta, maximo);
      const cx = camara.position.x, cy = camara.position.y, cz = camara.position.z;
      for (let i = 0; i < n; i++) { const q = particulas[i]; orden[i] = i; dist[i] = (q.x - cx) ** 2 + (q.y - cy) ** 2 + (q.z - cz) ** 2; }
      const idx = orden.subarray(0, n).sort(deAtrasAdelante); // 26: sin copiar el índice en un arreglo nuevo cada fotograma
      for (let k = 0; k < n; k++) {
        const q = particulas[idx[k]];
        pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = q.z;
        dat[k * 4] = q.r; dat[k * 4 + 1] = q.a; dat[k * 4 + 2] = q.calor ?? 0; dat[k * 4 + 3] = q.semilla ?? 0;
      }
      geo.instanceCount = n;
      aPos.needsUpdate = true; aDat.needsUpdate = true;
      if (solMundo) material.uniforms.uSolVista.value.copy(vista.copy(solMundo).transformDirection(camara.matrixWorldInverse));
    },
    tonos(luz, sombra) { material.uniforms.uLuz.value.copy(luz); material.uniforms.uSombra.value.copy(sombra); },
    destruir() { geo.dispose(); base.dispose(); material.uniforms.uTextura.value.dispose(); material.dispose(); }
  };
}

/** Destello del Sol fuera de la atmósfera (el cielo de Preetham ya dibuja el disco dentro de ella). */
export function crearSolEspacio() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.035, 'rgba(255,253,245,1)'); gr.addColorStop(0.08, 'rgba(255,240,215,0.45)');
  gr.addColorStop(0.3, 'rgba(255,220,180,0.08)'); gr.addColorStop(1, 'rgba(255,210,170,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'lighter';
  for (const ang of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
    g.save(); g.translate(128, 128); g.rotate(ang);
    const l = g.createLinearGradient(-128, 0, 128, 0);
    l.addColorStop(0, 'rgba(255,240,220,0)'); l.addColorStop(0.5, `rgba(255,245,230,${ang % (Math.PI / 2) ? 0.12 : 0.28})`); l.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = l; g.fillRect(-128, -1.2, 256, 2.4); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sprite = crearSpritePropio(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, fog: false })); // LAN-02
  sprite.renderOrder = -5;
  return sprite;
}

/**
 * Estela continua de los motores sólidos: cinta orientada a la cámara a lo largo de la trayectoria. `actualizar(puntos, camara,
 * solMundo)` recibe { x, y, z, ancho, a } ordenados desde la plataforma hacia arriba.
 */
export function crearEstela(maximo = 400) {
  const pos = new Float32Array(maximo * 2 * 3), dat = new Float32Array(maximo * 2 * 3); // u, v, alfa
  const idx = [];
  for (let i = 0; i < maximo - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), aDat = new THREE.BufferAttribute(dat, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('aDat', aDat); geo.setIndex(idx); geo.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uSolVista: { value: new THREE.Vector3(0, 1, 0) },
      uLuz: { value: new THREE.Color(1.0, 0.96, 0.9) }, uSombra: { value: new THREE.Color(0.42, 0.46, 0.53) } },
    vertexShader: LOG_V + `
      attribute vec3 aDat; varying vec3 vDat;
      void main() { vDat = aDat; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      uniform vec3 uSolVista; uniform vec3 uLuz; uniform vec3 uSombra;
      varying vec3 vDat;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        #include <logdepthbuf_fragment>
        float x = vDat.x * 2.0 - 1.0;
        // Ruido continuo a lo largo de la estela (sin cortes periódicos) y borde irregular.
        float d = ruido(vec2(vDat.x * 3.0, vDat.y * 2.0)) * 0.6 + ruido(vec2(vDat.x * 7.0 + 3.1, vDat.y * 5.0)) * 0.4;
        vec3 n = normalize(vec3(x, 0.0, sqrt(max(0.0, 1.0 - x * x)) + 0.2));
        float luz = clamp(dot(n, uSolVista) * 0.45 + 0.62, 0.0, 1.0);
        float borde = 1.0 - smoothstep(0.35 + 0.3 * d, 1.0, abs(x));
        gl_FragColor = vec4(mix(uSombra, uLuz, luz), clamp(borde * (0.6 + 0.5 * d), 0.0, 1.0) * vDat.z);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  const malla = new THREE.Mesh(geo, material); malla.frustumCulled = false; malla.renderOrder = 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), t = new THREE.Vector3(), aCam = new THREE.Vector3(), lado = new THREE.Vector3(), vista = new THREE.Vector3();
  return {
    malla,
    actualizar(puntos, camara, solMundo, cuenta = puntos.length) {
      const n = Math.min(cuenta, maximo);
      let largo = 0;
      for (let i = 0; i < n; i++) {
        const q = puntos[i], ant = puntos[Math.max(0, i - 1)], sig = puntos[Math.min(n - 1, i + 1)];
        a.set(ant.x, ant.y, ant.z); b.set(sig.x, sig.y, sig.z); t.subVectors(b, a).normalize();
        aCam.set(camara.position.x - q.x, camara.position.y - q.y, camara.position.z - q.z).normalize();
        lado.crossVectors(t, aCam).normalize().multiplyScalar(q.ancho / 2);
        if (i > 0) largo += Math.hypot(q.x - ant.x, q.y - ant.y, q.z - ant.z) / Math.max(20, q.ancho * 2.5);
        const dCam = Math.hypot(camara.position.x - q.x, camara.position.y - q.y, camara.position.z - q.z);
        const cerca = THREE.MathUtils.smoothstep(dCam, q.ancho * 0.8, q.ancho * 3);
        for (let s = 0; s < 2; s++) {
          const k = (i * 2 + s) * 3, signo = s ? 1 : -1;
          pos[k] = q.x + lado.x * signo; pos[k + 1] = q.y + lado.y * signo; pos[k + 2] = q.z + lado.z * signo;
          dat[k] = s; dat[k + 1] = largo; dat[k + 2] = q.a * cerca;
        }
      }
      geo.setDrawRange(0, Math.max(0, n - 1) * 6);
      aPos.needsUpdate = true; aDat.needsUpdate = true;
      if (solMundo) material.uniforms.uSolVista.value.copy(vista.copy(solMundo).transformDirection(camara.matrixWorldInverse));
    },
    tonos(luz, sombra) { material.uniforms.uLuz.value.copy(luz); material.uniforms.uSombra.value.copy(sombra); },
    destruir() { geo.dispose(); material.dispose(); }
  };
}
