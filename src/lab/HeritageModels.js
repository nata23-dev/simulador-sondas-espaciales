// Etapa 15 — modelos 3D procedimentales de las piezas de herencia. Reconstrucciones con las dimensiones de HeritageCatalog.js
// (en metros), no modelos CAD oficiales. Convención: el eje +Y local es la normal exterior del punto de montaje (dirección en la
// que la pieza se extiende); la pieza nace en el origen, que es el punto de montaje.
import * as THREE from 'three';

const M = {
  blanket: new THREE.MeshStandardMaterial({ color: 0xb8913f, metalness: 0.55, roughness: 0.38 }),
  blanketDark: new THREE.MeshStandardMaterial({ color: 0x1b1c20, metalness: 0.35, roughness: 0.62 }),
  aluminium: new THREE.MeshStandardMaterial({ color: 0xaeb4bd, metalness: 0.85, roughness: 0.32 }),
  titanium: new THREE.MeshStandardMaterial({ color: 0x8b8f96, metalness: 0.8, roughness: 0.45 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9e6df, metalness: 0.05, roughness: 0.6, side: THREE.DoubleSide }),
  cells: new THREE.MeshStandardMaterial({ color: 0x14254a, metalness: 0.35, roughness: 0.28, emissive: 0x050b18 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.3, roughness: 0.7 }),
  rtg: new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.7, roughness: 0.42 }),
  nozzle: new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }),
  lens: new THREE.MeshStandardMaterial({ color: 0x6fb2d6, metalness: 0.5, roughness: 0.15, emissive: 0x0d2a3a })
};
export const HERITAGE_MATERIALS = M;
export function disposeHeritageMaterials() { for (const m of Object.values(M)) m.dispose(); }

const Y = new THREE.Vector3(0, 1, 0);
function mesh(group, geometry, material, position = [0, 0, 0], rotation = null, name = null) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  if (rotation) item.rotation.set(...rotation);
  if (name) item.name = name;
  group.add(item);
  return item;
}
function rod(group, a, b, radius, material = M.aluminium) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), dir = end.clone().sub(start);
  const item = mesh(group, new THREE.CylinderGeometry(radius, radius, dir.length(), 8), material, start.clone().add(end).multiplyScalar(0.5).toArray());
  item.quaternion.setFromUnitVectors(Y, dir.normalize());
  return item;
}
const box = (group, size, material, position) => mesh(group, new THREE.BoxGeometry(...size), material, position);
const cyl = (group, rTop, rBottom, h, material, position, sides = 16) => mesh(group, new THREE.CylinderGeometry(rTop, rBottom, h, sides), material, position);

// Paraboloide de diámetro D y profundidad d con la apertura hacia +Y, más alimentador y puntales.
function dish(group, D, depth) {
  const R = D / 2, points = [];
  for (let i = 0; i <= 16; i++) { const x = R * i / 16; points.push(new THREE.Vector2(x, depth * (x / R) ** 2)); }
  const reflector = mesh(group, new THREE.LatheGeometry(points, 40), M.white, [0, 0.12, 0]);
  reflector.name = 'hga-reflector';
  cyl(group, 0.08, 0.12, 0.14, M.aluminium, [0, 0.06, 0], 12);
  const focus = R * R / (4 * depth) + 0.12;
  cyl(group, 0.06, 0.09, 0.22, M.black, [0, focus, 0], 12);
  for (let k = 0; k < 3; k++) { const a = k * 2 * Math.PI / 3; rod(group, [Math.cos(a) * R * 0.82, 0.12 + depth * 0.67, Math.sin(a) * R * 0.82], [0, focus - 0.08, 0], 0.012); }
}
// Ala solar: yugo desde la raíz y paneles a lo largo de +Y; la cara activa mira a +Z.
function wing(group, c) {
  const [width, length, thickness] = c.dimensionsM, panelLength = c.panelLengthM ?? length * 0.9, yoke = length - panelLength;
  if (yoke > 0.02) { rod(group, [-width * 0.3, 0, 0], [0, yoke, 0], 0.025); rod(group, [width * 0.3, 0, 0], [0, yoke, 0], 0.025); }
  const panels = Math.max(3, Math.round(panelLength / 2.2));
  const each = panelLength / panels;
  for (let i = 0; i < panels; i++) {
    const y = yoke + each * (i + 0.5);
    box(group, [width, each * 0.97, thickness], M.blanketDark, [0, y, 0]);
    box(group, [width * 0.94, each * 0.9, thickness * 0.4], M.cells, [0, y, thickness * 0.5]).name = 'solar-cells';
  }
}
function rtgUnit(group, y, length, radius) {
  cyl(group, radius, radius, length, M.rtg, [0, y, 0], 16).name = 'rtg-body';
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const fin = box(group, [radius * 0.9, length * 0.92, 0.012], M.rtg, [Math.cos(a) * radius * 1.35, y, Math.sin(a) * radius * 1.35]); fin.rotation.y = -a; }
}
function nozzle(group, throat, exit, length, y0 = 0, x = 0) {
  cyl(group, throat * 1.3, throat * 1.3, length * 0.25, M.aluminium, [x, y0 + length * 0.12, 0], 14);
  mesh(group, new THREE.CylinderGeometry(throat, exit, length * 0.75, 24, 1, true), M.nozzle, [x, y0 + length * 0.62, 0]);
}

export function buildHeritageCore(c) {
  const g = new THREE.Group(), [w, h, d] = c.dimensionsM;
  switch (c.shape) {
    case 'decagon': {
      const r = (w / 2) / Math.cos(Math.PI / 10);
      mesh(g, new THREE.CylinderGeometry(r, r, h, 10), M.blanketDark, [0, 0, 0], [0, Math.PI / 10, 0], 'bus-shell');
      for (let k = 0; k < 10; k++) { const a = (k + 0.5) * Math.PI / 5; const p = box(g, [w * 0.5, h * 0.82, 0.02], k % 2 ? M.blanket : M.aluminium, [Math.cos(a) * w / 2, 0, Math.sin(a) * w / 2]); p.rotation.y = Math.PI / 2 - a; }
      cyl(g, r * 0.55, r * 0.55, 0.05, M.aluminium, [0, h / 2 + 0.02, 0], 20);
      break;
    }
    case 'cassini-stack': {
      mesh(g, new THREE.CylinderGeometry(1.0, 1.0, 0.55, 12), M.blanketDark, [0, 0.95, 0], null, 'bus-shell');
      mesh(g, new THREE.CylinderGeometry(0.85, 0.85, 2.6, 24), M.blanket, [0, -0.55, 0], null, 'bus-shell');
      cyl(g, 1.0, 1.0, 0.3, M.blanketDark, [0, -1.75, 0], 16);
      cyl(g, 0.6, 0.85, 0.35, M.aluminium, [0, 0.55, 0], 24);
      cyl(g, 0.5, 0.95, 0.3, M.aluminium, [0, -2.0, 0], 24);
      break;
    }
    case 'box-bus': {
      mesh(g, new THREE.BoxGeometry(w, h, d), M.blanket, [0, 0, 0], null, 'bus-shell');
      for (const s of [-1, 1]) box(g, [0.02, h * 0.9, d * 0.9], M.aluminium, [s * w / 2, 0, 0]);
      box(g, [w * 0.95, 0.03, d * 0.95], M.aluminium, [0, h / 2, 0]);
      break;
    }
    case 'hexagon': {
      const r = w / 2;
      mesh(g, new THREE.CylinderGeometry(r, r, h, 6), M.blanketDark, [0, 0, 0], null, 'bus-shell');
      cyl(g, r * 0.98, r * 0.98, 0.04, M.aluminium, [0, h / 2, 0], 6);
      cyl(g, r * 0.98, r * 0.98, 0.04, M.aluminium, [0, -h / 2, 0], 6);
      break;
    }
    default: mesh(g, new THREE.BoxGeometry(w, h, d), M.blanketDark, [0, 0, 0], null, 'bus-shell');
  }
  return g;
}

export function buildHeritagePart(c) {
  const g = new THREE.Group(), [w, h, d] = c.dimensionsM;
  switch (c.shape) {
    case 'dish': dish(g, w, Math.max(0.12, h - 0.25)); break;
    case 'wing': wing(g, c); break;
    case 'rtg-stack': {
      rod(g, [0, 0, 0], [0, h, 0], 0.03);
      const unitLength = 0.5, gap = 0.12;
      for (let i = 0; i < (c.units ?? 3); i++) rtgUnit(g, h - unitLength / 2 - i * (unitLength + gap), unitLength, w / 2.6);
      break;
    }
    case 'rtg': rod(g, [0, 0, 0], [0, 0.2, 0], 0.04); rtgUnit(g, 0.2 + h / 2, h, w / 2.7); break;
    case 'scan-platform': {
      rod(g, [0, 0, 0], [0, h - 0.4, 0], 0.035);
      box(g, [w * 0.8, 0.45, d * 0.8], M.blanket, [0, h - 0.2, 0]);
      cyl(g, 0.09, 0.09, 0.35, M.black, [0.18, h - 0.2, d * 0.45], 14).rotation.x = Math.PI / 2;
      cyl(g, 0.06, 0.06, 0.25, M.black, [-0.15, h - 0.2, d * 0.45], 14).rotation.x = Math.PI / 2;
      break;
    }
    case 'boom': {
      cyl(g, 0.09, 0.09, 0.35, M.blanketDark, [0, 0.17, 0], 12);
      rod(g, [0, 0.3, 0], [0, h, 0], Math.max(0.012, w / 6), M.white);
      cyl(g, 0.06, 0.06, 0.12, M.aluminium, [0, h, 0], 12);
      cyl(g, 0.05, 0.05, 0.1, M.aluminium, [0, h * 0.62, 0], 12);
      break;
    }
    case 'thruster-cluster': case 'rcs-cluster': {
      box(g, [w * 0.6, 0.08, d * 0.6], M.aluminium, [0, 0.04, 0]);
      const n = 4;
      for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n + Math.PI / 4, x = Math.cos(a) * w * 0.28, z = Math.sin(a) * d * 0.28;
        const b = mesh(g, new THREE.CylinderGeometry(0.015, 0.04, h * 0.6, 10, 1, true), M.nozzle, [x, 0.08 + h * 0.3, z]); b.name = 'thruster'; }
      break;
    }
    case 'nozzle': {
      if (c.id === 'cas-main-engine') { box(g, [0.9, 0.12, 0.3], M.aluminium, [0, 0.06, 0]); nozzle(g, 0.07, 0.2, h, 0.06, -0.22); nozzle(g, 0.07, 0.2, h, 0.06, 0.22); }
      else nozzle(g, 0.06, w / 2.4, h);
      break;
    }
    case 'ion-cluster': {
      box(g, [w, 0.12, d * 0.5], M.aluminium, [0, 0.06, 0]);
      for (const x of [-w / 3, 0, w / 3]) { cyl(g, 0.17, 0.15, h - 0.15, M.blanketDark, [x, 0.12 + (h - 0.15) / 2, 0], 20); cyl(g, 0.15, 0.15, 0.02, M.lens, [x, h - 0.02, 0], 20).name = 'ion-grid'; }
      break;
    }
    case 'tank-sphere': mesh(g, new THREE.SphereGeometry(w / 2, 20, 14), M.titanium, [0, 0, 0], null, 'tank'); break;
    case 'tank-cylinder': {
      const r = w / 2, body = Math.max(0, h - w);
      cyl(g, r, r, body, M.titanium, [0, 0, 0], 20).name = 'tank';
      mesh(g, new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.titanium, [0, body / 2, 0]);
      mesh(g, new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.titanium, [0, -body / 2, 0]);
      break;
    }
    case 'tank-ring': for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, r = w * 0.32; mesh(g, new THREE.SphereGeometry(h / 2.4, 16, 12), M.titanium, [Math.cos(a) * r, 0, Math.sin(a) * r], null, 'tank'); } break;
    case 'pallet': {
      box(g, [w, 0.08, d], M.aluminium, [0, 0.04, 0]);
      box(g, [w * 0.4, h * 0.7, d * 0.6], M.blanket, [-w * 0.22, 0.08 + h * 0.35, 0]);
      cyl(g, d * 0.22, d * 0.22, h * 0.8, M.blanketDark, [w * 0.25, 0.08 + h * 0.4, 0], 16);
      cyl(g, d * 0.16, d * 0.16, 0.03, M.lens, [w * 0.25, 0.08 + h * 0.8, 0], 16);
      break;
    }
    case 'probe-shell': {
      cyl(g, 0.4, 0.4, 0.3, M.aluminium, [0, 0.15, 0], 16);
      const shield = mesh(g, new THREE.ConeGeometry(w / 2, h * 0.7, 32, 1, true), M.blanket, [0, 0.3 + h * 0.35, 0]);
      shield.rotation.x = Math.PI; shield.name = 'heat-shield';
      cyl(g, w / 2, w / 2, 0.05, M.white, [0, 0.3 + 0.03, 0], 32);
      break;
    }
    case 'vault': box(g, [w, h, d], M.titanium, [0, h / 2, 0]).name = 'vault'; break;
    case 'panel-antenna': box(g, [w, 0.08, d], M.blanketDark, [0, 0.04, 0]); for (const x of [-w / 3, 0, w / 3]) box(g, [w / 4, 0.03, d * 0.8], M.white, [x, 0.1, 0]); break;
    case 'camera': box(g, [w, h * 0.6, d], M.blanket, [0, h * 0.3, 0]); cyl(g, w * 0.25, w * 0.25, h * 0.4, M.black, [0, h * 0.8, 0], 14); cyl(g, w * 0.2, w * 0.2, 0.02, M.lens, [0, h, 0], 14); break;
    default: box(g, [w, h, d], M.blanketDark, [0, c.mount === 'internal' ? 0 : h / 2, 0]); box(g, [w * 0.8, h * 0.6, 0.02], M.blanket, [0, c.mount === 'internal' ? 0 : h / 2, d / 2 + 0.01]);
  }
  return g;
}
