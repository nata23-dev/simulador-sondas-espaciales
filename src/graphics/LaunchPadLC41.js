import * as THREE from 'three';

/**
 * Reconstrucción simplificada del Complejo de Lanzamiento 41 (LC-41)
 * de la Estación de la Fuerza Aérea de Cabo Cañaveral, Florida (1977).
 *
 * Coordenadas históricas: 28.5833° N, 80.5828° W.
 * Incluye:
 * - Terreno costero simplificado (perfil del cabo y costa atlántica)
 * - Plataforma de hormigón (pad apron) y trinchera deflectora de llamas
 * - Torre umbilical fija de celosía de acero (rojo y gris, configuración histórica 1977)
 * - Brazos oscilantes de servicio (swing arms)
 * - Mástil pararrayos superior
 */
export function crearPlataformaLanzamientoLC41({ escala = 1.0 } = {}) {
  const grupo = new THREE.Group();
  grupo.name = 'PlataformaLanzamiento_LC41_1977';

  // Materiales PBR
  const matHormigon = new THREE.MeshStandardMaterial({
    color: 0x8a8e94,
    roughness: 0.85,
    metalness: 0.05
  });

  const matAceroTorreRojo = new THREE.MeshStandardMaterial({
    color: 0x9b2c24,
    roughness: 0.55,
    metalness: 0.35
  });

  const matAceroGris = new THREE.MeshStandardMaterial({
    color: 0x4f545c,
    roughness: 0.45,
    metalness: 0.55
  });

  const matTerrenoCabo = new THREE.MeshStandardMaterial({
    color: 0x3d4a36,
    roughness: 0.95,
    metalness: 0.0
  });

  const matAguaAtlantico = new THREE.MeshStandardMaterial({
    color: 0x162c46,
    roughness: 0.25,
    metalness: 0.4
  });

  // 1. Terreno costero y Océano Atlántico (base circular de 60 m radio local)
  const terrenoBase = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 6.0, 0.1, 48), matTerrenoCabo);
  terrenoBase.position.y = -0.05;
  grupo.add(terrenoBase);

  // Sector de agua este (Océano Atlántico)
  const oceanoAtlantico = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 0.08, 32, 1, false, -Math.PI / 4, Math.PI / 1.4),
    matAguaAtlantico
  );
  oceanoAtlantico.position.set(1.5, -0.04, 0);
  grupo.add(oceanoAtlantico);

  // 2. Terraplén y mesa de lanzamiento de hormigón (Pad Apron)
  const mesaHormigon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 2.4), matHormigon);
  mesaHormigon.position.y = 0.11;
  grupo.add(mesaHormigon);

  // Foso deflector de llamas (Flame trench debajo del cohete)
  const trincheraLlamas = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.15, 1.4), matAceroGris);
  trincheraLlamas.position.set(0, 0.12, 0);
  grupo.add(trincheraLlamas);

  // Cuatro apoyos de lanzamiento del vehículo (hold-down arms)
  for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
    const apoyo = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), matAceroGris);
    apoyo.position.set(x, 0.24, z);
    grupo.add(apoyo);
  }

  // 3. Torre umbilical fija de celosía de acero (LC-41 Umbilical Tower 1977)
  const grupoTorre = new THREE.Group();
  grupoTorre.name = 'TorreUmbilical_LC41';
  grupoTorre.position.set(0.62, 0.22, 0);

  const altoTorre = 4.2;
  const anchoTorre = 0.38;

  // 4 columnas principales de acero de la torre
  for (const [dx, dz] of [[-anchoTorre / 2, -anchoTorre / 2], [anchoTorre / 2, -anchoTorre / 2], [-anchoTorre / 2, anchoTorre / 2], [anchoTorre / 2, anchoTorre / 2]]) {
    const columna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, altoTorre, 8), matAceroTorreRojo);
    columna.position.set(dx, altoTorre / 2, dz);
    grupoTorre.add(columna);
  }

  // Plataformas horizontales y tirantes diagonales a lo largo de la torre
  const niveles = 9;
  for (let n = 1; n <= niveles; n++) {
    const yNivel = (altoTorre / niveles) * n;
    const plataforma = new THREE.Mesh(new THREE.BoxGeometry(anchoTorre + 0.06, 0.025, anchoTorre + 0.06), matAceroGris);
    plataforma.position.set(0, yNivel, 0);
    grupoTorre.add(plataforma);
  }

  // Mástil pararrayos superior
  const mastilPararrayos = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 0.9, 8), matAceroGris);
  mastilPararrayos.position.set(0, altoTorre + 0.45, 0);
  grupoTorre.add(mastilPararrayos);

  // Brazos oscilantes de servicio (Swing Arms hacia el vehículo)
  // 1. Brazo interetapa Titan
  const brazo1 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.05), matAceroGris);
  brazo1.position.set(-0.24, 2.1, 0);
  grupoTorre.add(brazo1);

  // 2. Brazo de servicio criogénico Centaur (LH2 / LOX)
  const brazo2 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.05), matAceroGris);
  brazo2.position.set(-0.24, 3.2, 0);
  grupoTorre.add(brazo2);

  // 3. Brazo umbilical de sala blanca / cubierta de carga (Centaur Standard Shroud)
  const brazo3 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.06), matAceroGris);
  brazo3.position.set(-0.21, 3.9, 0);
  grupoTorre.add(brazo3);

  grupo.add(grupoTorre);

  // 4. Postes de iluminación perimetral
  for (const angulo of [0.6, 2.2, 3.8, 5.2]) {
    const radioPoste = 2.1;
    const px = Math.cos(angulo) * radioPoste;
    const pz = Math.sin(angulo) * radioPoste;
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.8, 6), matAceroGris);
    poste.position.set(px, 0.4, pz);
    const foco = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.04), matHormigon);
    foco.position.set(px, 0.8, pz);
    grupo.add(poste, foco);
  }

  grupo.scale.setScalar(escala);

  function retraerBrazosServicio(progreso) {
    const t = THREE.MathUtils.clamp(progreso, 0, 1);
    const rot = t * (Math.PI / 2.5);
    brazo1.rotation.y = rot;
    brazo2.rotation.y = rot;
    brazo3.rotation.y = rot;
  }

  function destruir() {
    grupo.traverse(node => {
      if (node.isMesh) {
        node.geometry?.dispose();
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
        else node.material?.dispose();
      }
    });
  }

  return {
    grupo,
    retraerBrazosServicio,
    destruir,
    alturaMesa: 0.22 * escala
  };
}
