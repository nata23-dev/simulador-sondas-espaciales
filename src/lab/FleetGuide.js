// Etapa 16 — guía de la flota: qué consigue cada sonda en cada herramienta del laboratorio según el modelo.
// No son datos históricos ni estimaciones: son resultados del propio motor con los valores por defecto de cada herramienta,
// y tests/Stage16Coherence.test.mjs los recalcula. Si el motor cambia, la prueba falla antes de que la interfaz prometa algo
// que ya no ocurre. Sin DOM ni Three.js.

export const FLEET_PROBE_IDS = Object.freeze(['voyager', 'cassini', 'dawn', 'juno']);
const OK = 'ok', FAIL = 'fail';

// «Misión completa»: resultado de cada escenario de demostración con cada sonda (mismo perfil que el Planificador).
export const SCENARIO_OUTCOMES = Object.freeze({
  A1: Object.freeze({
    voyager: [FAIL, 'agota sus 100 kg de hidracina en la captura y sigue de largo'],
    cassini: [OK, 'queda en órbita de Marte con su motor principal'],
    dawn: [FAIL, 'su motor iónico no puede frenar en un solo encendido'],
    juno: [OK, 'queda en órbita de Marte con su motor principal'] }),
  A2: Object.freeze({
    voyager: [FAIL, 'agota la hidracina'], cassini: [FAIL, 'el encendido es tan largo que choca con Marte'],
    dawn: [FAIL, 'su motor iónico no puede frenar'], juno: [FAIL, 'el encendido es tan largo que choca con Marte'] }),
  A3: Object.freeze({
    voyager: [OK, 'sobrevuelo balístico, sin encendidos'], cassini: [OK, 'sobrevuelo balístico, sin encendidos'],
    dawn: [OK, 'sobrevuelo balístico, sin encendidos'], juno: [OK, 'sobrevuelo balístico, sin encendidos'] }),
  C1: Object.freeze({
    voyager: [FAIL, 'no tiene propelente para capturarse en Júpiter'],
    cassini: [OK, 'captura en Júpiter y sobrevuelo de Europa'],
    dawn: [FAIL, 'a 5,2 AU sus paneles no dan potencia al motor iónico'],
    juno: [OK, 'captura en Júpiter y sobrevuelo de Europa'] }),
  C2: Object.freeze({
    voyager: [FAIL, 'no tiene propelente para capturarse en Júpiter'],
    cassini: [FAIL, 'se queda sin propelente para frenar en Europa'],
    dawn: [FAIL, 'a 5,2 AU sus paneles no dan potencia al motor iónico'],
    juno: [FAIL, 'se queda sin propelente para frenar en Europa'] })
});

/** Resultado esperado de un escenario con una sonda: { ok, text } o null si no hay dato. */
export function scenarioOutcome(scenarioId, probeId) {
  const entry = SCENARIO_OUTCOMES[scenarioId]?.[probeId];
  return entry ? Object.freeze({ ok: entry[0] === OK, text: entry[1] }) : null;
}
/** Sondas con las que un escenario termina completo según el modelo. */
export const probesCompleting = scenarioId => FLEET_PROBE_IDS.filter(id => scenarioOutcome(scenarioId, id)?.ok);

// «Tierra–Luna»: condiciones por defecto del Planificador y altitud inicial recomendada para cada sonda.
// minimumAltitudeKm: primera altitud de la exploración (200, 1000, 5000, 20 000, 35 786, 50 000… km) en que el plan es viable.
export const LUNAR_DEFAULTS = Object.freeze({ departureTdb: '2026-10-15T12:00', objective: 'approach', targetDistanceKm: 50000, defaultAltitudeKm: 100000 });
export const LUNAR_GUIDE = Object.freeze({
  voyager: Object.freeze({ altitudeKm: 150000, status: 'VIABLE SEGÚN EL MODELO', minimumAltitudeKm: 150000,
    text: 'Voyager solo lleva 100 kg de hidracina (unos 280 m/s de Δv ideal): según el modelo, únicamente llega a la Luna saliendo desde muy lejos, unos 150 000 km.' }),
  cassini: Object.freeze({ altitudeKm: 100000, status: 'VIABLE SEGÚN EL MODELO', minimumAltitudeKm: 50000,
    text: 'Desde 200 km a Cassini le falta Δv; según el modelo, el plan es viable a partir de unos 50 000 km de altitud inicial.' }),
  dawn: Object.freeze({ altitudeKm: 100000, status: 'NO VERIFICABLE', minimumAltitudeKm: null,
    text: 'Dawn usa un motor iónico de 92 mN: no puede dar la inyección como un impulso, así que el plan sale «no verificable» a cualquier altitud. Prueba su motor en «Empuje finito», más abajo.' }),
  juno: Object.freeze({ altitudeKm: 100000, status: 'VIABLE SEGÚN EL MODELO', minimumAltitudeKm: 35786,
    text: 'Desde 200 km a Juno le falta Δv; según el modelo, el plan es viable a partir de la órbita geoestacionaria (unos 36 000 km).' })
});

// Misión guiada para quien llega por primera vez: un caso que el motor completa de principio a fin.
export const GUIDED_MISSION = Object.freeze({ probeId: 'cassini', scenarioId: 'A1', destinationName: 'Marte' });
