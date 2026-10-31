export const INTEGRATOR_METHODS = Object.freeze({
  RK4: 'rk4',
  DOPRI54: 'dopri54'
});

/**
 * Coeficientes racionales exactos de Dormand & Prince (1980),
 * "A family of embedded Runge-Kutta formulae", J. Comput. Appl. Math. 6(1), 19-26.
 * Propaga la solución de orden 5 (b) con estimador embebido de orden 4 (bStar) y FSAL.
 */
export const DORMAND_PRINCE_54_TABLEAU = Object.freeze({
  c2: 1 / 5,
  c3: 3 / 10,
  c4: 4 / 5,
  c5: 8 / 9,
  c6: 1,
  c7: 1,

  a21: 1 / 5,

  a31: 3 / 40,
  a32: 9 / 40,

  a41: 44 / 45,
  a42: -56 / 15,
  a43: 32 / 9,

  a51: 19372 / 6561,
  a52: -25360 / 2187,
  a53: 64448 / 6561,
  a54: -212 / 729,

  a61: 9017 / 3168,
  a62: -355 / 33,
  a63: 46732 / 5247,
  a64: 49 / 176,
  a65: -5103 / 18656,

  // Pesos de orden 5 (solución propagada y fila 7 FSAL)
  b1: 35 / 384,
  b2: 0,
  b3: 500 / 1113,
  b4: 125 / 192,
  b5: -2187 / 6784,
  b6: 11 / 84,
  b7: 0,

  // Diferencias de error e_i = b_i - b*_i
  e1: 71 / 57600,
  e2: 0,
  e3: -71 / 16695,
  e4: 71 / 1920,
  e5: -17253 / 339200,
  e6: 22 / 525,
  e7: -1 / 40
});

export class IntegrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function validateInitialVector(initialState) {
  if (!Array.isArray(initialState) && !(initialState instanceof Float64Array)) {
    throw new IntegrationError(
      'INVALID_CONFIGURATION',
      'initialState debe ser un arreglo numérico o Float64Array.'
    );
  }
  const dim = initialState.length;
  if (dim < 1) {
    throw new IntegrationError('INVALID_CONFIGURATION', 'initialState no puede estar vacío.');
  }
  const copy = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    const v = initialState[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new IntegrationError(
        'NON_FINITE_STATE',
        `initialState[${i}] debe ser un número finito.`,
        { index: i, value: v }
      );
    }
    copy[i] = v;
  }
  return copy;
}

function assertAllFinite(array, label, t) {
  for (let i = 0; i < array.length; i++) {
    if (!Number.isFinite(array[i])) {
      throw new IntegrationError(
        'NON_FINITE_STATE',
        `${label}[${i}] no es finito en t=${t} s.`,
        { label, index: i, elapsedSeconds: t, value: array[i] }
      );
    }
  }
}

function normalizeToleranceArray(tol, dim, name) {
  const out = new Float64Array(dim);
  if (typeof tol === 'number') {
    if (!Number.isFinite(tol) || tol <= 0) {
      throw new IntegrationError(
        'INVALID_CONFIGURATION',
        `${name} debe ser un número finito estrictamente positivo.`,
        { parameter: name, value: tol }
      );
    }
    out.fill(tol);
    return out;
  }
  if ((Array.isArray(tol) || tol instanceof Float64Array) && tol.length === dim) {
    for (let i = 0; i < dim; i++) {
      const v = tol[i];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
        throw new IntegrationError(
          'INVALID_CONFIGURATION',
          `${name}[${i}] debe ser un número finito estrictamente positivo.`,
          { parameter: name, index: i, value: v }
        );
      }
      out[i] = v;
    }
    return out;
  }
  throw new IntegrationError(
    'INVALID_CONFIGURATION',
    `${name} debe ser un escalar positivo o un vector de longitud ${dim}.`,
    { parameter: name }
  );
}

/**
 * Integrador de referencia Runge-Kutta clásico de cuarto orden (RK4) con paso fijo
 * configurable (recorta exactamente el último subpaso a `targetSeconds`).
 * Permite propagación hacia adelante y hacia atrás.
 */
export function integrateRk4({
  derivative,
  initialState,
  startSeconds = 0,
  targetSeconds,
  stepSeconds,
  maxSteps = 200000,
  recordSteps = false,
  shouldAbort = null
}) {
  if (typeof derivative !== 'function') {
    throw new IntegrationError('INVALID_CONFIGURATION', 'derivative debe ser una función.');
  }
  if (typeof startSeconds !== 'number' || !Number.isFinite(startSeconds)
    || typeof targetSeconds !== 'number' || !Number.isFinite(targetSeconds)) {
    throw new IntegrationError('INVALID_CONFIGURATION', 'startSeconds y targetSeconds deben ser números finitos.');
  }
  if (typeof stepSeconds !== 'number' || !Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new IntegrationError(
      'INVALID_CONFIGURATION',
      'stepSeconds debe ser un número finito estrictamente positivo.',
      { stepSeconds }
    );
  }
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) {
    throw new IntegrationError('INVALID_CONFIGURATION', 'maxSteps debe ser un entero positivo.', { maxSteps });
  }
  if (shouldAbort !== null && typeof shouldAbort !== 'function') {
    throw new IntegrationError('INVALID_CONFIGURATION', 'shouldAbort debe ser una función o null.');
  }

  const y = validateInitialVector(initialState);
  const dim = y.length;
  const k1 = new Float64Array(dim);
  const k2 = new Float64Array(dim);
  const k3 = new Float64Array(dim);
  const k4 = new Float64Array(dim);
  const stageState = new Float64Array(dim);

  let t = startSeconds;
  let functionEvaluations = 0;

  derivative(t, y, k1);
  functionEvaluations += 1;
  assertAllFinite(k1, 'k1', t);

  const knotTimes = recordSteps ? [t] : null;
  const knotStates = recordSteps ? [new Float64Array(y)] : null;
  const knotDerivatives = recordSteps ? [new Float64Array(k1)] : null;

  if (targetSeconds === startSeconds) {
    return Object.freeze({
      method: INTEGRATOR_METHODS.RK4,
      startSeconds,
      elapsedSeconds: t,
      finalState: new Float64Array(y),
      finalDerivative: new Float64Array(k1),
      steps: 0,
      acceptedSteps: 0,
      rejectedSteps: 0,
      functionEvaluations,
      aborted: false,
      abortReason: null,
      knots: recordSteps ? Object.freeze({
        times: Float64Array.from(knotTimes),
        states: knotStates,
        derivatives: knotDerivatives
      }) : null
    });
  }

  const direction = Math.sign(targetSeconds - startSeconds);
  let steps = 0;
  let aborted = false;
  let abortReason = null;

  while (t !== targetSeconds) {
    if (shouldAbort) {
      const abortCheck = shouldAbort({ step: steps, elapsedSeconds: t, state: y });
      if (abortCheck) {
        aborted = true;
        abortReason = typeof abortCheck === 'string' ? abortCheck : 'user_interrupted';
        break;
      }
    }
    if (steps >= maxSteps) {
      throw new IntegrationError(
        'MAX_ITERATIONS_EXCEEDED',
        `RK4 excedió el límite de ${maxSteps} pasos antes de alcanzar t=${targetSeconds} s.`,
        { maxSteps, currentSeconds: t, targetSeconds }
      );
    }

    if (steps > 0) {
      derivative(t, y, k1);
      functionEvaluations += 1;
      assertAllFinite(k1, 'k1', t);
    }

    const remaining = targetSeconds - t;
    const hittingTarget = Math.abs(remaining) <= stepSeconds * (1 + 1e-14);
    const nextT = hittingTarget
      ? targetSeconds
      : startSeconds + (steps + 1) * direction * stepSeconds;
    const h = nextT - t;
    if (h === 0 || !Number.isFinite(h)) {
      throw new IntegrationError('STAGNATION', 'El paso efectivo de RK4 perdió resolución numérica.', {
        elapsedSeconds: t,
        stepSeconds
      });
    }

    const halfH = 0.5 * h;
    for (let i = 0; i < dim; i++) stageState[i] = y[i] + halfH * k1[i];
    derivative(t + halfH, stageState, k2);
    functionEvaluations += 1;
    assertAllFinite(k2, 'k2', t + halfH);

    for (let i = 0; i < dim; i++) stageState[i] = y[i] + halfH * k2[i];
    derivative(t + halfH, stageState, k3);
    functionEvaluations += 1;
    assertAllFinite(k3, 'k3', t + halfH);

    for (let i = 0; i < dim; i++) stageState[i] = y[i] + h * k3[i];
    derivative(nextT, stageState, k4);
    functionEvaluations += 1;
    assertAllFinite(k4, 'k4', nextT);

    const sixthH = h / 6;
    for (let i = 0; i < dim; i++) {
      y[i] += sixthH * (k1[i] + 2 * (k2[i] + k3[i]) + k4[i]);
    }
    assertAllFinite(y, 'state', nextT);

    t = nextT;
    steps += 1;

    if (recordSteps) {
      const dyAccepted = new Float64Array(dim);
      derivative(t, y, dyAccepted);
      functionEvaluations += 1;
      assertAllFinite(dyAccepted, 'derivative', t);
      knotTimes.push(t);
      knotStates.push(new Float64Array(y));
      knotDerivatives.push(dyAccepted);
    }
  }

  const finalDerivative = new Float64Array(dim);
  if (recordSteps && knotDerivatives.length > 0) {
    finalDerivative.set(knotDerivatives[knotDerivatives.length - 1]);
  } else {
    derivative(t, y, finalDerivative);
    functionEvaluations += 1;
    assertAllFinite(finalDerivative, 'finalDerivative', t);
  }

  return Object.freeze({
    method: INTEGRATOR_METHODS.RK4,
    startSeconds,
    elapsedSeconds: t,
    finalState: new Float64Array(y),
    finalDerivative,
    steps,
    acceptedSteps: steps,
    rejectedSteps: 0,
    functionEvaluations,
    aborted,
    abortReason,
    knots: recordSteps ? Object.freeze({
      times: Float64Array.from(knotTimes),
      states: knotStates,
      derivatives: knotDerivatives
    }) : null
  });
}

function estimateInitialStep({
  y,
  k1,
  absTolVec,
  relTolVec,
  totalSpan,
  minStepSeconds,
  maxStepSeconds
}) {
  const dim = y.length;
  let d0Sq = 0;
  let d1Sq = 0;
  for (let i = 0; i < dim; i++) {
    const sc = absTolVec[i] + relTolVec[i] * Math.abs(y[i]);
    const r0 = y[i] / sc;
    const r1 = k1[i] / sc;
    d0Sq += r0 * r0;
    d1Sq += r1 * r1;
  }
  const d0 = Math.sqrt(d0Sq / dim);
  const d1 = Math.sqrt(d1Sq / dim);
  let h0 = (d0 < 1e-5 || d1 < 1e-5) ? 1e-3 * totalSpan : 0.01 * (d0 / d1);
  if (!Number.isFinite(h0) || h0 <= 0) h0 = minStepSeconds;
  return Math.min(maxStepSeconds, Math.min(totalSpan, Math.max(minStepSeconds, h0)));
}

/**
 * Integrador principal de paso adaptativo Dormand-Prince 5(4) (RK45 con FSAL).
 *
 * - Controla el error local mediante norma RMS ponderada por `absTol` y `relTol`.
 * - Soporta propagación hacia adelante y hacia atrás.
 * - Rechaza pasos con error > 1 o etapas intermedias no válidas y ajusta el paso.
 * - Detiene la integración si se supera `maxIterations`, si el paso cae bajo
 *   `minStepSeconds`, o de manera segura si `shouldAbort` lo solicita.
 */
export function integrateDopri54({
  derivative,
  initialState,
  startSeconds = 0,
  targetSeconds,
  initialStepSeconds = null,
  minStepSeconds = 1e-6,
  maxStepSeconds = 86400,
  absTol = 1e-9,
  relTol = 1e-11,
  maxIterations = 200000,
  recordSteps = false,
  shouldAbort = null
}) {
  if (typeof derivative !== 'function') {
    throw new IntegrationError('INVALID_CONFIGURATION', 'derivative debe ser una función.');
  }
  if (typeof startSeconds !== 'number' || !Number.isFinite(startSeconds)
    || typeof targetSeconds !== 'number' || !Number.isFinite(targetSeconds)) {
    throw new IntegrationError('INVALID_CONFIGURATION', 'startSeconds y targetSeconds deben ser números finitos.');
  }
  if (typeof minStepSeconds !== 'number' || !Number.isFinite(minStepSeconds) || minStepSeconds <= 0) {
    throw new IntegrationError('INVALID_CONFIGURATION', 'minStepSeconds debe ser finito y positivo.', { minStepSeconds });
  }
  if (typeof maxStepSeconds !== 'number' || !Number.isFinite(maxStepSeconds) || maxStepSeconds < minStepSeconds) {
    throw new IntegrationError(
      'INVALID_CONFIGURATION',
      'maxStepSeconds debe ser finito y mayor o igual que minStepSeconds.',
      { minStepSeconds, maxStepSeconds }
    );
  }
  if (initialStepSeconds !== null && (typeof initialStepSeconds !== 'number'
    || !Number.isFinite(initialStepSeconds) || initialStepSeconds <= 0)) {
    throw new IntegrationError(
      'INVALID_CONFIGURATION',
      'initialStepSeconds debe ser positivo o null.',
      { initialStepSeconds }
    );
  }
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1) {
    throw new IntegrationError('INVALID_CONFIGURATION', 'maxIterations debe ser un entero positivo.', { maxIterations });
  }
  if (shouldAbort !== null && typeof shouldAbort !== 'function') {
    throw new IntegrationError('INVALID_CONFIGURATION', 'shouldAbort debe ser una función o null.');
  }

  const y = validateInitialVector(initialState);
  const dim = y.length;
  const absTolVec = normalizeToleranceArray(absTol, dim, 'absTol');
  const relTolVec = normalizeToleranceArray(relTol, dim, 'relTol');

  const k1 = new Float64Array(dim);
  const k2 = new Float64Array(dim);
  const k3 = new Float64Array(dim);
  const k4 = new Float64Array(dim);
  const k5 = new Float64Array(dim);
  const k6 = new Float64Array(dim);
  const k7 = new Float64Array(dim);
  const stageState = new Float64Array(dim);
  const yNext = new Float64Array(dim);

  let t = startSeconds;
  let functionEvaluations = 0;

  derivative(t, y, k1);
  functionEvaluations += 1;
  assertAllFinite(k1, 'k1', t);

  const knotTimes = recordSteps ? [t] : null;
  const knotStates = recordSteps ? [new Float64Array(y)] : null;
  const knotDerivatives = recordSteps ? [new Float64Array(k1)] : null;

  const totalSpan = Math.abs(targetSeconds - startSeconds);
  if (totalSpan === 0) {
    return Object.freeze({
      method: INTEGRATOR_METHODS.DOPRI54,
      startSeconds,
      elapsedSeconds: t,
      finalState: new Float64Array(y),
      finalDerivative: new Float64Array(k1),
      iterations: 0,
      acceptedSteps: 0,
      rejectedSteps: 0,
      functionEvaluations,
      minStepUsedSeconds: 0,
      maxStepUsedSeconds: 0,
      aborted: false,
      abortReason: null,
      knots: recordSteps ? Object.freeze({
        times: Float64Array.from(knotTimes),
        states: knotStates,
        derivatives: knotDerivatives
      }) : null
    });
  }

  const direction = Math.sign(targetSeconds - startSeconds);
  let absH = initialStepSeconds !== null
    ? Math.min(maxStepSeconds, Math.min(totalSpan, Math.max(minStepSeconds, initialStepSeconds)))
    : estimateInitialStep({ y, k1, absTolVec, relTolVec, totalSpan, minStepSeconds, maxStepSeconds });

  const T = DORMAND_PRINCE_54_TABLEAU;
  const safety = 0.9;
  const minScale = 0.2;
  const maxScale = 5.0;

  let iterations = 0;
  let acceptedSteps = 0;
  let rejectedSteps = 0;
  let minStepUsed = Infinity;
  let maxStepUsed = 0;
  let aborted = false;
  let abortReason = null;

  while (t !== targetSeconds) {
    if (shouldAbort) {
      const abortCheck = shouldAbort({
        iteration: iterations,
        acceptedSteps,
        rejectedSteps,
        elapsedSeconds: t,
        state: y
      });
      if (abortCheck) {
        aborted = true;
        abortReason = typeof abortCheck === 'string' ? abortCheck : 'user_interrupted';
        break;
      }
    }
    if (iterations >= maxIterations) {
      throw new IntegrationError(
        'MAX_ITERATIONS_EXCEEDED',
        `DOPRI54 excedió el límite de ${maxIterations} iteraciones antes de alcanzar t=${targetSeconds} s.`,
        { maxIterations, acceptedSteps, rejectedSteps, currentSeconds: t, targetSeconds }
      );
    }
    iterations += 1;

    const remaining = targetSeconds - t;
    const absRem = Math.abs(remaining);
    let stepAbs = absH;
    let hittingTarget = false;

    if (stepAbs >= absRem || (absRem <= 1.1 * stepAbs && absRem <= maxStepSeconds)) {
      stepAbs = absRem;
      hittingTarget = true;
    } else if (absRem - stepAbs < minStepSeconds) {
      // Evita dejar un residuo final artificialmente menor que minStepSeconds.
      stepAbs = 0.5 * absRem;
    }

    if (!hittingTarget && stepAbs < minStepSeconds) {
      throw new IntegrationError(
        'STEP_UNDERFLOW',
        `El paso adaptativo (${stepAbs} s) cayó por debajo de minStepSeconds (${minStepSeconds} s).`,
        { stepAbs, minStepSeconds, elapsedSeconds: t }
      );
    }

    const h = direction * stepAbs;
    const nextT = hittingTarget ? targetSeconds : t + h;
    if (nextT === t) {
      throw new IntegrationError(
        'STAGNATION',
        `El avance temporal h=${h} s perdió significancia numérica en t=${t} s.`,
        { elapsedSeconds: t, stepSeconds: h }
      );
    }

    let stageFailed = false;
    try {
      for (let i = 0; i < dim; i++) stageState[i] = y[i] + h * T.a21 * k1[i];
      derivative(t + T.c2 * h, stageState, k2);
      functionEvaluations += 1;

      for (let i = 0; i < dim; i++) stageState[i] = y[i] + h * (T.a31 * k1[i] + T.a32 * k2[i]);
      derivative(t + T.c3 * h, stageState, k3);
      functionEvaluations += 1;

      for (let i = 0; i < dim; i++) {
        stageState[i] = y[i] + h * (T.a41 * k1[i] + T.a42 * k2[i] + T.a43 * k3[i]);
      }
      derivative(t + T.c4 * h, stageState, k4);
      functionEvaluations += 1;

      for (let i = 0; i < dim; i++) {
        stageState[i] = y[i] + h * (T.a51 * k1[i] + T.a52 * k2[i] + T.a53 * k3[i] + T.a54 * k4[i]);
      }
      derivative(t + T.c5 * h, stageState, k5);
      functionEvaluations += 1;

      for (let i = 0; i < dim; i++) {
        stageState[i] = y[i] + h * (T.a61 * k1[i] + T.a62 * k2[i] + T.a63 * k3[i] + T.a64 * k4[i] + T.a65 * k5[i]);
      }
      derivative(nextT, stageState, k6);
      functionEvaluations += 1;

      for (let i = 0; i < dim; i++) {
        yNext[i] = y[i] + h * (T.b1 * k1[i] + T.b3 * k3[i] + T.b4 * k4[i] + T.b5 * k5[i] + T.b6 * k6[i]);
      }
      derivative(nextT, yNext, k7);
      functionEvaluations += 1;
    } catch (error) {
      // Si un paso tentativo enorme cruza artificialmente una zona de aproximación
      // cercana, permitimos reducir el paso hasta minStepSeconds; si en minStepSeconds
      // persiste (colisión real o singularidad) o es fuera de cobertura, relanzamos.
      if ((error?.code === 'CLOSE_APPROACH_LIMIT' || error?.code === 'SINGULARITY')
        && stepAbs > minStepSeconds * (1 + 1e-12)) {
        stageFailed = true;
      } else {
        throw error;
      }
    }

    let errNorm = Infinity;
    if (!stageFailed) {
      let errSqSum = 0;
      let allFinite = true;
      for (let i = 0; i < dim; i++) {
        if (!Number.isFinite(yNext[i]) || !Number.isFinite(k7[i])) {
          allFinite = false;
          break;
        }
        const errComp = h * (
          T.e1 * k1[i] + T.e3 * k3[i] + T.e4 * k4[i]
          + T.e5 * k5[i] + T.e6 * k6[i] + T.e7 * k7[i]
        );
        const scale = absTolVec[i] + relTolVec[i] * Math.max(Math.abs(y[i]), Math.abs(yNext[i]));
        const ratio = errComp / scale;
        errSqSum += ratio * ratio;
      }
      if (allFinite && Number.isFinite(errSqSum)) {
        errNorm = Math.sqrt(errSqSum / dim);
      }
    }

    if (!Number.isFinite(errNorm) || errNorm > 1) {
      rejectedSteps += 1;
      if (stepAbs <= minStepSeconds * (1 + 1e-12)) {
        throw new IntegrationError(
          'STEP_UNDERFLOW',
          `Paso rechazado en el límite inferior minStepSeconds (${minStepSeconds} s) con error normalizado ${errNorm}.`,
          { minStepSeconds, errNorm, elapsedSeconds: t }
        );
      }
      const shrink = Number.isFinite(errNorm) && errNorm > 0
        ? Math.max(minScale, safety * Math.pow(errNorm, -0.2))
        : minScale;
      absH = Math.max(minStepSeconds, stepAbs * shrink);
      continue;
    }

    // Paso aceptado: avanzar estado y reutilizar k7 como k1 (FSAL).
    t = nextT;
    y.set(yNext);
    k1.set(k7);
    acceptedSteps += 1;
    const usedAbs = Math.abs(h);
    if (usedAbs < minStepUsed) minStepUsed = usedAbs;
    if (usedAbs > maxStepUsed) maxStepUsed = usedAbs;

    if (recordSteps) {
      knotTimes.push(t);
      knotStates.push(new Float64Array(y));
      knotDerivatives.push(new Float64Array(k1));
    }

    if (t === targetSeconds) break;

    const grow = errNorm === 0
      ? maxScale
      : Math.min(maxScale, Math.max(minScale, safety * Math.pow(errNorm, -0.2)));
    absH = Math.min(maxStepSeconds, Math.max(minStepSeconds, stepAbs * grow));
  }

  return Object.freeze({
    method: INTEGRATOR_METHODS.DOPRI54,
    startSeconds,
    elapsedSeconds: t,
    finalState: new Float64Array(y),
    finalDerivative: new Float64Array(k1),
    iterations,
    acceptedSteps,
    rejectedSteps,
    functionEvaluations,
    minStepUsedSeconds: acceptedSteps > 0 ? minStepUsed : 0,
    maxStepUsedSeconds: acceptedSteps > 0 ? maxStepUsed : 0,
    aborted,
    abortReason,
    knots: recordSteps ? Object.freeze({
      times: Float64Array.from(knotTimes),
      states: knotStates,
      derivatives: knotDerivatives
    }) : null
  });
}

/**
 * Interpolación de Hermite quíntica (orden 5, C^2 en posición y C^1 en velocidad)
 * entre dos nodos aceptados `(t0, state0, deriv0)` y `(t1, state1, deriv1)` de
 * un sistema mecánico de 6 componentes `[x, y, z, vx, vy, vz]`.
 *
 * No extrapola jamás fuera del intervalo `[min(t0, t1), max(t0, t1)]`.
 */
export function interpolateQuinticMechanicalState6(
  t0,
  state0,
  deriv0,
  t1,
  state1,
  deriv1,
  querySeconds,
  outState6 = new Float64Array(6)
) {
  if (typeof querySeconds !== 'number' || !Number.isFinite(querySeconds)) {
    throw new IntegrationError('INVALID_CONFIGURATION', 'querySeconds debe ser finito.', { querySeconds });
  }
  const minT = Math.min(t0, t1);
  const maxT = Math.max(t0, t1);
  if (querySeconds < minT || querySeconds > maxT) {
    throw new IntegrationError(
      'INVALID_CONFIGURATION',
      `No se permite extrapolar estado fuera del tramo [${minT}, ${maxT}] s (solicitado ${querySeconds} s).`,
      { minT, maxT, querySeconds }
    );
  }
  if (querySeconds === t0) {
    outState6.set(state0);
    return outState6;
  }
  if (querySeconds === t1) {
    outState6.set(state1);
    return outState6;
  }

  const h = t1 - t0;
  const u = (querySeconds - t0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const oneMinusU = 1 - u;
  const oneMinusU2 = oneMinusU * oneMinusU;
  const oneMinusU3 = oneMinusU2 * oneMinusU;

  // Polinomios base de posición H_ij(u)
  const h01 = u3 * (10 - 15 * u + 6 * u2);
  const h10 = u * (1 - 6 * u2 + 8 * u3 - 3 * u2 * u2);
  const h11 = u3 * (-4 + 7 * u - 3 * u2);
  const h20 = 0.5 * u2 * oneMinusU3;
  const h21 = 0.5 * u3 * oneMinusU2;

  // Derivadas respecto a u: dH_ij/du para calcular v(t) = (1/h) * dp/du
  const dh01 = 30 * u2 * oneMinusU2;
  const dh10 = oneMinusU2 * (1 + 2 * u - 15 * u2);
  const dh11 = u2 * (-12 + 28 * u - 15 * u2);
  const dh20 = 0.5 * u * oneMinusU2 * (2 - 5 * u);
  const dh21 = 0.5 * u2 * oneMinusU * (3 - 5 * u);

  const hSq = h * h;
  for (let axis = 0; axis < 3; axis++) {
    const p0 = state0[axis];
    const p1 = state1[axis];
    const v0 = state0[3 + axis];
    const v1 = state1[3 + axis];
    const a0 = deriv0[3 + axis];
    const a1 = deriv1[3 + axis];
    const dp = p1 - p0;

    outState6[axis] = p0 + h01 * dp + h * (h10 * v0 + h11 * v1) + hSq * (h20 * a0 + h21 * a1);
    outState6[3 + axis] = (dh01 / h) * dp + dh10 * v0 + dh11 * v1 + h * (dh20 * a0 + dh21 * a1);
  }
  return outState6;
}
