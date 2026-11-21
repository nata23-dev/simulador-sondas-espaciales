// Etapa 13 — reproducción determinista de una misión integrada (Centro de Misión unificado).
// Función pura del instante: cada estado sale del tramo calculado que contiene ese instante (Kepler exacto en tramos balísticos,
// Hermite entre nudos DOPRI54 en encendidos y descenso). Retroceder o repetir no recalcula ni consume propelente.
// La vista tiene CONTEXTOS (heliocéntrico, planetocéntrico, centrado en el satélite y escena local del descenso). Cambiar de
// contexto solo cambia el marco en que se DIBUJA el mismo estado: la conversión usa las efemérides en la misma época TDB.
import { tdbToTimeScales } from '../science/AstrodynamicsTime.js';
import { KM_PER_AU } from '../science/Units.js';
import { orbitDescription } from './OrbitalInsertion.js';
import { INTEGRATED_MISSION_VERSION, sampleSegmentNative, convertState, MISSION_LIMITS, PHASE_STATUS, MOON_WINDOW_KEYS } from './IntegratedMission.js';
import { HELIOCENTRIC_SCENE_SCALE } from './InterplanetaryPlayback.js';
import { createLandingExecution, sampleLandingExecution } from './BodyLandingPlayback.js';
import { getBodyProfile } from './CelestialBodyMissionRegistry.js';
import { designSignature } from './MissionPlanStore.js';
import { generationAt, JULIAN_YEAR_DAYS } from './SpacecraftPower.js';

export const INTEGRATED_MAX_RATE = 100 * 86400;
// Frontera gráfica de los contextos planetocéntrico y del satélite: la del Centro de Misión (1 unidad = 10 000 km).
export const LOCAL_CONTEXT_SCENE_SCALE = 1 / 10000;
export const CONTEXT_LABELS = Object.freeze({ helio: 'Heliocéntrico (Sol)', planet: 'Planetocéntrico', moon: 'Centrado en el satélite', landing: 'Escena local del descenso' });
// Ritmo sugerido por tipo de tramo (s de misión por s real) para el modo «automático por fase».
export const AUTO_RATE = Object.freeze({ cruise: 864000, outbound: 864000, 'planet-approach': 86400, flyby: 21600, 'planet-capture': 60, 'planet-orbit': 21600,
  'moon-transfer': 3600, 'moon-approach': 600, 'moon-capture': 10, 'moon-orbit': 600, 'moon-flyby': 300, landing: 60 });
const SAMPLES = Object.freeze({ cruise: 360, outbound: 120, kepler: 90, burn: 40, landing: 60 });
const norm = a => Math.hypot(a[0], a[1], a[2]);
const ZERO = Object.freeze([0, 0, 0]);
const PLANET_COLOR = Object.freeze({ '199': '#a39a91', '299': '#d8b979', '399': '#3f7cc0', '499': '#c46a43', '599': '#c9a77f', '699': '#d6c38f', '799': '#8fd0d8', '899': '#5b7fd6' });
const MOON_COLOR = '#b9c9d6';

/** Tramo que contiene el instante (en una frontera se toma el tramo que EMPIEZA: estado ya transformado). */
export function segmentAtTime(segments, t) {
  let lo = 0, hi = segments.length - 1;
  if (t <= segments[0].startSeconds) return 0;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (segments[m].startSeconds <= t) lo = m; else hi = m; }
  return segments[hi].startSeconds <= t ? hi : lo;
}
export function contextOfSegment(mission, segment) {
  if (segment.kind === 'landing') return 'landing';
  if (segment.centralBodyId === '10') return 'helio';
  if (segment.centralBodyId === mission.destinationId) return 'planet';
  return 'moon';
}
const frameIdOf = (mission, context) => context === 'helio' ? '10' : context === 'planet' ? mission.destinationId : mission.moonId;

function stateIn(mission, data, segment, t, context) {
  const native = sampleSegmentNative(segment, t), jd = mission.departureJdTdb + t / 86400;
  const from = segment.kind === 'landing' ? mission.moonId : segment.centralBodyId;
  const target = context === 'landing' ? mission.moonId : frameIdOf(mission, context);
  return { ...convertState(native, from, target, jd, data, mission.target, MOON_WINDOW_KEYS[mission.moonId]), native, jd };
}

function buildContext(mission, data, context, design) {
  const tgt = mission.target, moonKey = MOON_WINDOW_KEYS[mission.moonId];
  const include = s => context === 'helio' ? true : context === 'planet' ? s.centralBodyId !== '10' : (s.centralBodyId === mission.moonId || s.kind === 'landing');
  const segs = mission.segments.filter(include);
  if (!segs.length) return null;
  const trajectory = [];
  for (const s of segs) {
    const n = s.kind === 'landing' ? SAMPLES.landing : s.kind === 'burn' ? SAMPLES.burn : SAMPLES[s.phase] ?? SAMPLES.kepler;
    for (let i = 0; i <= n; i++) {
      const t = s.startSeconds + (s.endSeconds - s.startSeconds) * i / n;
      if (trajectory.length && t <= trajectory.at(-1).elapsedSeconds) continue;
      const st = stateIn(mission, data, s, t, context);
      trajectory.push({ elapsedSeconds: t, positionKm: st.positionKm, velocityKmS: st.velocityKmS, moonPositionKm: markerPosition(context, st.jd), originPositionKm: originPosition(context, st.jd) });
    }
  }
  function markerPosition(ctx, jd) {
    if (ctx === 'helio') return data.helio.stateAt(tgt.ephemerisId, jd).positionKm;
    if (ctx === 'planet' && moonKey) { const m = data.moons?.stateAt(moonKey, jd); return m?.status === 'available' ? m.positionKm : ZERO; }
    return ZERO;
  }
  function originPosition(ctx, jd) { if (ctx !== 'helio') return null; const e = data.helio.stateAt('399', jd); return e?.status === 'available' ? e.positionKm : null; }
  const radii = trajectory.map(p => norm(p.positionKm));
  const maxAll = Math.max(...radii, ...trajectory.map(p => norm(p.moonPositionKm)));
  // Encuadre general: en el contexto planetario el arco de aproximación empieza en el borde de la esfera de influencia, decenas
  // de veces más lejos que la órbita; el encuadre usa la parte cercana (órbitas y encendidos) y la aproximación queda visible al alejar.
  let frameRadius = maxAll;
  if (context === 'planet') {
    const rp = mission.approach?.periapsisAchievedKm ?? tgt.radiusKm;
    let core = trajectory.filter(p => !['planet-approach', 'flyby'].includes(segs[segmentAtTime(segs, p.elapsedSeconds)].phase));
    if (!core.length) core = trajectory.filter((p, i) => radii[i] < 20 * rp);
    frameRadius = Math.max(...core.map(p => Math.max(norm(p.positionKm), norm(p.moonPositionKm))), 3 * tgt.radiusKm);
  }
  const scale = context === 'helio' ? HELIOCENTRIC_SCENE_SCALE : LOCAL_CONTEXT_SCENE_SCALE;
  const body = context === 'helio' ? { id: '10', name: 'Sol', color: '#f2c766', emissive: true } : context === 'planet' ? { id: tgt.id, name: tgt.name, color: tgt.color ?? PLANET_COLOR[tgt.id] }
    : { id: mission.moonId, name: mission.moonName, color: MOON_COLOR };
  const bodyRadiusKm = context === 'helio' ? 695700 : context === 'planet' ? tgt.radiusKm : getBodyProfile(mission.moonId).radiusKm.value;
  const overviewRadiusScene = frameRadius * scale * 1.05;
  return {
    kind: 'integrated-context', context, name: `${mission.destinationName} · ${CONTEXT_LABELS[context]}`, design, durationSeconds: mission.durationSeconds,
    segments: segs, firstSeconds: segs[0].startSeconds, lastSeconds: segs.at(-1).endSeconds,
    transfer: { model: INTEGRATED_MISSION_VERSION, target: 'integrated', heliocentric: true, trajectory, initialPositionKm: trajectory[0].positionKm, arrivalPositionKm: trajectory.at(-1).positionKm,
      moonArrivalPositionKm: trajectory.at(-1).moonPositionKm, originColor: PLANET_COLOR['399'], destinationColor: context === 'helio' ? (tgt.color ?? PLANET_COLOR[tgt.id]) : MOON_COLOR,
      sceneScale: scale, bodyRadiusKm, centralBodyVisualRadius: context === 'helio' ? 0.35 : null, centralBody: body, overviewRadiusScene,
      cameraFar: Math.max(300, maxAll * scale * 4, overviewRadiusScene * 8), showOrigin: context === 'helio', hideMoon: context === 'moon' || (context === 'planet' && !moonKey),
      // Tamaño ilustrativo de los marcadores ≈ 1/10 del radio encuadrado (en escenas pequeñas, menor que 1: Europa ≈ 0,16 u).
      markerScale: Math.max(context === 'helio' ? 1 : 0.02, overviewRadiusScene / 10), minDistance: Math.min(1.4, overviewRadiusScene * 0.02) }
  };
}

/** `candidate`: { result (computeIntegratedMission), data: { helio, moons }, design, name }. */
export function createIntegratedExecution({ result: mission, data, design = null, name = null }) {
  if (mission?.kind !== 'integrated' || mission.model !== INTEGRATED_MISSION_VERSION) throw Error('El resultado no corresponde al modelo de misión integrada vigente.');
  if (!mission.segments.length || !(mission.durationSeconds > 0)) throw Error('La misión no tiene tramos reproducibles.');
  if (!data?.helio?.stateAt) throw Error('Faltan las efemérides cargadas de la misión.');
  if (design && mission.designSignature !== designSignature(design)) throw Error('El cálculo quedó obsoleto tras cambiar la sonda. Recalcula.');
  const contexts = {};
  for (const c of ['helio', 'planet', 'moon']) { const ctx = buildContext(mission, data, c, design); if (ctx) contexts[c] = ctx; }
  const landingSegment = mission.segments.find(s => s.kind === 'landing');
  if (landingSegment && design) {
    const exec = createLandingExecution({ result: { kind: 'landing', model: landingSegment.simulation.model, simulation: landingSegment.simulation, designSignature: mission.designSignature }, design, name: landingSegment.label });
    contexts.landing = { ...exec, context: 'landing', firstSeconds: landingSegment.startSeconds, lastSeconds: landingSegment.endSeconds, landingExecution: exec };
  }
  const events = mission.events.map(e => ({ ...e, side: 'post', elapsedSeconds: Math.min(mission.durationSeconds, Math.max(0, e.elapsedSeconds)) }));
  if (!events.some(e => e.elapsedSeconds === mission.durationSeconds)) events.push({ id: 'end', kind: 'end', title: 'Fin de la cadena calculada', elapsedSeconds: mission.durationSeconds, side: 'post' });
  return Object.freeze({ kind: 'integrated', name: name ?? `Tierra → ${mission.moonName ?? mission.destinationName}`, design: design ? structuredClone(design) : null, mission, data,
    durationSeconds: mission.durationSeconds, events, contexts, boundaries: mission.segments.map(s => s.startSeconds).concat(mission.durationSeconds), maxRate: INTEGRATED_MAX_RATE,
    transfer: contexts.helio?.transfer ?? Object.values(contexts)[0].transfer });
}

export function autoContextAt(execution, t) {
  const seg = execution.mission.segments[segmentAtTime(execution.mission.segments, t)];
  const c = contextOfSegment(execution.mission, seg);
  return execution.contexts[c] ? c : 'helio';
}

/** Muestra en el contexto pedido (o el automático). Devuelve también el estado nativo del tramo y su cuerpo central. */
export function sampleIntegratedExecution(execution, elapsedSeconds, context = null) {
  if (execution?.kind !== 'integrated' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > execution.durationSeconds + 1e-9) throw Error('Instante fuera de la misión calculada.');
  const m = execution.mission, t = Math.min(elapsedSeconds, execution.durationSeconds), index = segmentAtTime(m.segments, t), seg = m.segments[index];
  const ctx = context && execution.contexts[context] ? context : autoContextAt(execution, t);
  const native = sampleSegmentNative(seg, t), jdTdb = m.departureJdTdb + t / 86400;
  let view;
  if (ctx === 'landing') {
    const L = execution.contexts.landing, local = Math.min(L.durationSeconds, Math.max(0, t - L.firstSeconds));
    if (t < L.firstSeconds) { const st = stateIn(m, execution.data, seg, t, 'moon'); view = { positionKm: st.positionKm, velocityKmS: st.velocityKmS, moonPositionKm: ZERO, segmentIndex: 0, before: true }; }
    else view = { ...sampleLandingExecution(L.landingExecution, local), before: false };
  } else {
    const C = execution.contexts[ctx], st = stateIn(m, execution.data, seg, t, ctx), traj = C.transfer.trajectory;
    let lo = 0, hi = traj.length - 1;
    if (t <= traj[0].elapsedSeconds) hi = 0;
    else { while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (traj[mid].elapsedSeconds <= t) lo = mid; else hi = mid; } }
    const tgt = m.target, moonKey = MOON_WINDOW_KEYS[m.moonId];
    const marker = ctx === 'helio' ? execution.data.helio.stateAt(tgt.ephemerisId, jdTdb).positionKm
      : ctx === 'planet' && moonKey ? (execution.data.moons?.stateAt(moonKey, jdTdb)?.positionKm ?? ZERO) : ZERO;
    const origin = ctx === 'helio' ? execution.data.helio.stateAt('399', jdTdb) : null;
    view = { positionKm: st.positionKm, velocityKmS: st.velocityKmS, moonPositionKm: marker, originPositionKm: origin?.status === 'available' ? origin.positionKm : null,
      segmentIndex: t < traj[0].elapsedSeconds ? 0 : lo, before: t < traj[0].elapsedSeconds };
  }
  return Object.freeze({ elapsedSeconds: t, remainingSeconds: execution.durationSeconds - t, jdTdb, context: ctx, segmentIndex: view.segmentIndex, beforeContext: view.before,
    positionKm: view.positionKm, velocityKmS: view.velocityKmS, moonPositionKm: view.moonPositionKm, originPositionKm: view.originPositionKm ?? null,
    landingSample: ctx === 'landing' && !view.before ? view : null, segment: seg, segmentIndexGlobal: index, native });
}

function tankState(mission, t) {
  const tanks = { probe: mission.vehicle.probe.propellantKg, module: mission.vehicle.module?.propellantKg ?? 0, lander: mission.vehicle.lander?.propellantKg ?? 0 };
  let active = null;
  for (const mv of mission.maneuvers) {
    if (t >= mv.endSeconds) tanks[mv.engineKey] -= mv.propellantKg;
    else if (t >= mv.startSeconds) active = mv;
  }
  const separated = mission.separations.some(s => t >= s.elapsedSeconds);
  return { tanks, active, separated };
}

export function deriveIntegratedTelemetry(execution, sample) {
  const m = execution.mission, seg = sample.segment, time = tdbToTimeScales(sample.jdTdb), native = sample.native;
  const centralId = seg.kind === 'landing' ? m.moonId : seg.centralBodyId;
  const centralName = seg.kind === 'landing' ? m.moonName : seg.centralName;
  const radius = centralId === '10' ? 695700 : centralId === m.destinationId ? m.target.radiusKm : getBodyProfile(centralId).radiusKm.value;
  const mu = seg.mu;
  const r = norm(native.positionKm), orbit = orbitDescription(native.positionKm, native.velocityKmS, mu, radius);
  let helio = null, toPlanet = null;
  try { helio = convertState(native, centralId, '10', sample.jdTdb, execution.data, m.target, MOON_WINDOW_KEYS[m.moonId]); } catch { helio = null; }
  try { toPlanet = centralId === '10' ? convertState(native, '10', m.destinationId, sample.jdTdb, execution.data, m.target, MOON_WINDOW_KEYS[m.moonId]) : null; } catch { toPlanet = null; }
  const { tanks, active, separated } = tankState(m, sample.elapsedSeconds);
  const massKg = sample.landingSample ? sample.landingSample.massKg ?? native.massKg : native.massKg;
  if (active) { const used = Math.max(0, (active.massAfterKg + active.propellantKg) - massKg); tanks[active.engineKey] = Math.max(0, tanks[active.engineKey] - used); }
  const engineOn = sample.landingSample ? Boolean(sample.landingSample.engineOn) : Boolean(active) || (seg.kind === 'burn' && native.engineOn);
  // Fase vigente: la de inicio más reciente que contiene el instante (en una frontera, la que empieza).
  const phase = m.phases.filter(p => p.id !== 'departure' && sample.elapsedSeconds >= (p.startSeconds ?? Infinity) - 1e-9 && sample.elapsedSeconds <= (p.endSeconds ?? p.startSeconds ?? -Infinity) + 1e-9)
    .sort((a, b) => b.startSeconds - a.startSeconds)[0];
  const doneManeuvers = m.maneuvers.filter(mv => mv.endSeconds <= sample.elapsedSeconds + 1e-9);
  // 15: energía en el instante con el mismo modelo que la fase «power» (generación a la distancia heliocéntrica actual).
  const sunDistanceAu = helio ? norm(helio.positionKm) / KM_PER_AU : null, p = m.vehicle.power;
  let power = null;
  if (p && Number.isFinite(sunDistanceAu) && sunDistanceAu > 0) {
    const g = generationAt(p.sources, { distanceAu: sunDistanceAu, yearsSinceLaunch: sample.elapsedSeconds / 86400 / JULIAN_YEAR_DAYS });
    const burn = active?.engineKey === 'probe' ? m.power?.burns?.find(b => b.id === active.id) : null;
    const engineW = active?.engineKey === 'probe' ? (burn ? burn.loadW - p.serviceW : p.engineActiveW ?? 0) : 0;
    power = Object.freeze({ generationW: g.totalW, solarW: g.solarW, rtgW: g.rtgW, loadW: p.serviceW + engineW, marginW: g.totalW - p.serviceW - engineW, batteryWh: p.batteryWh,
      missionSustainable: m.power?.sustainable ?? null });
  }
  return Object.freeze({
    missionName: execution.name, probeName: m.vehicle.probe.name, destinationName: m.destinationName, moonName: m.moonName,
    segmentLabel: seg.label, segmentKind: seg.kind, phaseLabel: phase?.label ?? seg.label, phaseStatus: phase?.status ?? null, context: sample.context,
    time: Object.freeze({ utc: time.labelUtc, tdb: time.labelTdb, jdTdb: sample.jdTdb, utcPredicted: time.utcPredicted, elapsedDays: sample.elapsedSeconds / 86400, remainingDays: sample.remainingSeconds / 86400 }),
    frame: Object.freeze({ centralId, centralName, label: centralId === '10' ? 'Heliocéntrico ICRF eclíptico J2000 (centro del Sol)' : centralId === m.destinationId ? `Centrado en ${m.target.centerLabel}, ejes ICRF eclíptico J2000`
      : seg.kind === 'landing' ? `Inercial local de ${centralName} (12F) = ejes ICRF eclíptico J2000 centrados en ${centralName}` : `Centrado en ${centralName}, ejes ICRF eclíptico J2000` }),
    state: Object.freeze({ positionKm: native.positionKm, velocityKmS: native.velocityKmS }),
    derived: Object.freeze({ distanceKm: r, altitudeKm: r - radius, speedKmS: norm(native.velocityKmS), orbit,
      sunDistanceAu: helio ? norm(helio.positionKm) / KM_PER_AU : null, destinationDistanceKm: toPlanet ? norm(toPlanet.positionKm) : centralId === m.destinationId ? r : null,
      destinationRelativeSpeedKmS: toPlanet ? norm(toPlanet.velocityKmS) : null }),
    propulsion: Object.freeze({ engineOn, engineName: active?.engine ?? null, activeManeuver: active?.label ?? null, massKg, tanks: Object.freeze(tanks), separated,
      landing: sample.landingSample ? Object.freeze({ throttle: sample.landingSample.throttle, thrustN: sample.landingSample.thrustN, altitudeKm: sample.landingSample.altitudeKm, verticalMS: sample.landingSample.verticalMS, horizontalMS: sample.landingSample.horizontalMS, phase: sample.landingSample.phase }) : null }),
    power,
    maneuversDone: doneManeuvers.map(mv => Object.freeze({ label: mv.label, propulsiveDeltaVKmS: mv.propulsiveDeltaVKmS, propellantKg: mv.propellantKg, endEvent: mv.endEvent })),
    verdict: m.verdict, limits: MISSION_LIMITS,
    validation: '13 implementada y probada localmente; pendiente de auditoría. Viabilidad operativa: no verificada.'
  });
}
export { PHASE_STATUS };
