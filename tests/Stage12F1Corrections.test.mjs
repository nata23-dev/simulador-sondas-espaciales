// Etapa 12F.1 — correcciones funcionales: cámara local en el contacto, mensajes por tipo de misión, panel del módulo
// visible y tolerancias de contacto documentadas por separado (OBS-12F-01 y OBS-12F-02 de la auditoría de Gemini).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getBodyProfile } from '../src/lab/CelestialBodyMissionRegistry.js';
import { DEMO_LANDER } from '../src/lab/BodyLandingVehicle.js';
import { DEFAULT_DESCENT_ORBIT, simulateLanding } from '../src/lab/BodyLandingSimulation.js';
import { CONTACT_BRACKET_SECONDS, CONTACT_PREDICATE_KM, LANDING_ABS_TOL } from '../src/lab/BodyLandingDynamics.js';
import { localCameraGeometry, localGroundPoint, missionCameraPose } from '../src/lab/MissionExecutionView.js';
import { landingOutcomeText, preparedMessage, resetMessage } from '../src/ui/MissionControlCenter.js';

const MOON = getBodyProfile('301');
const moonLanding = () => simulateLanding({ profile: MOON, lander: structuredClone(DEMO_LANDER), payloadMassKg: 561, options: { orbit: { ...DEFAULT_DESCENT_ORBIT }, guidance: {} } });

test('Z-A: cámara local de un descenso: mira exactamente al vehículo, horizonte con la vertical local y estados intactos', () => {
  const R = 1737.4, execution = { kind: 'landing', transfer: { bodyRadiusKm: R, sceneScale: 0.63710084 / R, moonArrivalPositionKm: [R, 0, 0], overviewMinDistance: 2.4 } };
  const touchdown = { positionKm: [-1670.44, -413.693, -238.846].map(x => x * R / Math.hypot(1670.44, 413.693, 238.846)), velocityKmS: [0.00126, 0.00028, 0.00016], moonPositionKm: [0, 0, 0] };
  const copy = structuredClone(touchdown);
  const g = localCameraGeometry(touchdown, execution), pose = missionCameraPose('local', touchdown, execution);
  assert.ok(pose.up.distanceTo(g.up) < 1e-12, 'la cámara usa la vertical local como «arriba»');
  // El objetivo es el centro del modelo apoyado en el punto material: punto calculado + media altura visual sobre la vertical.
  assert.ok(pose.target.clone().sub(g.position).normalize().distanceTo(g.up) < 1e-9, 'objetivo sobre la vertical del vehículo');
  assert.ok(pose.target.distanceTo(g.position) < g.distance, 'objetivo pegado al vehículo, no al suelo lejano');
  const toCamera = pose.position.clone().sub(pose.target);
  assert.ok(toCamera.dot(g.up) > 0, 'la cámara queda por encima del suelo, no dentro del cuerpo');
  assert.ok(pose.position.length() > g.radiusScene, 'cámara fuera de la esfera central');
  assert.ok(Math.abs(localGroundPoint(touchdown, execution).length() - g.radiusScene) < 1e-12, 'parche de suelo a radio R exacto');
  assert.deepEqual(touchdown, copy, 'el estado científico no cambia');
  // Determinismo: el encuadre depende solo del instante, no de saltos previos (no hay suavizado en esta vista).
  const far = { ...touchdown, positionKm: touchdown.positionKm.map(x => x * 1.2) };
  missionCameraPose('local', far, execution);
  assert.ok(missionCameraPose('local', touchdown, execution).target.distanceTo(pose.target) < 1e-15);
  const launch = { transfer: { moonArrivalPositionKm: [7000, 0, 0], overviewMinDistance: 2.4 } };
  const s = { positionKm: [6371.0184, 0, 0], velocityKmS: [0, 0.4, 0], moonPositionKm: [0, 0, 0] };
  assert.ok(missionCameraPose('local', s, launch).target.distanceTo(localCameraGeometry(s, launch).position) < 1e-12, 'el lanzamiento (12E.1) conserva su objetivo');
});

test('Z-B: mensajes según el cuerpo central y la fase; aterrizaje suave ≠ misión completa ≠ viabilidad operativa', () => {
  assert.equal(preparedMessage({ kind: 'landing', simulation: { bodyName: 'Luna' } }), 'Descenso preparado en la órbita inicial alrededor de Luna (marco inercial local).');
  assert.doesNotMatch(preparedMessage({ kind: 'landing', simulation: { bodyName: 'Europa' } }), /terrestre/);
  assert.match(preparedMessage({ kind: 'launch' }), /plataforma/);
  assert.match(preparedMessage({ kind: 'interplanetary', result: { originName: 'Tierra', destinationName: 'Marte' } }), /salida heliocéntrica desde Tierra hacia Marte/);
  assert.equal(preparedMessage({ kind: 'impulsive' }), 'Misión preparada en la órbita terrestre inicial.', 'el plan Tierra–Luna conserva su mensaje correcto');
  assert.doesNotMatch(resetMessage({ kind: 'landing' }), /impulso/);
  const text = landingOutcomeText('Contacto y evaluación', { classification: 'ATERRIZAJE SUAVE SEGÚN EL MODELO' });
  assert.match(text, /ATERRIZAJE SUAVE SEGÚN EL MODELO \(descenso local aislado\)/);
  assert.match(text, /Misión completa \(viaje, llegada y descenso conectados\): no evaluada/);
  assert.match(text, /Viabilidad operativa: no verificada/);
  assert.doesNotMatch(text, /Éxito de misión: No verificable/, 'sin la fórmula ambigua anterior');
});

test('Z-C: el panel del módulo de aterrizaje se muestra abierto y declara que es editable (sin cambiar valores ni presets)', () => {
  const source = readFileSync('src/ui/LandingPlanner.js', 'utf8');
  assert.match(source, /<details class="ft-section" open><summary>Módulo de aterrizaje \(ilustrativo · editable\)<\/summary>/);
  assert.equal(DEMO_LANDER.engine.thrustMaxN > 0, true);
});

test('Z-D: tolerancias del contacto separadas: predicado, intervalo temporal, cota espacial e integración', () => {
  const s = moonLanding();
  const ct = s.diagnostics.contactTolerances;
  assert.ok(ct, 'informe de tolerancias presente');
  assert.equal(ct.predicateToleranceKm, CONTACT_PREDICATE_KM); assert.equal(CONTACT_PREDICATE_KM, 1e-9);
  assert.ok(ct.bracketSeconds > 0 && ct.bracketSeconds <= CONTACT_BRACKET_SECONDS, `intervalo ${ct.bracketSeconds} s`);
  assert.ok(Math.abs(ct.spatialBoundKm - ct.radialSpeedKmS * ct.bracketSeconds) < 1e-18, 'cota = |v_r|·Δt');
  // El residuo radial está bajo R − 1e-9 km y, como mucho, una cota |v_r|·Δt más abajo (con 1 % de margen numérico).
  assert.ok(ct.observedResidualKm <= -CONTACT_PREDICATE_KM, `residuo ${ct.observedResidualKm} km`);
  assert.ok(ct.observedResidualKm >= -(CONTACT_PREDICATE_KM + 1.01 * ct.spatialBoundKm + 1e-12), `residuo ${ct.observedResidualKm} km frente a cota ${ct.spatialBoundKm}`);
  // Ejemplo del enunciado: a 1,5 km/s un intervalo de 1e-7 s son 0,15 mm, 150 veces la tolerancia del predicado.
  assert.ok(Math.abs(1.5 * 1e-7 - 1.5e-7) < 1e-20 && 1.5e-7 / CONTACT_PREDICATE_KM > 100);
  assert.equal(ct.integrationTolerance.absPositionKm, LANDING_ABS_TOL[0]);
  const doc = readFileSync('docs/FUNDAMENTO_CIENTIFICO.md', 'utf8');
  assert.match(doc, /intervalo temporal/i); assert.match(doc, /predicado geométrico/i);
});
