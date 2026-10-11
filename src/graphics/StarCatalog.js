import * as THREE from 'three';

const OBLICUIDAD_J2000 = THREE.MathUtils.degToRad(84381.448 / 3600);
const COS_OBLICUIDAD = Math.cos(OBLICUIDAD_J2000);
const SIN_OBLICUIDAD = Math.sin(OBLICUIDAD_J2000);

// ICRS -> eclíptica J2000 -> ejes visuales de SolarSystem.js (x, z, -y).
export function direccionICRSEscena(ascensionRecta, declinacion) {
  const ra = THREE.MathUtils.degToRad(ascensionRecta);
  const dec = THREE.MathUtils.degToRad(declinacion);
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  const yEcliptica = COS_OBLICUIDAD * y + SIN_OBLICUIDAD * z;
  const zEcliptica = -SIN_OBLICUIDAD * y + COS_OBLICUIDAD * z;
  return new THREE.Vector3(x, zEcliptica, -yEcliptica);
}

export async function cargarCatalogoHipparcos() {
  const ruta = `${import.meta.env.BASE_URL}data/hipparcos-vmag-6p5.tsv`;
  const respuesta = await fetch(ruta);
  if (!respuesta.ok) throw new Error(`No se pudo cargar Hipparcos (${respuesta.status}).`);

  const registros = [];
  for (const linea of (await respuesta.text()).split(/\r?\n/)) {
    if (!/^\d+\.\d+\t[+-]?\d+\.\d+\t/.test(linea)) continue;
    const [raTexto, decTexto, , magnitudTexto, indiceTexto] = linea.split('\t');
    const ra = Number(raTexto);
    const dec = Number(decTexto);
    const magnitud = Number(magnitudTexto);
    const indiceBV = indiceTexto.trim() === '' ? NaN : Number(indiceTexto);
    if (![ra, dec, magnitud].every(Number.isFinite)) continue;
    registros.push(ra, dec, magnitud, indiceBV);
  }

  if (registros.length === 0) throw new Error('El catálogo Hipparcos no contiene estrellas válidas.');
  return new Float32Array(registros);
}
