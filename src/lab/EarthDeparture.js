// Etapa 21 — salida desde la plataforma: lanzamiento de 12E → órbita de aparcamiento → inyección de empuje finito → hipérbola de
// escape → salida de la esfera de influencia (SOI) terrestre, apuntada para empalmar con el crucero heliocéntrico.
//
// Sin DOM ni Three.js. Tierra puntual (mismo GM que 12E y el catálogo), sin J2, sin la Luna ni el Sol dentro de la SOI (cónicas
// parcheadas, como el resto de la cadena). El ascenso es el de 12E sin cambios (atmósfera US-1976 corrotante, Tierra que gira);
// se calcula una vez con ángulo de rotación inicial 0 y se gira alrededor del eje terrestre al instante del despegue. En ese
// modelo es equivalente a recalcularlo con otro ángulo inicial salvo el error de integración (0,23 m en la posición final y 5·10⁻⁵ s en el corte de la circularización, medidos
// en tests/Stage21LaunchInjection.test.mjs). Después todo se integra en ejes eclípticos J2000.
//
// Apuntado: incógnitas x = (instante del despegue, duración del aparcamiento, duración de la inyección); condición en la salida de
// la SOI, frente a la velocidad que pide el Lambert del crucero desde ESE punto y en ESE instante (`requiredVelocityAt`):
//   · empalme 'asymptote' (por defecto desde la etapa 28, el convencional de las cónicas parcheadas): velocidad de la Tierra + v∞ de la
//     asíntota de salida de la hipérbola = velocidad pedida. El C3 es el del centro de la Tierra. En la frontera la velocidad de la
//     hipérbola es algo mayor que la del crucero (≈ μ⊕/(R_SOI·v∞), unos 0,14 km/s con v∞ = 3 km/s): es lo que la gravedad terrestre
//     fuera de la SOI le quita hasta el infinito y que las cónicas, que la ignoran allí, aplican de golpe en la frontera. Es el único
//     salto de velocidad de la cadena; se declara (no es un encendido).
//   · empalme 'velocity' (el de la etapa 21, conservado para compararlo): velocidad de la hipérbola en la frontera = velocidad pedida.
//     Trayectoria continua, pero el C3 baja en ≈ 2μ⊕/R_SOI (0,86 km²/s²): con la Tierra actuando también fuera de la SOI la nave llega
//     millones de km lejos (medido en la etapa 22).
// Newton amortiguado con jacobiano por diferencias finitas. El despegue gira el plano de la órbita de aparcamiento alrededor del
// eje terrestre (ascensión recta de la asíntota), el aparcamiento coloca la asíntota en el plano (declinación) y la inyección fija
// su módulo (C3). La declinación alcanzable no supera la inclinación de la órbita de aparcamiento: si el acimut es «auto», se busca
// el acimut con la inclinación necesaria.
import { simulateLaunch, DEFAULT_GUIDANCE, DEFAULT_SCHEDULE } from './LaunchSimulation.js';
import { DEMO_LAUNCHER, scaleLauncher } from './LaunchVehicle.js';
import { ORBIT_CLASSES } from './LaunchOrbit.js';
import { EARTH_GM_KM3_S2 } from './LaunchEarth.js';
import { propagateFiniteThrust, massFlowKgS, tsiolkovskyDeltaVMS, G0_M_S2, FiniteThrustError } from './FiniteThrustDynamics.js';
import { propagateKepler } from '../science/KeplerPropagator.js';
import { TITAN_IIIE_CENTAUR, LC41 } from '../science/VoyagerLaunchProfile.js';
import { launchFrameToEclipticJ2000, applyMatrix, transposeMatrix, precessionMatrixJ2000ToDate, greenwichMeanSiderealDeg } from '../science/EarthOrientation.js';
import { eclipticJ2000ToIcrfEquatorial } from '../science/Frames.js';
import { tdbToTimeScales } from '../science/AstrodynamicsTime.js';
import { propagateNBody, NBODY_PERTURBERS, NBodyDataError } from './NBodyCruise.js';
import { IntegrationError } from '../science/NumericalIntegrator.js';

export const EARTH_DEPARTURE_VERSION = '28-earth-departure-2';
/** 28: modelos de empalme en la frontera de la SOI terrestre (véase el comentario de cabecera). */
export const DEPARTURE_PATCH_MODELS = Object.freeze({
  asymptote: Object.freeze({ id: 'asymptote', label: 'Asíntota (cónicas parcheadas convencionales)' }),
  velocity: Object.freeze({ id: 'velocity', label: 'Velocidad en la frontera (etapa 21)' })
});
const DEG = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => scale(a, 1 / norm(a));

/**
 * 28: velocidad de exceso hiperbólico (km/s, vector de la asíntota de SALIDA) de un estado (r, v) respecto a un cuerpo de parámetro μ.
 * |v∞|² = v² − 2μ/r (C3) y su dirección es la del radio en la anomalía verdadera límite ν∞ = acos(−1/e):
 * ŝ = (−ê + √(e² − 1)·(ĥ × ê)) / e. null si la órbita no es hiperbólica (o es rectilínea).
 */
export function hyperbolicExcessVelocity(r, v, mu) {
  const rn = norm(r), c3 = dot(v, v) - 2 * mu / rn, h = cross(r, v), hn = norm(h);
  if (!(c3 > 0) || !(hn > 0)) return null;
  const ev = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rn)), e = norm(ev);
  if (!(e > 1)) return null;
  const eh = scale(ev, 1 / e), side = cross(scale(h, 1 / hn), eh), k = Math.sqrt(e * e - 1);
  return scale(add(scale(eh, -1), scale(side, k)), Math.sqrt(c3) / e);
}

// Etapa de inyección: Centaur D-1T, la que inyectó a las Voyager (también a Viking y Helios). Empuje, Isp y masas del resumen de
// sistemas de 1973 (los mismos de la etapa 25). Simplificaciones declaradas: aquí no se enciende durante el ascenso (en vuelo,
// el primer encendido, MES-1, completaba la órbita de aparcamiento), no hay evaporación y la dirección de empuje es progrado.
const c = TITAN_IIIE_CENTAUR.centaur;
export const CENTAUR_D1T = Object.freeze({ id: 'centaur-d1t', name: 'Centaur D-1T (2 × RL10A-3-3)', thrustN: c.empujeN, ispS: c.ispVacioS,
  propellantKg: c.propulsanteKg, dryMassKg: c.masaSecaKg,
  provenance: 'Centaur D-1T del Titan IIIE-Centaur: empuje (30 000 lbf), Isp (444 s), propelente (29 750 lb) y masa seca (4 400 lb) del resumen de sistemas de 1973, los mismos de la etapa 25.' });

// Lanzador hasta la órbita de aparcamiento: el demostrativo de 12E escalado ×9 (masas y empujes ×9; mismo empuje/peso, Isp y Cd).
// Es ilustrativo, como el pesado ×2,5 de la etapa 16: no corresponde a ningún cohete real. Su capacidad con el programa de
// ascenso por defecto (acimut 90°) se mide por bisección en las pruebas (≈ 24,6 t), suficiente para la Centaur llena (15,5 t)
// y cualquier sonda de la flota.
export const DEPARTURE_LAUNCHER_SCALE = 9;
export const DEPARTURE_LAUNCHER = scaleLauncher(DEMO_LAUNCHER, DEPARTURE_LAUNCHER_SCALE, { id: 'demo-two-stage-superheavy-v1', name: 'Lanzador demostrativo superpesado (×9)' });
export const DEPARTURE_LAUNCHER_CAPACITY_KG = 24600;

// Sitio: LC-41 de Cabo Cañaveral (coordenadas de la etapa 25). La altitud de la plataforma no está en las fuentes del proyecto: 0 m.
export const DEPARTURE_SITE = Object.freeze({ name: LC41.nombre, latDeg: LC41.latDeg, lonDeg: LC41.lonDeg, altitudeM: 0 });
// La etapa 2 del lanzador circulariza y se separa al alcanzar la órbita (sin tramo balístico posterior en 12E).
export const DEPARTURE_LAUNCH_SCHEDULE = Object.freeze({ ...DEFAULT_SCHEDULE, postCoastSeconds: 0 });
export const DEPARTURE_TARGET_ORBIT = Object.freeze({ minPerigeeAltitudeKm: 160, maxApogeeAltitudeKm: 2000, targetAltitudeKm: 200, inclinationDeg: null, inclinationToleranceDeg: 1 });

export const DEPARTURE_STATUS = Object.freeze({ designed: 'apuntada', launch: 'sin órbita de aparcamiento', declination: 'declinación inalcanzable',
  upperStage: 'sin Δv en la etapa de inyección', aim: 'apuntado del crucero fallido', convergence: 'sin convergencia' });
export const DEPARTURE_TARGETING = Object.freeze({ toleranceKmS: 1e-8, acceptKmS: 1e-7, maxIterations: 20, maxParkingCoastSeconds: 3 * 3600, declinationMarginDeg: 0.5 });

const gravity = mu => (t, s, out) => {
  const r2 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2], k = -mu / (r2 * Math.sqrt(r2));
  out[0] = s[3]; out[1] = s[4]; out[2] = s[5]; out[3] = k * s[0]; out[4] = k * s[1]; out[5] = k * s[2];
};

export function departureLaunchOptions(azimuthDeg, { liftoffJdTdb = null, earthRotationAngleDeg = 0 } = {}) {
  const label = liftoffJdTdb == null ? '2000-01-01T12:00:00Z' : tdbToTimeScales(liftoffJdTdb).labelUtc.replace(' · ', 'T').replace(' UTC', 'Z');
  return { site: { latDeg: DEPARTURE_SITE.latDeg, lonDeg: DEPARTURE_SITE.lonDeg, altitudeM: DEPARTURE_SITE.altitudeM }, launchDateUtc: label,
    earthRotationAngleDeg, azimuthDeg, guidance: DEFAULT_GUIDANCE, schedule: DEPARTURE_LAUNCH_SCHEDULE, target: DEPARTURE_TARGET_ORBIT };
}

const inclinationDeg = (r, v) => { const h = cross(r, v); return Math.acos(Math.max(-1, Math.min(1, h[2] / norm(h)))) / DEG; };

/** Tiempo desde el estado (r, v) de una hipérbola de salida hasta |r| = rTarget (rama saliente). null si no es hiperbólica. */
export function hyperbolicTimeToRadius(r, v, mu, rTarget) {
  const rn = norm(r), energy = dot(v, v) / 2 - mu / rn;
  if (!(energy > 0)) return null;
  const a = -mu / (2 * energy), h = norm(cross(r, v)), e = Math.sqrt(1 + 2 * energy * h * h / (mu * mu));
  const Fof = radius => { const x = (1 - radius / a) / e; return Math.acosh(Math.max(1, x)); };
  const F0 = Math.sign(dot(r, v)) * Fof(rn), F1 = Fof(rTarget);
  const n = Math.sqrt(mu / (-a) ** 3), M = F => e * Math.sinh(F) - F;
  return (M(F1) - M(F0)) / n;
}

/**
 * 28: gravedad terrestre FUERA de la SOI en el apuntado de la salida. La asíntota corrige la energía (el C3), pero la Tierra sigue
 * tirando de la nave más allá de la frontera: frente a una cónica que sale de la SOI con la velocidad de la asíntota, la nave real va
 * por delante una distancia que crece como (μ⊕/v∞²)·ln(r/R_SOI) y que el Sol amplifica a lo largo del crucero (≈ 0,5 millones de km
 * en la llegada de A1). Aquí se mide esa diferencia con el estado REAL de la nave en la frontera, propagado con el Sol y la Tierra
 * (DOPRI54, como el crucero de n cuerpos de la etapa 22, con el GM de la Luna sumado en el centro de la Tierra), hasta la llegada
 * del crucero cónico. Devuelve la corrección de la velocidad pedida que la anula a primer orden: Δ = −(∂r_llegada/∂v)⁻¹ · fallo,
 * con la sensibilidad de la cónica (diferencias finitas sobre Kepler). IntegratedMission la suma a la velocidad pedida y vuelve a
 * apuntar la salida hasta que el fallo baja de `EARTH_BEYOND_SOI.toleranceKm`.
 * `input` = { stateAt(ephemerisId, jd) → { positionKm } | null, exit: { jdTdb, helioPositionKm, helioVelocityActualKmS },
 *   cruiseVelocityKmS (la del Lambert desde la frontera), arrivalJdTdb, muSun }.
 */
export const EARTH_BEYOND_SOI = Object.freeze({ toleranceKm: 1, maxRounds: 8, jacobianStepKmS: 1e-5,
  perturbers: Object.freeze(NBODY_PERTURBERS.filter(p => p.id === '399')) });
export function earthBeyondSoiCorrection({ stateAt, exit, cruiseVelocityKmS, arrivalJdTdb, muSun }) {
  const X = exit.helioPositionKm, dt = (arrivalJdTdb - exit.jdTdb) * 86400;
  if (!(dt > 0)) return { ok: false, reason: 'la llegada no es posterior a la salida de la SOI' };
  const conicEnd = v => propagateKepler(X, v, dt, muSun).positionKm, target = conicEnd(cruiseVelocityKmS);
  let real;
  try {
    real = propagateNBody({ stateAt, positionKm: X, velocityKmS: exit.helioVelocityActualKmS, startJdTdb: exit.jdTdb, endJdTdb: arrivalJdTdb, perturbers: EARTH_BEYOND_SOI.perturbers });
  } catch (error) {
    if (error instanceof NBodyDataError || error instanceof IntegrationError) return { ok: false, reason: error.message };
    throw error;
  }
  const miss = sub(real.positionKm, target), h = EARTH_BEYOND_SOI.jacobianStepKmS, J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < 3; k++) {
    const v = cruiseVelocityKmS.slice(); v[k] += h; const r = conicEnd(v);
    for (let i = 0; i < 3; i++) J[i][k] = (r[i] - target[i]) / h;
  }
  const correction = solveLinear3(J, scale(miss, -1));
  if (!correction) return { ok: false, reason: 'sensibilidad de la cónica singular' };
  return { ok: true, missKm: norm(miss), missVector: miss, correctionKmS: correction, steps: real.steps, arrivalVelocityKmS: real.velocityKmS };
}
function solveLinear3(J, b) {
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(J); if (!(Math.abs(D) > 0)) return null;
  return [0, 1, 2].map(k => det(J.map((row, i) => row.map((val, j) => (j === k ? b[i] : val)))) / D);
}

/**
 * `input`: { payloadMassKg, liftoffGuessJdTdb, earthStateAt(jd) → { positionKm, velocityKmS } | null, requiredVelocityAt(posKm, jd)
 *   → velocidad heliocéntrica | null, soiRadiusKm, azimuthDeg ('auto' | número), launcher?, upperStage?, previous? (solución
 *   anterior, para recalcular con otra llegada) }.
 */
export function designEarthDeparture(input) {
  const { payloadMassKg, liftoffGuessJdTdb: tg, earthStateAt, requiredVelocityAt, soiRadiusKm } = input;
  const patch = input.patch ?? DEPARTURE_PATCH_MODELS.asymptote.id;
  if (!DEPARTURE_PATCH_MODELS[patch]) throw new RangeError(`Empalme desconocido: ${patch}`);
  const launcher = input.launcher ?? DEPARTURE_LAUNCHER, upper = input.upperStage ?? CENTAUR_D1T, mu = EARTH_GM_KM3_S2;
  const cfg = { ...DEPARTURE_TARGETING, ...(input.targeting ?? {}) };
  const stackKg = payloadMassKg + upper.dryMassKg + upper.propellantKg, dryKg = payloadMassKg + upper.dryMassKg;
  const engine = { thrustN: upper.thrustN, ispS: upper.ispS }, flow = massFlowKgS(upper.thrustN, upper.ispS), fullBurnS = upper.propellantKg / flow;
  const base = { model: EARTH_DEPARTURE_VERSION, patch, launcherName: launcher.name, upperStage: upper, site: DEPARTURE_SITE, payloadMassKg, stackMassKg: stackKg, soiRadiusKm };
  const fail = (status, reason, extra = {}) => Object.freeze({ ...base, ...extra, status, ok: false, reason });

  // Asíntota pedida si se saliera del centro de la Tierra en la fecha prevista (solo para el valor inicial y el acimut).
  const e0 = earthStateAt(tg);
  if (!e0) return fail(DEPARTURE_STATUS.aim, 'Efemérides de la Tierra no disponibles en la fecha de salida.');
  const v0 = requiredVelocityAt(e0.positionKm, tg);
  if (!v0) return fail(DEPARTURE_STATUS.aim, 'El crucero no puede apuntarse desde la Tierra en la fecha de salida.');
  const vInf0 = sub(v0, e0.velocityKmS), sEq = unit(eclipticJ2000ToIcrfEquatorial(vInf0));
  const declinationDeg = Math.asin(sEq[2]) / DEG;

  // 1. Ascenso (12E) y acimut.
  const ascend = az => simulateLaunch({ launcher, payloadMassKg: stackKg, options: departureLaunchOptions(az) });
  const reached = sim => sim.orbit.classification === ORBIT_CLASSES.orbit;
  let azimuthDeg = input.azimuthDeg ?? 'auto', ascent, azimuthNote, launcherLimit = false;
  if (azimuthDeg === 'auto') {
    ascent = ascend(90); azimuthDeg = 90;
    const i90 = reached(ascent) ? inclinationDeg(ascent.final.positionKm, ascent.final.velocityKmS) : null;
    if (i90 != null && Math.abs(declinationDeg) > i90 - cfg.declinationMarginDeg) {
      // Rama noreste: la inclinación crece al bajar el acimut. Bisección hasta |δ| + 1°.
      const want = Math.min(89, Math.abs(declinationDeg) + 1);
      let lo = 1, hi = 90;
      for (let k = 0; k < 30 && hi - lo > 0.01; k++) {
        const mid = (lo + hi) / 2, sim = ascend(mid);
        if (!reached(sim)) { lo = mid; launcherLimit = true; continue; } // con acimutes menores el lanzador no llega a la órbita
        if (inclinationDeg(sim.final.positionKm, sim.final.velocityKmS) > want) lo = mid; else hi = mid;
      }
      azimuthDeg = Math.round(hi * 100) / 100; ascent = ascend(azimuthDeg);
      azimuthNote = `Acimut ${azimuthDeg.toFixed(2)}° (hacia el noreste): con 90° la inclinación (${i90.toFixed(2)}°) no supera en ${cfg.declinationMarginDeg}° la declinación de la asíntota (${declinationDeg.toFixed(2)}°); se busca una inclinación de |δ| + 1°.`;
    } else azimuthNote = 'Acimut 90° (este): la inclinación resultante contiene la declinación de la asíntota.';
  } else { ascent = ascend(azimuthDeg); azimuthNote = `Acimut fijado: ${azimuthDeg}°.`; }
  if (!reached(ascent)) {
    return fail(DEPARTURE_STATUS.launch, `${launcher.name} no alcanza la órbita de aparcamiento con ${(stackKg / 1000).toFixed(1)} t (sonda y ${upper.name} llena) y acimut ${azimuthDeg}°: ${ascent.orbit.classification}. ${ascent.orbit.reasons?.join(' ') ?? ''}`.trim(),
      { ascent, azimuthDeg, declinationDeg });
  }
  const tAsc = ascent.final.elapsedSeconds, r0 = ascent.final.positionKm, vp0 = ascent.final.velocityKmS;
  const parkingInclinationDeg = inclinationDeg(r0, vp0);
  if (Math.abs(declinationDeg) > parkingInclinationDeg - 0.05) {
    const limit = launcherLimit ? ` Es la inclinación máxima con esta carga: con un acimut menor que ${azimuthDeg}° ${launcher.name} no llega a la órbita de aparcamiento con ${(stackKg / 1000).toFixed(1)} t.` : '';
    return fail(DEPARTURE_STATUS.declination, `La asíntota de salida tiene declinación ${declinationDeg.toFixed(2)}° y la órbita de aparcamiento ${parkingInclinationDeg.toFixed(2)}° de inclinación: no la contiene.${limit}`,
      { ascent, azimuthDeg, declinationDeg, parkingInclinationDeg });
  }

  // 2. Valor inicial analítico.
  const tc0 = tdbToTimeScales(tg), sDate = unit(applyMatrix(precessionMatrixJ2000ToDate(tc0.jdTt), sEq));
  const n0 = unit(cross(r0, vp0)), A = n0[0] * sDate[0] + n0[1] * sDate[1], B = n0[0] * sDate[1] - n0[1] * sDate[0], C = n0[2] * sDate[2], Rab = Math.hypot(A, B);
  const base0 = Math.atan2(B, A), dg = Math.acos(Math.max(-1, Math.min(1, -C / Rab)));
  const gmst0 = greenwichMeanSiderealDeg(tg) * DEG, siderealRate = 2 * Math.PI * 1.0027378119113546 / 86400; // rad/s (IERS 1.00273781191135448, escrito como el double que ya resultaba)
  const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
  const vInfMag = norm(vInf0), rP = norm(r0), energy0 = dot(vp0, vp0) / 2 - mu / rP, aP = -mu / (2 * energy0), nMean = Math.sqrt(mu / aP ** 3), period = 2 * Math.PI / nMean;
  const dvNeed = Math.sqrt(vInfMag ** 2 + 2 * mu / rP) - norm(vp0);
  const propNeed = stackKg * (1 - Math.exp(-dvNeed * 1000 / (upper.ispS * G0_M_S2)));
  const idealDvMs = tsiolkovskyDeltaVMS(upper.ispS, stackKg, dryKg);
  if (propNeed > upper.propellantKg) {
    return fail(DEPARTURE_STATUS.upperStage, `La inyección necesita ≈ ${(dvNeed * 1000).toFixed(0)} m/s (impulsiva) y ${upper.name} con esta carga ofrece ${idealDvMs.toFixed(0)} m/s.`,
      { ascent, azimuthDeg, declinationDeg, parkingInclinationDeg });
  }
  const tb0 = propNeed / flow;
  const guesses = [base0 + dg, base0 - dg].map(g => {
    const dtL = wrap(g - gmst0) / siderealRate, gl = g;
    const rot = v => [v[0] * Math.cos(gl) - v[1] * Math.sin(gl), v[0] * Math.sin(gl) + v[1] * Math.cos(gl), v[2]];
    const r = rot(r0), v = rot(vp0), h = unit(cross(r, v));
    const e = 1 + rP * vInfMag ** 2 / mu, nuInf = Math.acos(-1 / e);
    const p = sub(scale(sDate, Math.cos(nuInf)), scale(cross(h, sDate), Math.sin(nuInf)));
    let dth = Math.atan2(dot(h, cross(unit(r), p)), dot(unit(r), p)); if (dth < 0) dth += 2 * Math.PI;
    let tc = dth / nMean - tb0 / 2; while (tc < 0) tc += period;
    return [dtL, tc, tb0];
  }).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
  // Con una solución anterior (otra iteración de la llegada), se parte de ella: la ventana elegida no cambia.
  if (input.previous?.x) guesses.unshift(input.previous.x.slice());

  // 3. Evaluación de la cadena para x = [desfase del despegue respecto a tg (s), aparcamiento (s), inyección (s)].
  let evaluations = 0;
  function chain(x, detail = false) {
    evaluations++;
    const jdL = tg + x[0] / 86400, frame = launchFrameToEclipticJ2000(jdL), M = frame.matrix;
    // Los tramos terrestres se convierten al Sol con la Tierra de las efemérides: el despegue también debe estar cubierto (no se extrapola).
    if (!earthStateAt(jdL)) return { error: 'aim', reason: 'el despegue quedaría fuera de la cobertura de efemérides de la Tierra (no se extrapola)' };
    const r = applyMatrix(M, r0), v = applyMatrix(M, vp0);
    if (!(x[1] >= 0) || x[1] > cfg.maxParkingCoastSeconds || !(x[2] >= 1) || x[2] > fullBurnS) return { error: 'bounds' };
    const pc = x[1] > 0 ? propagateKepler(r, v, x[1], mu) : { positionKm: r, velocityKmS: v };
    let burn;
    try {
      burn = propagateFiniteThrust({ gravityDerivative: gravity(mu), initialPositionKm: pc.positionKm, initialVelocityKmS: pc.velocityKmS, initialMassKg: stackKg, dryMassKg: dryKg, engine,
        burns: [{ id: 'injection', startSeconds: 0, durationSeconds: x[2], throttle: 1, direction: { type: 'prograde' } }], endSeconds: x[2], maxBurnStepSeconds: 20 });
    } catch (error) { if (error instanceof FiniteThrustError) return { error: 'burn', reason: error.message }; throw error; }
    const bo = burn.final, dt = hyperbolicTimeToRadius(bo.positionKm, bo.velocityKmS, mu, soiRadiusKm);
    if (dt == null || !(dt > 0)) return { error: 'bound', c3: dot(bo.velocityKmS, bo.velocityKmS) - 2 * mu / norm(bo.positionKm) };
    const ex = propagateKepler(bo.positionKm, bo.velocityKmS, dt, mu);
    const tExit = tAsc + x[1] + x[2] + dt, jdExit = jdL + tExit / 86400, earth = earthStateAt(jdExit);
    if (!earth) return { error: 'aim', reason: 'Efemérides de la Tierra no disponibles en la salida de la SOI.' };
    // 28: `actual` es la velocidad de la nave en la frontera; `achieved`, la que se compara con la pedida según el empalme.
    const X = add(earth.positionKm, ex.positionKm), actual = add(ex.velocityKmS, earth.velocityKmS), req = requiredVelocityAt(X, jdExit);
    if (!req) return { error: 'aim', reason: 'El crucero no puede apuntarse desde la salida de la SOI.' };
    const vInf = hyperbolicExcessVelocity(bo.positionKm, bo.velocityKmS, mu);
    if (!vInf) return { error: 'bound', c3: dot(bo.velocityKmS, bo.velocityKmS) - 2 * mu / norm(bo.positionKm) };
    const achieved = patch === 'velocity' ? actual : add(vInf, earth.velocityKmS);
    const F = sub(achieved, req);
    return detail ? { F, jdL, frame, parking: { positionKm: r, velocityKmS: v }, coastEnd: pc, burn, burnout: bo, escapeSeconds: dt, exit: ex, tExit, jdExit, earth, X, achieved, actual, vInf, req }
      : { F, burnout: bo };
  }
  const solve3 = (J, b) => {
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(J); if (!(Math.abs(D) > 0)) return null;
    return [0, 1, 2].map(k => det(J.map((row, i) => row.map((val, j) => (j === k ? b[i] : val)))) / D);
  };
  const steps = [2, 1, 0.02];
  let best = null, lastError = null;
  for (const start of guesses) {
    let x = start.slice(), cur = chain(x), it = 0;
    if (cur.error) { lastError = cur; continue; }
    while (it < cfg.maxIterations && norm(cur.F) > cfg.toleranceKmS) {
      it++;
      const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const xh = x.slice(); xh[k] += (k === 2 && xh[2] + steps[2] > fullBurnS) ? -steps[2] : steps[k];
        const h = xh[k] - x[k], r = chain(xh);
        if (r.error) { ok = false; lastError = r; break; }
        for (let i = 0; i < 3; i++) J[i][k] = (r.F[i] - cur.F[i]) / h;
      }
      if (!ok) break;
      const dx = solve3(J, scale(cur.F, -1));
      if (!dx) break;
      // Pasos limitados (despegue ≤ 1 h, aparcamiento ≤ 10 min, inyección ≤ 20 s) y amortiguados si el residuo no baja.
      const lim = [3600, 600, 20], k0 = Math.min(1, ...dx.map((d, i) => lim[i] / Math.max(1e-300, Math.abs(d))));
      let lambda = k0, next = null;
      for (let tries = 0; tries < 8; tries++, lambda /= 2) {
        const xn = x.map((xi, i) => xi + lambda * dx[i]), r = chain(xn);
        if (!r.error && norm(r.F) < norm(cur.F)) { next = { x: xn, r }; break; }
        if (r.error) lastError = r;
      }
      if (!next) break;
      x = next.x; cur = next.r;
    }
    const res = norm(cur.F);
    if (!best || res < best.residual) best = { x, residual: res, iterations: it };
    if (res <= cfg.toleranceKmS) break;
  }
  if (!best || best.residual > cfg.acceptKmS) {
    const why = lastError?.error === 'bound' ? `la inyección no alcanza la velocidad de escape (C3 ${lastError.c3.toFixed(2)} km²/s²): falta Δv en ${upper.name}`
      : lastError?.reason ?? 'el apuntado no converge';
    const status = lastError?.error === 'bound' || (lastError?.error === 'bounds' && best?.x?.[2] >= fullBurnS - 1) ? DEPARTURE_STATUS.upperStage : lastError?.error === 'aim' ? DEPARTURE_STATUS.aim : DEPARTURE_STATUS.convergence;
    return fail(status, `Salida no apuntada: ${why}${best ? ` (residuo ${(best.residual * 1e6).toFixed(3)} mm/s)` : ''}.`, { ascent, azimuthDeg, declinationDeg, parkingInclinationDeg });
  }

  // 4. Solución: estados de cada tramo en ejes eclípticos J2000, relativos al centro de la Tierra; tiempos desde el despegue.
  const d = chain(best.x, true), M = d.frame.matrix;
  const rot = p => applyMatrix(M, p);
  const ascentKnots = ascent.knots.map(k => ({ elapsedSeconds: k.elapsedSeconds, positionKm: rot(k.positionKm), velocityKmS: rot(k.velocityKmS), massKg: k.massKg }));
  const tParkEnd = tAsc + best.x[1], tBurnEnd = tParkEnd + best.x[2];
  const burnKnots = d.burn.knots.map(k => ({ elapsedSeconds: tParkEnd + k.elapsedSeconds, positionKm: k.positionKm, velocityKmS: k.velocityKmS, massKg: k.massKg }));
  const b = d.burn.burns[0], bo = d.burnout, rBo = norm(bo.positionKm);
  const c3 = dot(bo.velocityKmS, bo.velocityKmS) - 2 * mu / rBo;
  const vCirc = norm(d.coastEnd.velocityKmS), impulsiveDvKmS = Math.sqrt(c3 + 2 * mu / norm(d.coastEnd.positionKm)) - vCirc;
  const stage2 = ascent.stages[1], jettison2Kg = ascent.final.massKg - stackKg;
  const parkingOrbit = (() => { const rr = norm(r0), en = dot(vp0, vp0) / 2 - mu / rr, a = -mu / (2 * en), h = norm(cross(r0, vp0)), e = Math.sqrt(Math.max(0, 1 + 2 * en * h * h / (mu * mu)));
    return { perigeeAltitudeKm: a * (1 - e) - 6378.137, apogeeAltitudeKm: a * (1 + e) - 6378.137, periodMinutes: 2 * Math.PI * Math.sqrt(a ** 3 / mu) / 60, inclinationDeg: parkingInclinationDeg }; })();
  const liftoff = tdbToTimeScales(d.jdL);
  return Object.freeze({
    ...base, status: DEPARTURE_STATUS.designed, ok: true, reason: null, x: best.x, iterations: best.iterations, evaluations, residualKmS: best.residual,
    azimuthDeg, azimuthNote, declinationDeg, liftoffJdTdb: d.jdL, liftoffUtc: liftoff.labelUtc, liftoffShiftHours: best.x[0] / 3600, gmstDeg: d.frame.gmstDeg,
    ascent, ascentKnots, ascentEndSeconds: tAsc, stage2JettisonKg: jettison2Kg, stage2PropellantLeftKg: stage2.propellantRemainingKg,
    parking: { ...parkingOrbit, startSeconds: tAsc, endSeconds: tParkEnd, coastSeconds: best.x[1], state: d.parking, massKg: stackKg },
    injection: { startSeconds: tParkEnd, endSeconds: tBurnEnd, durationSeconds: b.effectiveDurationSeconds, knots: burnKnots, propellantKg: b.fuelConsumedKg,
      propellantLeftKg: upper.propellantKg - b.fuelConsumedKg, propulsiveDeltaVKmS: b.propulsiveDeltaVMS / 1000, impulsiveDeltaVKmS: impulsiveDvKmS,
      gravityLossKmS: b.propulsiveDeltaVMS / 1000 - impulsiveDvKmS, massAfterKg: bo.massKg, c3Km2S2: c3, vInfKmS: Math.sqrt(c3), burnoutAltitudeKm: rBo - 6378.137 },
    upperSeparation: { elapsedSeconds: tBurnEnd, jettisonedKg: bo.massKg - payloadMassKg },
    escape: { startSeconds: tBurnEnd, endSeconds: d.tExit, durationSeconds: d.escapeSeconds, initial: { positionKm: bo.positionKm, velocityKmS: bo.velocityKmS } },
    // 28: helioVelocityAchievedKmS es la magnitud apuntada (asíntota + Tierra, o la de la frontera con el empalme 'velocity');
    // helioVelocityActualKmS, la velocidad de la nave en la frontera; soiVelocityJumpKmS, su diferencia con la del crucero.
    exit: { elapsedSeconds: d.tExit, jdTdb: d.jdExit, geocentric: { positionKm: d.exit.positionKm, velocityKmS: d.exit.velocityKmS }, helioPositionKm: d.X,
      helioVelocityAchievedKmS: d.achieved, helioVelocityActualKmS: d.actual, helioVelocityRequiredKmS: d.req, earthState: d.earth,
      vInfVectorKmS: d.vInf, soiVelocityJumpKmS: sub(d.actual, d.req) }
  });
}
