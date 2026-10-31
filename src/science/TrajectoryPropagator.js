import {
  createHeliocentricProbeDerivative,
  createTwoBodyDerivative,
  DYNAMICAL_MODELS,
  DynamicsError,
  preparePrescribedEphemerisField
} from './GravitationalDynamics.js';
import {
  integrateDopri54,
  integrateRk4,
  INTEGRATOR_METHODS,
  IntegrationError,
  interpolateQuinticMechanicalState6
} from './NumericalIntegrator.js';
import { createDynamicalModelDescriptor, createProbeDynamicState } from './ProbeState.js';
import { createSimulationInstant, jdTdbToElapsedSeconds } from './SimulationTime.js';
import { requireJdTdb } from './Time.js';
import { requireFiniteNumber } from './Units.js';

function binarySearchKnot(times, querySeconds, forward, hint) {
  const last = times.length - 1;
  if (last <= 0) return 0;
  if (hint >= 0 && hint < last) {
    const a = times[hint];
    const b = times[hint + 1];
    if (forward ? (querySeconds >= a && querySeconds <= b) : (querySeconds <= a && querySeconds >= b)) {
      return hint;
    }
  }
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    const cond = forward ? (times[mid] <= querySeconds) : (times[mid] >= querySeconds);
    if (cond) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Propaga la trayectoria de una sonda espacial a partir de un `ProbeDynamicState`
 * inicial y almacena por separado:
 *   1. Los nodos físicos de cálculo (`computationKnots`: tiempo, estado 6D y derivada 6D
 *      en `Float64Array`) para recuperar estados científicos mediante Hermite quíntica.
 *   2. Las muestras decimadas/regulares de posición en km destinadas al renderizado 3D.
 *
 * Respeta estrictamente la cobertura de las efemérides planetarias y jamás extrapola.
 */
export async function propagateProbeTrajectory({
  initialState,
  catalog,
  targetJdTdb = undefined,
  durationSeconds = undefined,
  ephemerisProvider = null,
  ephemerisField = null,
  getBodyPositionKm = null,
  coveragePolicy = 'strict',
  integrator = {},
  sampling = {},
  minDistanceOverridesKm = null,
  shouldAbort = null
}) {
  const validatedInitial = createProbeDynamicState(initialState);
  if (!catalog || typeof catalog.getParameter !== 'function') {
    throw new DynamicsError('INVALID_PARAMETER', 'Se requiere un catálogo gravitacional válido.');
  }
  if (coveragePolicy !== 'strict' && coveragePolicy !== 'clamp_to_coverage') {
    throw new RangeError(`coveragePolicy desconocida: ${coveragePolicy}.`);
  }

  const epochJdTdb = validatedInitial.time.epochJdTdb;
  const startSeconds = validatedInitial.time.elapsedSeconds;
  const startJdTdb = validatedInitial.time.jdTdb;

  let requestedTargetSeconds;
  if (durationSeconds !== undefined) {
    requireFiniteNumber(durationSeconds, 'durationSeconds');
    if (targetJdTdb !== undefined) {
      throw new RangeError('Especifique targetJdTdb o durationSeconds, no ambos simultáneamente.');
    }
    requestedTargetSeconds = startSeconds + durationSeconds;
  } else if (targetJdTdb !== undefined) {
    requireJdTdb(targetJdTdb);
    requestedTargetSeconds = jdTdbToElapsedSeconds(epochJdTdb, targetJdTdb);
  } else {
    throw new RangeError('Se debe indicar targetJdTdb o durationSeconds.');
  }

  const requestedTargetInstant = createSimulationInstant(epochJdTdb, requestedTargetSeconds);
  let effectiveTargetSeconds = requestedTargetSeconds;
  let effectiveTargetJdTdb = requestedTargetInstant.jdTdb;
  let stoppedAtCoverageBoundary = false;
  let coverageLimitNotice = null;
  let activeField = ephemerisField;

  const model = validatedInitial.dynamicalModel;
  const method = integrator.method ?? model.integratorMethod ?? INTEGRATOR_METHODS.DOPRI54;
  if (method !== INTEGRATOR_METHODS.RK4 && method !== INTEGRATOR_METHODS.DOPRI54) {
    throw new IntegrationError('INVALID_CONFIGURATION', `Método de integración no soportado: ${method}.`);
  }

  const maxComputationKnots = sampling.maxComputationKnots ?? 50000;
  const maxRenderSamples = sampling.maxRenderSamples ?? 10000;
  const renderSampleIntervalSeconds = sampling.renderSampleIntervalSeconds ?? 3600;
  if (!Number.isSafeInteger(maxComputationKnots) || maxComputationKnots < 2
    || !Number.isSafeInteger(maxRenderSamples) || maxRenderSamples < 2) {
    throw new RangeError('Los límites de almacenamiento de trayectoria deben ser enteros >= 2.');
  }
  requireFiniteNumber(renderSampleIntervalSeconds, 'renderSampleIntervalSeconds');
  if (renderSampleIntervalSeconds <= 0) {
    throw new RangeError('renderSampleIntervalSeconds debe ser estrictamente positivo.');
  }

  // Preparación y verificación de cobertura de efemérides para el Modelo A
  if (model.kind === DYNAMICAL_MODELS.PRESCRIBED_EPHEMERIS_HELIOCENTRIC_PROBE
    && model.perturbingBodyIds.length > 0
    && !activeField
    && typeof getBodyPositionKm !== 'function') {
    if (!ephemerisProvider) {
      throw new DynamicsError(
        'MISSING_EPHEMERIS',
        'El modelo con efemérides prescritas requiere ephemerisProvider, ephemerisField o getBodyPositionKm.'
      );
    }

    if (coveragePolicy === 'clamp_to_coverage') {
      // Determinar la intersección de cobertura disponible entre todos los cuerpos perturbadores
      let commonStartJd = -Infinity;
      let commonEndJd = Infinity;
      for (const bodyId of model.perturbingBodyIds) {
        const cov = await ephemerisProvider.getCoverage(bodyId);
        if (cov.conflicts.length > 0) {
          throw new DynamicsError('EPHEMERIS_CONFLICT', `Conflicto de efemérides para ${bodyId}.`, { bodyId });
        }
        const seg = cov.segments.find(s => s.startJdTdb <= startJdTdb && s.endJdTdb >= startJdTdb);
        if (!seg) {
          throw new DynamicsError(
            'OUTSIDE_EPHEMERIS_COVERAGE',
            `La época inicial JD ${startJdTdb} está fuera de la cobertura de ${bodyId}.`,
            { bodyId, startJdTdb }
          );
        }
        commonStartJd = Math.max(commonStartJd, seg.startJdTdb);
        commonEndJd = Math.min(commonEndJd, seg.endJdTdb);
      }
      if (effectiveTargetJdTdb > commonEndJd) {
        effectiveTargetJdTdb = commonEndJd;
        effectiveTargetSeconds = jdTdbToElapsedSeconds(epochJdTdb, commonEndJd);
        stoppedAtCoverageBoundary = true;
        coverageLimitNotice = `Propagación limitada al fin de cobertura de efemérides (JD ${commonEndJd} TDB).`;
      } else if (effectiveTargetJdTdb < commonStartJd) {
        effectiveTargetJdTdb = commonStartJd;
        effectiveTargetSeconds = jdTdbToElapsedSeconds(epochJdTdb, commonStartJd);
        stoppedAtCoverageBoundary = true;
        coverageLimitNotice = `Propagación limitada al inicio de cobertura de efemérides (JD ${commonStartJd} TDB).`;
      }
    }

    const minJd = Math.min(startJdTdb, effectiveTargetJdTdb);
    const maxJd = Math.max(startJdTdb, effectiveTargetJdTdb);
    activeField = await preparePrescribedEphemerisField({
      provider: ephemerisProvider,
      bodyIds: [...model.perturbingBodyIds],
      epochJdTdb,
      startJdTdb: minJd,
      endJdTdb: maxJd
    });
  } else if (activeField) {
    if (!activeField.isWithinCoverage(startSeconds)) {
      throw new DynamicsError(
        'OUTSIDE_EPHEMERIS_COVERAGE',
        `El instante inicial t=${startSeconds} s está fuera del campo de efemérides cargado.`,
        { startSeconds, coverage: activeField.coverage }
      );
    }
    if (!activeField.isWithinCoverage(effectiveTargetSeconds)) {
      if (coveragePolicy === 'clamp_to_coverage') {
        const clampedSec = Math.max(
          activeField.coverage.startSeconds,
          Math.min(activeField.coverage.endSeconds, effectiveTargetSeconds)
        );
        effectiveTargetSeconds = clampedSec;
        effectiveTargetJdTdb = createSimulationInstant(epochJdTdb, clampedSec).jdTdb;
        stoppedAtCoverageBoundary = true;
        coverageLimitNotice = `Propagación detenida en el borde de cobertura disponible (JD ${effectiveTargetJdTdb} TDB).`;
      } else {
        throw new DynamicsError(
          'OUTSIDE_EPHEMERIS_COVERAGE',
          `El instante objetivo t=${effectiveTargetSeconds} s excede la cobertura de efemérides [${activeField.coverage.startSeconds}, ${activeField.coverage.endSeconds}] s.`,
          { targetSeconds: effectiveTargetSeconds, coverage: activeField.coverage }
        );
      }
    }
  }

  let derivative;
  if (model.kind === DYNAMICAL_MODELS.TWO_BODY_CENTRAL) {
    const centralParam = catalog.getParameter(model.centralBodyId);
    const minKm = minDistanceOverridesKm?.[model.centralBodyId] ?? centralParam.minSafeDistanceKm;
    derivative = createTwoBodyDerivative({
      muKm3PerS2: centralParam.muKm3PerS2,
      minDistanceKm: minKm,
      centralBodyId: model.centralBodyId
    });
  } else if (model.kind === DYNAMICAL_MODELS.PRESCRIBED_EPHEMERIS_HELIOCENTRIC_PROBE) {
    derivative = createHeliocentricProbeDerivative({
      catalog,
      ephemerisField: activeField,
      perturbingBodyIds: [...model.perturbingBodyIds],
      getBodyPositionKm,
      includeIndirectTerms: model.includeIndirectTerms,
      minDistanceOverridesKm
    });
  } else {
    throw new DynamicsError(
      'INCOMPATIBLE_STATE',
      `El propagador de sonda individual no ejecuta el modelo ${model.kind}.`,
      { kind: model.kind }
    );
  }

  const initialVector = new Float64Array([
    validatedInitial.position.x,
    validatedInitial.position.y,
    validatedInitial.position.z,
    validatedInitial.velocity.x,
    validatedInitial.velocity.y,
    validatedInitial.velocity.z
  ]);

  const t0Perf = globalThis.performance ? globalThis.performance.now() : Date.now();
  const integrationResult = method === INTEGRATOR_METHODS.RK4
    ? integrateRk4({
      derivative,
      initialState: initialVector,
      startSeconds,
      targetSeconds: effectiveTargetSeconds,
      stepSeconds: integrator.stepSeconds ?? 600,
      maxSteps: Math.min(integrator.maxSteps ?? 200000, maxComputationKnots - 1),
      recordSteps: true,
      shouldAbort
    })
    : integrateDopri54({
      derivative,
      initialState: initialVector,
      startSeconds,
      targetSeconds: effectiveTargetSeconds,
      initialStepSeconds: integrator.initialStepSeconds ?? null,
      minStepSeconds: integrator.minStepSeconds ?? 1e-3,
      maxStepSeconds: integrator.maxStepSeconds ?? 21600,
      absTol: integrator.absTol ?? [1e-6, 1e-6, 1e-6, 1e-9, 1e-9, 1e-9],
      relTol: integrator.relTol ?? 1e-11,
      maxIterations: integrator.maxIterations ?? 200000,
      recordSteps: true,
      shouldAbort
    });
  const wallTimeMs = (globalThis.performance ? globalThis.performance.now() : Date.now()) - t0Perf;

  const rawKnots = integrationResult.knots;
  const knotCount = rawKnots.times.length;
  if (knotCount > maxComputationKnots) {
    throw new RangeError(
      `La trayectoria generó ${knotCount} nodos de cálculo, superando el límite de memoria (${maxComputationKnots}).`
    );
  }

  // Empaquetado plano en Float64Array para localidad de caché y eficiencia de memoria
  const knotTimes = new Float64Array(rawKnots.times);
  const knotStates = new Float64Array(knotCount * 6);
  const knotDerivatives = new Float64Array(knotCount * 6);
  for (let i = 0; i < knotCount; i++) {
    knotStates.set(rawKnots.states[i], i * 6);
    knotDerivatives.set(rawKnots.derivatives[i], i * 6);
  }

  const endSeconds = integrationResult.elapsedSeconds;
  const endInstant = createSimulationInstant(epochJdTdb, endSeconds);
  const forward = endSeconds >= startSeconds;
  const minSeconds = Math.min(startSeconds, endSeconds);
  const maxSeconds = Math.max(startSeconds, endSeconds);
  const totalDurationAbs = maxSeconds - minSeconds;

  const effectiveModel = method === model.integratorMethod
    ? model
    : createDynamicalModelDescriptor({ ...model, integratorMethod: method });
  const gmSnapshot = catalog.snapshotForBodies([
    effectiveModel.centralBodyId,
    ...effectiveModel.perturbingBodyIds
  ]);

  let searchHint = 0;
  const s0Scratch = new Float64Array(6);
  const d0Scratch = new Float64Array(6);
  const s1Scratch = new Float64Array(6);
  const d1Scratch = new Float64Array(6);

  function writeStateVectorAtElapsedSeconds(querySeconds, out6 = new Float64Array(6)) {
    requireFiniteNumber(querySeconds, 'querySeconds');
    if (querySeconds < minSeconds || querySeconds > maxSeconds) {
      throw new DynamicsError(
        'OUTSIDE_PROPAGATED_RANGE',
        `El instante solicitado (${querySeconds} s) está fuera del intervalo propagado [${minSeconds}, ${maxSeconds}] s.`,
        { querySeconds, minSeconds, maxSeconds }
      );
    }
    if (knotCount === 1 || querySeconds === knotTimes[0]) {
      for (let k = 0; k < 6; k++) out6[k] = knotStates[k];
      return out6;
    }
    const lastIdx = knotCount - 1;
    if (querySeconds === knotTimes[lastIdx]) {
      const base = lastIdx * 6;
      for (let k = 0; k < 6; k++) out6[k] = knotStates[base + k];
      return out6;
    }
    const idx = binarySearchKnot(knotTimes, querySeconds, forward, searchHint);
    searchHint = idx;
    const tA = knotTimes[idx];
    const tB = knotTimes[idx + 1];
    const baseA = idx * 6;
    const baseB = (idx + 1) * 6;
    for (let k = 0; k < 6; k++) {
      s0Scratch[k] = knotStates[baseA + k];
      d0Scratch[k] = knotDerivatives[baseA + k];
      s1Scratch[k] = knotStates[baseB + k];
      d1Scratch[k] = knotDerivatives[baseB + k];
    }
    return interpolateQuinticMechanicalState6(
      tA, s0Scratch, d0Scratch,
      tB, s1Scratch, d1Scratch,
      querySeconds, out6
    );
  }

  // Construcción independiente de las muestras destinadas al renderizado (en km físicos)
  let renderCount;
  if (totalDurationAbs === 0) {
    renderCount = 1;
  } else {
    const rawIntervals = Math.ceil(totalDurationAbs / renderSampleIntervalSeconds);
    const cappedIntervals = Math.min(rawIntervals, maxRenderSamples - 1);
    renderCount = Math.max(2, cappedIntervals + 1);
  }

  const renderTimesSeconds = new Float64Array(renderCount);
  const renderPositionsKm = new Float64Array(renderCount * 3);
  const sampleScratch6 = new Float64Array(6);

  for (let i = 0; i < renderCount; i++) {
    const frac = renderCount === 1 ? 0 : i / (renderCount - 1);
    const sampleT = i === renderCount - 1
      ? endSeconds
      : startSeconds + frac * (endSeconds - startSeconds);
    renderTimesSeconds[i] = sampleT;
    writeStateVectorAtElapsedSeconds(sampleT, sampleScratch6);
    renderPositionsKm[i * 3] = sampleScratch6[0];
    renderPositionsKm[i * 3 + 1] = sampleScratch6[1];
    renderPositionsKm[i * 3 + 2] = sampleScratch6[2];
  }

  function getStateAtElapsedSeconds(querySeconds) {
    const vec = writeStateVectorAtElapsedSeconds(querySeconds, new Float64Array(6));
    if (querySeconds === startSeconds && method === model.integratorMethod) {
      return validatedInitial;
    }
    return createProbeDynamicState({
      probe: validatedInitial.probe,
      time: createSimulationInstant(epochJdTdb, querySeconds),
      position: { x: vec[0], y: vec[1], z: vec[2], unit: 'km' },
      velocity: { x: vec[3], y: vec[4], z: vec[5], unit: 'km/s' },
      origin: validatedInitial.origin,
      reference: validatedInitial.reference,
      dynamicalModel: effectiveModel,
      gravitationalParameters: gmSnapshot,
      initialConditionProvenance: validatedInitial.initialConditionProvenance,
      segmentIndex: validatedInitial.segmentIndex
    });
  }

  function getStateAtJdTdb(queryJdTdb) {
    requireJdTdb(queryJdTdb);
    const relSeconds = jdTdbToElapsedSeconds(epochJdTdb, queryJdTdb);
    return getStateAtElapsedSeconds(relSeconds);
  }

  return Object.freeze({
    probe: validatedInitial.probe,
    dynamicalModel: effectiveModel,
    gravitationalParameters: gmSnapshot,
    epochJdTdb,
    startSeconds,
    endSeconds,
    startJdTdb,
    endJdTdb: endInstant.jdTdb,
    minSeconds,
    maxSeconds,
    ephemerisField: activeField,
    stoppedAtCoverageBoundary,
    coverageLimitNotice,
    aborted: integrationResult.aborted,
    abortReason: integrationResult.abortReason,
    diagnostics: Object.freeze({
      method,
      acceptedSteps: integrationResult.acceptedSteps,
      rejectedSteps: integrationResult.rejectedSteps,
      functionEvaluations: integrationResult.functionEvaluations,
      computationKnotCount: knotCount,
      renderSampleCount: renderCount,
      propagationWallTimeMs: wallTimeMs
    }),
    isWithinRange(querySeconds) {
      return typeof querySeconds === 'number'
        && Number.isFinite(querySeconds)
        && querySeconds >= minSeconds
        && querySeconds <= maxSeconds;
    },
    getStateAtElapsedSeconds,
    getStateAtJdTdb,
    writeStateVectorAtElapsedSeconds,
    getComputationKnotTimes() {
      return new Float64Array(knotTimes);
    },
    getRenderSamplesKm() {
      return Object.freeze({
        count: renderCount,
        unit: 'km',
        timesSeconds: new Float64Array(renderTimesSeconds),
        positionsKm: new Float64Array(renderPositionsKm)
      });
    }
  });
}
