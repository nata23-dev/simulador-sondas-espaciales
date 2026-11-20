// evidence/stage12g/independent-audit-runner.mjs
// Auditoría científica, matemática y numérica independiente de la Etapa 12G + 12F.1
// Auditor: Gemini (cálculos independientes sin oráculo circular)
import { readFileSync, writeFileSync } from 'node:fs';

const outPath = 'evidence/stage12g/independent-audit-results.json';
const results = {
  auditDate: new Date().toISOString(),
  auditor: 'Gemini (Auditor Independiente)',
  sections: {}
};

console.log('=== INICIO DE AUDITORÍA INDEPENDIENTE ETAPA 12G ===');

// ==========================================
// SECCIÓN 2: VALIDACIÓN DEL TIEMPO ASTRONÓMICO
// ==========================================
console.log('--- 1. Auditando tiempo astronómico (UTC, TAI, TT, TDB) ---');

const J2000_JD = 2451545.0;
const SECONDS_PER_DAY = 86400;
const TT_MINUS_TAI = 32.184;

const IERS_TABLE = [
  ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13],
  ['1975-01-01', 14], ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17],
  ['1979-01-01', 18], ['1980-01-01', 19], ['1981-07-01', 20], ['1982-07-01', 21],
  ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24], ['1990-01-01', 25],
  ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
  ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33],
  ['2009-01-01', 34], ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37]
];

function independentNaifDeltet(jdTt) {
  const K = 1.657e-3;
  const EB = 1.671e-2;
  const M0 = 6.239996;
  const M1 = 1.99096871e-7;
  const dtSeconds = (jdTt - J2000_JD) * SECONDS_PER_DAY;
  const M = M0 + M1 * dtSeconds;
  return K * Math.sin(M + EB * Math.sin(M));
}

function independentFairheadBretagnon(jdApprox) {
  const d = jdApprox - J2000_JD;
  const g = (357.5277233 + 0.9856002831 * d) * (Math.PI / 180);
  return 0.001657 * Math.sin(g) + 0.000022 * Math.sin(2 * g);
}

let maxDeltetDiff = 0;
for (let jd = 2461362.5; jd <= 2468346.5; jd += 5) {
  const diff = Math.abs(independentNaifDeltet(jd) - independentFairheadBretagnon(jd));
  if (diff > maxDeltetDiff) maxDeltetDiff = diff;
}

const holdout = JSON.parse(readFileSync('tests/fixtures/interplanetary-horizons-holdout-v1.json', 'utf8'));
const timeComparisons = holdout.deltaT.requestedUtc.map((utc, i) => {
  const horizonsDeltaT = Number(holdout.deltaT.rows[i][3]);
  const parts = utc.split(/[- :]/).map(Number);
  const year = parts[0], month = parts[1], day = parts[2], hour = parts[3] || 0, min = parts[4] || 0;
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  const jdUtc = jdn - 0.5 + (hour + min / 60) / 24;
  const jdTt = jdUtc + (37 + TT_MINUS_TAI) / SECONDS_PER_DAY;
  const tdbMinusTt = independentFairheadBretagnon(jdTt);
  const naifDeltet = independentNaifDeltet(jdTt);
  const calcTdbMinusUtc = 37 + TT_MINUS_TAI + tdbMinusTt;
  const diffHorizons = Math.abs(calcTdbMinusUtc - horizonsDeltaT);

  return {
    utc,
    jdUtc,
    horizonsDeltaT,
    calcTdbMinusUtc,
    diffHorizons,
    naifDeltet,
    tdbMinusTt
  };
});

results.sections.timeAudit = {
  leapSecondsTableEntries: IERS_TABLE.length,
  firstEntry: IERS_TABLE[0],
  lastEntry: IERS_TABLE[IERS_TABLE.length - 1],
  maxDeltetVsFairheadSeconds: maxDeltetDiff,
  timeComparisons
};

// ==========================================
// SECCIÓN 3: MARCOS DE REFERENCIA
// ==========================================
console.log('--- 2. Auditando marcos de referencia (Eclíptica J2000 <-> ICRF Ecuatorial) ---');

const OBLIQUITY_ARCSEC = 84381.448;
const epsRad = (OBLIQUITY_ARCSEC / 3600) * (Math.PI / 180);
const cosEps = Math.cos(epsRad);
const sinEps = Math.sin(epsRad);

function independentEclipticToEquatorial(v) {
  return [v[0], cosEps * v[1] - sinEps * v[2], sinEps * v[1] + cosEps * v[2]];
}

function independentEquatorialToEcliptic(v) {
  return [v[0], cosEps * v[1] + sinEps * v[2], -sinEps * v[1] + cosEps * v[2]];
}

// Cargar datasets en memoria estructurada
const allInnerData = [
  JSON.parse(readFileSync('public/data/interplanetary/ip-planets-inner-2026-2031.json', 'utf8')),
  JSON.parse(readFileSync('public/data/interplanetary/ip-planets-inner-2031-2036.json', 'utf8')),
  JSON.parse(readFileSync('public/data/interplanetary/ip-planets-inner-2036-2041.json', 'utf8')),
  JSON.parse(readFileSync('public/data/interplanetary/ip-planets-inner-2041-2046.json', 'utf8'))
];
const allOuterData = [
  JSON.parse(readFileSync('public/data/interplanetary/ip-planets-outer-2026-2046.json', 'utf8'))
];

function findNode(bodyId, jdTdb) {
  const pool = ['199', '299', '399', '499'].includes(bodyId) ? allInnerData : allOuterData;
  for (const ds of pool) {
    const s = ds.series[bodyId];
    if (s) {
      const match = s.find(row => Math.abs(row[0] - jdTdb) < 1e-6);
      if (match) {
        return {
          jdTdb: match[0],
          labelTdb: match[1],
          p: [match[2], match[3], match[4]],
          v: [match[5], match[6], match[7]]
        };
      }
    }
  }
  return null;
}

const frameCheckResults = holdout.frameCheck.rows.map(row => {
  const node = findNode('399', row.jdTdb);
  if (!node) throw new Error(`Node not found for Earth at ${row.jdTdb}`);

  const convertedPos = independentEclipticToEquatorial(node.p);
  const convertedVel = independentEclipticToEquatorial(node.v);

  const posDiffKm = Math.hypot(convertedPos[0] - row.positionKm[0], convertedPos[1] - row.positionKm[1], convertedPos[2] - row.positionKm[2]);
  const velDiffKmS = Math.hypot(convertedVel[0] - row.velocityKmS[0], convertedVel[1] - row.velocityKmS[1], convertedVel[2] - row.velocityKmS[2]);

  const normEcl = Math.hypot(...node.p);
  const normEq = Math.hypot(...convertedPos);
  const normDiff = Math.abs(normEcl - normEq);

  return {
    jdTdb: row.jdTdb,
    labelTdb: row.labelTdb,
    posDiffKm,
    velDiffKmS,
    normDiff
  };
});

results.sections.frameAudit = {
  obliquityArcsec: OBLIQUITY_ARCSEC,
  obliquityDeg: OBLIQUITY_ARCSEC / 3600,
  frameCheckResults
};

// ==========================================
// SECCIÓN 4: AUDITORÍA DE DATASETS HORIZONS
// ==========================================
console.log('--- 3. Auditando datasets Horizons en public/data/interplanetary/ ---');

const catalog = JSON.parse(readFileSync('public/data/interplanetary-ephemerides-catalog-v1.json', 'utf8'));
const datasetAudits = catalog.datasets.map(d => {
  const filePath = `public/${d.file}`;
  const metaPath = filePath.replace('.json', '.metadata.json');
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

  const bodyStats = {};
  for (const bodyId of d.bodyIds) {
    const s = data.series[bodyId];
    let hasNan = false;
    let minCadence = Infinity;
    let maxCadence = -Infinity;
    let isMonotonic = true;

    for (let i = 0; i < s.length; i++) {
      const row = s[i];
      const t = row[0];
      const p = [row[2], row[3], row[4]];
      const v = [row[5], row[6], row[7]];
      if (!Number.isFinite(t) || !p.every(Number.isFinite) || !v.every(Number.isFinite)) {
        hasNan = true;
      }
      if (i > 0) {
        const dt = (t - s[i - 1][0]) * SECONDS_PER_DAY;
        if (dt <= 0) isMonotonic = false;
        if (dt < minCadence) minCadence = dt;
        if (dt > maxCadence) maxCadence = dt;
      }
    }

    bodyStats[bodyId] = {
      count: s.length,
      startJdTdb: s[0][0],
      endJdTdb: s[s.length - 1][0],
      minCadenceSeconds: minCadence,
      maxCadenceSeconds: maxCadence,
      isMonotonic,
      hasNan
    };
  }

  return {
    id: d.id,
    file: d.file,
    expectedCadenceSeconds: d.cadenceSeconds,
    bodyIds: d.bodyIds,
    bodyStats
  };
});

results.sections.datasetAudit = {
  catalogVersion: catalog.catalogVersion,
  datasetsCount: catalog.datasets.length,
  datasetAudits
};

// ==========================================
// SECCIÓN 5: INTERPOLACIÓN DE EFEMÉRIDES (HERMITE)
// ==========================================
console.log('--- 4. Auditando interpolación Hermite contra holdout Horizons ---');

function independentHermite(p0, v0, p1, v1, t0, t1, t) {
  const h = (t1 - t0) * SECONDS_PER_DAY;
  const tau = (t - t0) / (t1 - t0);
  const tau2 = tau * tau;
  const tau3 = tau2 * tau;

  const h00 = 2 * tau3 - 3 * tau2 + 1;
  const h10 = tau3 - 2 * tau2 + tau;
  const h01 = -2 * tau3 + 3 * tau2;
  const h11 = tau3 - tau2;

  const dh00 = (6 * tau2 - 6 * tau) / h;
  const dh10 = (3 * tau2 - 4 * tau + 1);
  const dh01 = (-6 * tau2 + 6 * tau) / h;
  const dh11 = (3 * tau2 - 2 * tau);

  const p = [0, 1, 2].map(i => h00 * p0[i] + h10 * (h * v0[i]) + h01 * p1[i] + h11 * (h * v1[i]));
  const v = [0, 1, 2].map(i => dh00 * p0[i] + dh10 * v0[i] + dh01 * p1[i] + dh11 * v1[i]);

  return { p, v };
}

function getAdjacentNodes(bodyId, jdTdb) {
  const pool = ['199', '299', '399', '499'].includes(bodyId) ? allInnerData : allOuterData;
  for (const ds of pool) {
    const s = ds.series[bodyId];
    if (s && jdTdb >= s[0][0] && jdTdb <= s[s.length - 1][0]) {
      let lo = 0, hi = s.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (s[mid][0] <= jdTdb) lo = mid; else hi = mid;
      }
      const r0 = s[lo];
      const r1 = s[hi];
      return {
        t0: r0[0], p0: [r0[2], r0[3], r0[4]], v0: [r0[5], r0[6], r0[7]],
        t1: r1[0], p1: [r1[2], r1[3], r1[4]], v1: [r1[5], r1[6], r1[7]]
      };
    }
  }
  return null;
}

const holdoutValidation = {};
for (const [bodyId, data] of Object.entries(holdout.states)) {
  let maxPosErrKm = 0;
  let maxVelErrKmS = 0;
  const pointErrors = [];

  for (const row of data.rows) {
    const nodes = getAdjacentNodes(bodyId, row.jdTdb);
    if (!nodes) continue;
    const interp = independentHermite(nodes.p0, nodes.v0, nodes.p1, nodes.v1, nodes.t0, nodes.t1, row.jdTdb);
    const posErr = Math.hypot(interp.p[0] - row.positionKm[0], interp.p[1] - row.positionKm[1], interp.p[2] - row.positionKm[2]);
    const velErr = Math.hypot(interp.v[0] - row.velocityKmS[0], interp.v[1] - row.velocityKmS[1], interp.v[2] - row.velocityKmS[2]);

    if (posErr > maxPosErrKm) maxPosErrKm = posErr;
    if (velErr > maxVelErrKmS) maxVelErrKmS = velErr;

    pointErrors.push({
      jdTdb: row.jdTdb,
      labelTdb: row.labelTdb,
      posErrKm: posErr,
      velErrKmS: velErr
    });
  }

  holdoutValidation[bodyId] = {
    target: data.target,
    samplesTested: data.rows.length,
    maxPosErrKm,
    maxVelErrKmS,
    pointErrors
  };
}

results.sections.interpolationAudit = holdoutValidation;

// ==========================================
// SECCIÓN 6: SOLUCIONADOR DE LAMBERT
// ==========================================
console.log('--- 5. Auditando solucionador de Lambert (variables universales) ---');

function independentStumpff(z) {
  if (Math.abs(z) < 1e-4) {
    return {
      C: 0.5 - z / 24 + z * z / 720 - (z * z * z) / 40320,
      S: 1 / 6 - z / 120 + (z * z) / 5040 - (z * z * z) / 362880
    };
  }
  if (z > 0) {
    const s = Math.sqrt(z);
    return { C: (1 - Math.cos(s)) / z, S: (s - Math.sin(s)) / (s * s * s) };
  }
  const s = Math.sqrt(-z);
  return { C: (Math.cosh(s) - 1) / -z, S: (Math.sinh(s) - s) / (s * s * s) };
}

function independentLambert(r1, r2, tof, mu, direction = 'prograde') {
  const r1n = Math.hypot(...r1);
  const r2n = Math.hypot(...r2);
  const dot = r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2];
  const cross = [
    r1[1] * r2[2] - r1[2] * r2[1],
    r1[2] * r2[0] - r1[0] * r2[2],
    r1[0] * r2[1] - r1[1] * r2[0]
  ];
  const cosTheta = Math.max(-1, Math.min(1, dot / (r1n * r2n)));
  let dtheta = Math.acos(cosTheta);
  if (direction === 'prograde') {
    if (cross[2] < 0) dtheta = 2 * Math.PI - dtheta;
  } else {
    if (cross[2] >= 0) dtheta = 2 * Math.PI - dtheta;
  }

  const sinTheta = Math.sin(dtheta);
  const A = sinTheta * Math.sqrt((r1n * r2n) / (1 - cosTheta));

  function yOf(z) {
    const { C, S } = independentStumpff(z);
    return r1n + r2n + A * (z * S - 1) / Math.sqrt(C);
  }

  function tOf(z) {
    const y = yOf(z);
    if (y <= 0) return 0;
    const { C, S } = independentStumpff(z);
    return (Math.pow(y / C, 1.5) * S + A * Math.sqrt(y)) / Math.sqrt(mu);
  }

  let zLo = -4;
  while (tOf(zLo) > tof && zLo > -4e5) zLo = zLo * 2 - 4;
  let zHi = 4 * Math.PI * Math.PI * (1 - 1e-6);
  while (tOf(zHi) < tof && zHi < 4 * Math.PI * Math.PI - 1e-12) {
    zHi = 4 * Math.PI * Math.PI - (4 * Math.PI * Math.PI - zHi) / 4;
  }

  let a = zLo, b = zHi;
  let fa = tOf(a) - tof, fb = tOf(b) - tof;
  let z = a, side = 0;
  let iter = 0;

  for (; iter < 300; iter++) {
    z = (a * fb - b * fa) / (fb - fa);
    if (!(z > a && z < b)) z = 0.5 * (a + b);
    const fz = tOf(z) - tof;
    if (Math.abs(fz) <= 1e-12 * tof || Math.abs(b - a) <= 1e-15 * Math.max(1, Math.abs(z))) {
      iter++;
      break;
    }
    if (fz > 0) {
      b = z; fb = fz;
      if (side === 1) fa /= 2;
      side = 1;
    } else {
      a = z; fa = fz;
      if (side === -1) fb /= 2;
      side = -1;
    }
  }

  const y = yOf(z);
  const f = 1 - y / r1n;
  const g = A * Math.sqrt(y / mu);
  const gdot = 1 - y / r2n;

  const v1 = [0, 1, 2].map(i => (r2[i] - f * r1[i]) / g);
  const v2 = [0, 1, 2].map(i => (gdot * r2[i] - r1[i]) / g);

  return { v1, v2, z, y, A, dthetaDeg: (dtheta * 180) / Math.PI, iter, tofError: Math.abs(tOf(z) - tof) / tof };
}

// 1. Caso Curtis Ej. 5.2
const curtisMu = 398600;
const curtisR1 = [5000, 10000, 2100];
const curtisR2 = [-14600, 2500, 7000];
const curtisTof = 3600;
const curtisSol = independentLambert(curtisR1, curtisR2, curtisTof, curtisMu, 'prograde');
const curtisRefV1 = [-5.9925, 1.9254, 3.2456];
const curtisRefV2 = [-3.3125, -4.1966, -0.38529];
const curtisV1Err = Math.hypot(...curtisSol.v1.map((v, i) => v - curtisRefV1[i]));
const curtisV2Err = Math.hypot(...curtisSol.v2.map((v, i) => v - curtisRefV2[i]));

// 2. Caso Vallado Ej. 7-5
// r1 = [15945.34, 0, 0] km, r2 = [12214.83899, 10249.46731, 0] km, tof = 76 * 60 = 4560 s, mu = 398600.4418
const valladoMu = 398600.4418;
const valladoR1 = [15945.34, 0, 0];
const valladoR2 = [12214.83899, 10249.46731, 0];
const valladoTof = 76 * 60;
const valladoSol = independentLambert(valladoR1, valladoR2, valladoTof, valladoMu, 'prograde');
const valladoRefV1 = [2.058913, 2.915965, 0];
const valladoRefV2 = [-3.451565, 0.910314, 0];
const valladoV1Err = Math.hypot(...valladoSol.v1.map((v, i) => v - valladoRefV1[i]));
const valladoV2Err = Math.hypot(...valladoSol.v2.map((v, i) => v - valladoRefV2[i]));

// 3. Caso Analítico: cuarto de órbita circular a 1 AU
const muSun = 132712440041.279419;
const r1AU = 149597870.7;
const vCirc = Math.sqrt(muSun / r1AU);
const Tperiod = 2 * Math.PI * Math.sqrt(Math.pow(r1AU, 3) / muSun);
const circR1 = [r1AU, 0, 0];
const circR2 = [0, r1AU, 0];
const circTof = Tperiod / 4;
const circSol = independentLambert(circR1, circR2, circTof, muSun, 'prograde');
const circV1Expected = [0, vCirc, 0];
const circV2Expected = [-vCirc, 0, 0];
const circV1Err = Math.hypot(...circSol.v1.map((v, i) => v - circV1Expected[i]));
const circV2Err = Math.hypot(...circSol.v2.map((v, i) => v - circV2Expected[i]));

// 4. Tres problemas adicionales independientes:
const probA_r1 = [149597870.7, 0, 0];
const probA_r2 = [1.5 * 149597870.7 * Math.cos(2 * Math.PI / 3), 1.5 * 149597870.7 * Math.sin(2 * Math.PI / 3), 0];
const probA_tof = 180 * 86400;
const probA_sol = independentLambert(probA_r1, probA_r2, probA_tof, muSun, 'prograde');

const probB_r1 = [149597870.7, 0, 0];
const probB_r2 = [0, 2 * 149597870.7, 0.5 * 149597870.7];
const probB_tof = 60 * 86400;
const probB_sol = independentLambert(probB_r1, probB_r2, probB_tof, muSun, 'prograde');

const probC_dtheta = 178.5 * Math.PI / 180;
const probC_r1 = [149597870.7, 0, 0];
const probC_r2 = [1.5 * 149597870.7 * Math.cos(probC_dtheta), 1.5 * 149597870.7 * Math.sin(probC_dtheta), 0.05 * 149597870.7];
const probC_tof = 250 * 86400;
const probC_sol = independentLambert(probC_r1, probC_r2, probC_tof, muSun, 'prograde');

results.sections.lambertAudit = {
  curtisEx52: { sol: curtisSol, refV1: curtisRefV1, refV2: curtisRefV2, v1ErrKmS: curtisV1Err, v2ErrKmS: curtisV2Err },
  valladoEx75: { sol: valladoSol, refV1: valladoRefV1, refV2: valladoRefV2, v1ErrKmS: valladoV1Err, v2ErrKmS: valladoV2Err },
  analyticalCircularQuarter: { sol: circSol, vCircKmS: vCirc, v1ErrKmS: circV1Err, v2ErrKmS: circV2Err },
  extraProblemA: probA_sol,
  extraProblemB: probB_sol,
  extraProblemC: probC_sol
};

// ==========================================
// SECCIÓN 7: ERROR DE CIERRE DE TRAYECTORIA
// ==========================================
console.log('--- 6. Auditando cierre de trayectoria con integrador numérico independiente ---');

function independentDopri54Step(f, t, y, h) {
  const c = [0, 1/5, 3/10, 4/5, 8/9, 1, 1];
  const a21 = 1/5;
  const a31 = 3/40, a32 = 9/40;
  const a41 = 44/45, a42 = -56/15, a43 = 32/9;
  const a51 = 19372/6561, a52 = -25360/2187, a53 = 64448/6561, a54 = -212/729;
  const a61 = 9017/3168, a62 = -355/33, a63 = 46732/5247, a64 = 49/176, a65 = -5103/18656;
  const a71 = 35/384, a72 = 0, a73 = 500/1113, a74 = 125/192, a75 = -2187/6784, a76 = 11/84;

  const b5 = [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84, 0];
  const b4 = [5179/57600, 0, 7571/16695, 393/640, -92097/339200, 187/2100, 1/40];

  const k1 = f(t, y);
  const y2 = y.map((yi, i) => yi + h * a21 * k1[i]);
  const k2 = f(t + c[1] * h, y2);
  const y3 = y.map((yi, i) => yi + h * (a31 * k1[i] + a32 * k2[i]));
  const k3 = f(t + c[2] * h, y3);
  const y4 = y.map((yi, i) => yi + h * (a41 * k1[i] + a42 * k2[i] + a43 * k3[i]));
  const k4 = f(t + c[3] * h, y4);
  const y5 = y.map((yi, i) => yi + h * (a51 * k1[i] + a52 * k2[i] + a53 * k3[i] + a54 * k4[i]));
  const k5 = f(t + c[4] * h, y5);
  const y6 = y.map((yi, i) => yi + h * (a61 * k1[i] + a62 * k2[i] + a63 * k3[i] + a64 * k4[i] + a65 * k5[i]));
  const k6 = f(t + c[5] * h, y6);
  const y7 = y.map((yi, i) => yi + h * (a71 * k1[i] + a72 * k2[i] + a73 * k3[i] + a74 * k4[i] + a75 * k5[i] + a76 * k6[i]));
  const k7 = f(t + c[6] * h, y7);

  const yNext = y.map((yi, i) => yi + h * (b5[0]*k1[i] + b5[2]*k3[i] + b5[3]*k4[i] + b5[4]*k5[i] + b5[5]*k6[i]));
  const yErr = y.map((yi, i) => h * ((b5[0]-b4[0])*k1[i] + (b5[2]-b4[2])*k3[i] + (b5[3]-b4[3])*k4[i] + (b5[4]-b4[4])*k5[i] + (b5[5]-b4[5])*k6[i] + (b5[6]-b4[6])*k7[i]));

  return { yNext, yErr };
}

function independentPropagate2Body(r0, v0, tTarget, mu, relTol = 1e-13, absTol = 1e-10) {
  let t = 0;
  let y = [...r0, ...v0];
  let h = 3600;

  const f = (t, y) => {
    const r = Math.hypot(y[0], y[1], y[2]);
    const factor = -mu / (r * r * r);
    return [y[3], y[4], y[5], factor * y[0], factor * y[1], factor * y[2]];
  };

  while (t < tTarget) {
    if (t + h > tTarget) h = tTarget - t;
    const { yNext, yErr } = independentDopri54Step(f, t, y, h);

    let errRatio = 0;
    for (let i = 0; i < 6; i++) {
      const sc = absTol + relTol * Math.max(Math.abs(y[i]), Math.abs(yNext[i]));
      const ratio = yErr[i] / sc;
      errRatio += ratio * ratio;
    }
    errRatio = Math.sqrt(errRatio / 6);

    if (errRatio <= 1.0) {
      t += h;
      y = yNext;
      const factor = Math.min(5, Math.max(0.2, 0.9 * Math.pow(errRatio, -0.2)));
      h = Math.min(86400 * 5, h * factor);
    } else {
      const factor = Math.max(0.1, 0.9 * Math.pow(errRatio, -0.25));
      h = h * factor;
    }
  }

  return {
    rf: [y[0], y[1], y[2]],
    vf: [y[3], y[4], y[5]]
  };
}

function getInterpolatedState(bodyId, jdTdb) {
  const node = findNode(bodyId, jdTdb);
  if (node) return { p: node.p, v: node.v };
  const adj = getAdjacentNodes(bodyId, jdTdb);
  if (!adj) throw new Error(`No adjacent nodes for ${bodyId} at ${jdTdb}`);
  return independentHermite(adj.p0, adj.v0, adj.p1, adj.v1, adj.t0, adj.t1, jdTdb);
}

const earthMarsClosures = [];
const testTofsDays = [60, 150, 260, 316, 330, 500];
const depJd = 2462104.5;
const sEarthDep = getInterpolatedState('399', depJd);

for (const tofDays of testTofsDays) {
  const arrJd = depJd + tofDays;
  const sMarsArr = getInterpolatedState('499', arrJd);
  const tofSec = tofDays * 86400;
  const sol = independentLambert(sEarthDep.p, sMarsArr.p, tofSec, muSun, 'prograde');
  const prop = independentPropagate2Body(sEarthDep.p, sol.v1, tofSec, muSun);

  const posClosureKm = Math.hypot(prop.rf[0] - sMarsArr.p[0], prop.rf[1] - sMarsArr.p[1], prop.rf[2] - sMarsArr.p[2]);
  const velClosureKmS = Math.hypot(prop.vf[0] - sol.v2[0], prop.vf[1] - sol.v2[1], prop.vf[2] - sol.v2[2]);

  earthMarsClosures.push({
    tofDays,
    dthetaDeg: sol.dthetaDeg,
    transferType: sol.dthetaDeg < 180 ? 'Type I' : 'Type II',
    posClosureKm,
    velClosureKmS
  });
}

const extraClosures = [
  { name: 'Prob A (120°)', sol: probA_sol, r1: probA_r1, r2: probA_r2, tof: probA_tof },
  { name: 'Prob B (Hipérbola 60d)', sol: probB_sol, r1: probB_r1, r2: probB_r2, tof: probB_tof },
  { name: 'Prob C (Casi colineal 178.5°)', sol: probC_sol, r1: probC_r1, r2: probC_r2, tof: probC_tof }
].map(item => {
  const prop = independentPropagate2Body(item.r1, item.sol.v1, item.tof, muSun);
  const posClosureKm = Math.hypot(prop.rf[0] - item.r2[0], prop.rf[1] - item.r2[1], prop.rf[2] - item.r2[2]);
  const velClosureKmS = Math.hypot(prop.vf[0] - item.sol.v2[0], prop.vf[1] - item.sol.v2[1], prop.vf[2] - item.sol.v2[2]);
  return { name: item.name, dthetaDeg: item.sol.dthetaDeg, posClosureKm, velClosureKmS };
});

results.sections.trajectoryClosureAudit = {
  earthMarsClosures,
  extraClosures
};

// ==========================================
// SECCIÓN 8: VENTANAS TIERRA-MARTE Y COMPARACIÓN NASA
// ==========================================
console.log('--- 7. Auditando ventanas Tierra-Marte (2028) y contraste con NASA/TM-2010-216764 ---');

function calculateMissionCosts(rEarth, vEarth, rDest, vDest, tofDays) {
  const sol = independentLambert(rEarth, rDest, tofDays * 86400, muSun, 'prograde');
  const vInfDep = [sol.v1[0] - vEarth[0], sol.v1[1] - vEarth[1], sol.v1[2] - vEarth[2]];
  const vInfArr = [sol.v2[0] - vDest[0], sol.v2[1] - vDest[1], sol.v2[2] - vDest[2]];
  const c3 = vInfDep[0]*vInfDep[0] + vInfDep[1]*vInfDep[1] + vInfDep[2]*vInfDep[2];
  const vInfArrMag = Math.hypot(...vInfArr);
  const vInfDepMag = Math.hypot(...vInfDep);

  const rPark = 6371.0084 + 200;
  const muE = 398600.435507;
  const vCirc = Math.sqrt(muE / rPark);
  const vPeri = Math.sqrt(c3 + 2 * muE / rPark);
  const deltaVInj = vPeri - vCirc;

  const eqVInfDep = independentEclipticToEquatorial(vInfDep);
  const dlaRad = Math.asin(eqVInfDep[2] / vInfDepMag);
  const dlaDeg = dlaRad * 180 / Math.PI;
  let rlaRad = Math.atan2(eqVInfDep[1], eqVInfDep[0]);
  if (rlaRad < 0) rlaRad += 2 * Math.PI;
  const rlaDeg = rlaRad * 180 / Math.PI;

  return {
    c3,
    vInfDepMag,
    vInfArrMag,
    deltaVInj,
    dlaDeg,
    rlaDeg,
    dthetaDeg: sol.dthetaDeg,
    transferType: sol.dthetaDeg < 180 ? 'Type I' : 'Type II'
  };
}

const sEarthTypeI = getInterpolatedState('399', 2462114.5);
const sMarsTypeI = getInterpolatedState('499', 2462336.5);
const costTypeI = calculateMissionCosts(sEarthTypeI.p, sEarthTypeI.v, sMarsTypeI.p, sMarsTypeI.v, 222);

const sEarthTypeII = getInterpolatedState('399', 2462106.5);
const sMarsTypeII = getInterpolatedState('499', 2462424.5);
const costTypeII = calculateMissionCosts(sEarthTypeII.p, sEarthTypeII.v, sMarsTypeII.p, sMarsTypeII.v, 318);

const sEarthClaude = getInterpolatedState('399', 2462104.5);
const sMarsClaude = getInterpolatedState('499', 2462104.5 + 316);
const costClaude = calculateMissionCosts(sEarthClaude.p, sEarthClaude.v, sMarsClaude.p, sMarsClaude.v, 316);

let fineBestC3 = Infinity;
let fineBest = null;

for (let dDep = -4; dDep <= 4; dDep += 0.25) {
  const jdDep = 2462106.5 + dDep;
  const sE = getInterpolatedState('399', jdDep);
  for (let dTof = -6; dTof <= 6; dTof += 0.25) {
    const tof = 318 + dTof;
    const jdArr = jdDep + tof;
    const sM = getInterpolatedState('499', jdArr);
    const cost = calculateMissionCosts(sE.p, sE.v, sM.p, sM.v, tof);
    if (cost.c3 < fineBestC3) {
      fineBestC3 = cost.c3;
      fineBest = {
        jdDep,
        tofDays: tof,
        jdArr,
        cost
      };
    }
  }
}

results.sections.earthMarsAudit = {
  nasaHandbookTable3: {
    typeI: {
      dates: '12/10/28 -> 07/20/29 (TOF 222 d)',
      nasaC3: 9.048,
      nasaVinfArr: 4.892,
      nasaDlaDeg: 1.581,
      nasaRlaDeg: 158.9,
      ourCalculated: costTypeI
    },
    typeII: {
      dates: '12/02/28 -> 10/16/29 (TOF 318 d)',
      nasaC3: 8.928,
      nasaVinfArr: 3.261,
      nasaDlaDeg: 29.34,
      nasaRlaDeg: 185.1,
      ourCalculated: costTypeII
    }
  },
  claudeReportCaseA: {
    dates: '2028-11-30 -> 2029-10-12 (TOF 316 d)',
    claudeC3: 8.996,
    ourCalculated: costClaude
  },
  fineGridSearch: fineBest
};

// ==========================================
// SECCIÓN 9: VENTANAS TIERRA-VENUS
// ==========================================
console.log('--- 8. Auditando ventanas Tierra-Venus (2028) ---');
const jdDepVenus = 2461855.5;
const sEarthVenus = getInterpolatedState('399', jdDepVenus);
const sVenusArr = getInterpolatedState('299', jdDepVenus + 172);
const costVenus = calculateMissionCosts(sEarthVenus.p, sEarthVenus.v, sVenusArr.p, sVenusArr.v, 172);

const jdDepVenusTypeI = 2461839.5;
const sEarthVenusTypeI = getInterpolatedState('399', jdDepVenusTypeI);
const sVenusArrTypeI = getInterpolatedState('299', jdDepVenusTypeI + 114);
const costVenusTypeI = calculateMissionCosts(sEarthVenusTypeI.p, sEarthVenusTypeI.v, sVenusArrTypeI.p, sVenusArrTypeI.v, 114);

results.sections.earthVenusAudit = {
  typeII: {
    dates: '2028-03-26 -> 2028-09-14 (172 d)',
    reported: { c3: 9.185, vInfDep: 3.031, vInfArr: 5.790, dvInj: 3.635 },
    calculated: costVenus
  },
  typeI: {
    dates: '2028-03-10 -> 2028-07-02 (114 d)',
    reported: { c3: 11.184, vInfDep: 3.344, vInfArr: 5.978, dvInj: 3.723 },
    calculated: costVenusTypeI
  }
};

// ==========================================
// SECCIÓN 10: VENTANAS TIERRA-JÚPITER
// ==========================================
console.log('--- 9. Auditando ventanas Tierra-Júpiter (2028-2031) ---');
const jdDepJupiter = 2462130.5;
const sEarthJup = getInterpolatedState('399', jdDepJupiter);
const sJupArr = getInterpolatedState('599', jdDepJupiter + 1090);
const costJupiter = calculateMissionCosts(sEarthJup.p, sEarthJup.v, sJupArr.p, sJupArr.v, 1090);

results.sections.earthJupiterAudit = {
  dates: '2028-12-26 -> 2031-12-21 (1090 d)',
  reported: { c3: 75.73, vInfDep: 8.702, vInfArr: 5.697, dvInj: 6.249 },
  calculated: costJupiter
};

// ==========================================
// SECCIÓN 11: OTROS DESTINOS Y CONDICIONES LÍMITE
// ==========================================
console.log('--- 10. Auditando otros destinos (Mercurio, Saturno, Urano, Neptuno) y límites ---');

const jdDepMerc = 2462764.5;
const sEarthMerc = getInterpolatedState('399', jdDepMerc);
const sMercArr = getInterpolatedState('199', jdDepMerc + 116);
const costMerc = calculateMissionCosts(sEarthMerc.p, sEarthMerc.v, sMercArr.p, sMercArr.v, 116);

const jdDepSat = 2462712.5;
const sEarthSat = getInterpolatedState('399', jdDepSat);
const sSatArr = getInterpolatedState('699', jdDepSat + 1540);
const costSat = calculateMissionCosts(sEarthSat.p, sEarthSat.v, sSatArr.p, sSatArr.v, 1540);

const jdDepUra = 2462726.5;
const sEarthUra = getInterpolatedState('399', jdDepUra);
const sUraArr = getInterpolatedState('799', jdDepUra + 4020);
const costUra = calculateMissionCosts(sEarthUra.p, sEarthUra.v, sUraArr.p, sUraArr.v, 4020);

const jdDepNep = 2462652.5;
const sEarthNep = getInterpolatedState('399', jdDepNep);
const sNepArr = getInterpolatedState('899', jdDepNep + 5600);
const costNep = calculateMissionCosts(sEarthNep.p, sEarthNep.v, sNepArr.p, sNepArr.v, 5600);

results.sections.otherDestinationsAudit = {
  mercury: { dates: '2030-09-20 -> 2031-01-14 (116 d)', reportedC3: 51.30, calculated: costMerc },
  saturn: { dates: '2030-07-30 -> 2034-10-17 (1540 d)', reportedC3: 109.87, calculated: costSat },
  uranus: { dates: '2030-08-13 -> 2041-08-15 (4020 d)', reportedC3: 136.72, calculated: costUra },
  neptune: { dates: '2030-05-31 -> 2045-09-29 (5600 d - borde)', reportedC3: 159.03, calculated: costNep }
};

// ==========================================
// SECCIÓN 18: AUDITORÍA DE CORRECCIONES 12F.1
// ==========================================
console.log('--- 11. Auditando correcciones funcionales 12F.1 (A, B, C, D) ---');

// Comprobación de archivos modificados para 12F.1
const landingDynamicsSrc = readFileSync('src/lab/BodyLandingDynamics.js', 'utf8');
const missionViewSrc = readFileSync('src/lab/MissionExecutionView.js', 'utf8');
const missionCenterSrc = readFileSync('src/ui/MissionControlCenter.js', 'utf8');
const landingPlannerSrc = readFileSync('src/ui/LandingPlanner.js', 'utf8');

const fix12f1Audit = {
  fixA_camera: {
    noSmoothedLerpInLocal: missionViewSrc.includes('controls.target.copy(pose.target)') && missionViewSrc.includes('camera.lookAt(pose.target)'),
    localVerticalSetUp: missionViewSrc.includes('if (pose.up) camera.up.copy(pose.up)') && missionViewSrc.includes('up: g.up.clone()'),
    tangentGroundPatch: missionViewSrc.includes('localGroundPoint') && missionViewSrc.includes('groundPatch')
  },
  fixB_messages: {
    hasBodySpecificPreparedMessage: missionCenterSrc.includes('preparedMessage(execution)') && missionCenterSrc.includes('execution.simulation.bodyName'),
    landingOutcomeClarified: missionCenterSrc.includes('ATERRIZAJE SUAVE SEGÚN EL MODELO (descenso local aislado)') || missionCenterSrc.includes('(descenso local aislado)')
  },
  fixC_landerPanel: {
    openByDefault: landingPlannerSrc.includes('<details class="ft-section" open><summary>Módulo de aterrizaje'),
    markedEditable: landingPlannerSrc.includes('ilustrativo · editable')
  },
  fixD_tolerances: {
    predicateToleranceDefined: landingDynamicsSrc.includes('CONTACT_PREDICATE_KM = 1e-9'),
    bracketSecondsDefined: landingDynamicsSrc.includes('CONTACT_BRACKET_SECONDS = 1e-7'),
    contactTolerancesInDiagnostics: landingDynamicsSrc.includes('contactTolerances') || readFileSync('src/lab/BodyLandingSimulation.js', 'utf8').includes('contactTolerances')
  }
};

results.sections.fix12f1Audit = fix12f1Audit;

writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
console.log(`=== AUDITORÍA CIENTÍFICA COMPLETADA: Evidencia guardada en ${outPath} ===`);
