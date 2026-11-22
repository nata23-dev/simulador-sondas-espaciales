// Etapa 25 — línea de tiempo de la presentación del lanzamiento Voyager. Puro: sin DOM ni Three.js.
//
// Relaciona el tiempo de la PRESENTACIÓN (segundos de pantalla, p) con el tiempo de MISIÓN (segundos desde la ignición de los
// motores sólidos, t). Los tramos alrededor de cada acontecimiento van a velocidad real (×1) o casi; los largos (ascenso, crucero
// en la órbita de aparcamiento) se aceleran y se indica siempre el factor. Los cambios de velocidad son rampas suaves dentro de los
// tramos rápidos, t(p) es la integral del factor y el reloj nunca retrocede.
import { eventoPorId } from '../science/VoyagerLaunchProfile.js';

export const INICIO_MISION_S = -24; // la presentación empieza en T − 24 s (aproximación desde el espacio)
export const INICIO_CUENTA_ATRAS_S = -10;

/** Tramos [t inicial, t final, factor] a partir de los acontecimientos documentados de la misión. */
export function tramosPresentacion(mision) {
  const t = id => {
    const e = eventoPorId(mision, id);
    if (!e) throw new RangeError(`Falta el acontecimiento «${id}» en ${mision.id}`);
    return e.t;
  };
  const srm = t('srm-separacion'), e1 = t('etapa1-apagado'), cofia = t('cofia'), e2 = t('etapa2-apagado'), mes1 = t('mes1');
  const meco1 = t('meco1'), mes2 = t('mes2'), meco2 = t('meco2'), sep = t('separacion-nave'), pmI = t('pm-ignicion');
  const pmO = t('pm-apagado'), mast = t('mastiles'), pmS = t('pm-separacion');
  return [
    [INICIO_MISION_S, 20, 1], // aproximación, cuenta atrás y despegue a velocidad real
    [20, srm - 4, 6],
    [srm - 4, srm + 6, 1], // separación de los motores sólidos
    [srm + 6, e1 - 3, 12],
    [e1 - 3, cofia + 5, 2], // cambio de etapa y separación de la cofia
    [cofia + 5, e2 - 3, 16],
    [e2 - 3, mes1 + 4, 3], // separación Titan–Centaur y primer encendido
    [mes1 + 4, meco1 - 2, 16],
    [meco1 - 2, meco1 + 6, 1],
    [meco1 + 6, mes2 - 4, 250], // crucero en la órbita de aparcamiento (≈ 43 min)
    [mes2 - 4, mes2 + 6, 1],
    [mes2 + 6, meco2 - 3, 40],
    [meco2 - 3, meco2 + 4, 1],
    [meco2 + 4, sep - 4, 25],
    [sep - 4, pmI + 4, 3], // separación de la nave e ignición del módulo de propulsión
    [pmI + 4, pmO - 2, 6],
    [pmO - 2, pmO + 6, 1.5],
    [pmO + 6, mast - 2, 12],
    [mast - 2, mast + 10, 1.5], // suelta de los mástiles: aparece el modelo de NASA
    [mast + 10, pmS - 3, 60],
    [pmS - 3, pmS + 8, 1]
  ];
}

// Fases para el panel (por tiempo de misión). `hasta` exclusivo.
export function fasesPresentacion(mision) {
  const t = id => eventoPorId(mision, id).t;
  return [
    { id: 'aproximacion', hasta: INICIO_CUENTA_ATRAS_S, titulo: 'Aproximación a Cabo Cañaveral',
      texto: 'Descenso desde el espacio hasta el Complejo de Lanzamiento 41, en la costa atlántica de Florida.' },
    { id: 'cuenta-atras', hasta: 0, titulo: 'Cuenta atrás en LC-41',
      texto: 'El Titan IIIE-Centaur, de 48,8 m, espera junto a la torre umbilical; la torre de servicio móvil ya se ha retirado.' },
    { id: 'despegue', hasta: 20, titulo: 'Ignición y despegue',
      texto: 'Los dos motores sólidos UA1205 (≈ 5,3 MN cada uno) se encienden; el núcleo Titan sigue apagado hasta los ≈ 112 s.' },
    { id: 'ascenso-srm', hasta: t('srm-separacion'), titulo: 'Ascenso con los motores sólidos',
      texto: 'Programa de cabeceo hacia el este, sobre el Atlántico. La etapa I se enciende en vuelo cuando los motores sólidos se agotan.' },
    { id: 'etapa1', hasta: t('etapa1-apagado'), titulo: 'Etapa I (LR87)',
      texto: 'Los motores sólidos ya se han separado. La etapa I, de propulsantes hipergólicos, sigue el ascenso.' },
    { id: 'etapa2', hasta: t('etapa2-apagado'), titulo: 'Etapa II y separación de la cofia',
      texto: 'Por encima de la atmósfera densa se separa la cofia estándar del Centaur y queda a la vista la etapa superior.' },
    { id: 'centaur-1', hasta: t('meco1'), titulo: 'Primer encendido del Centaur',
      texto: 'Los dos RL10 de hidrógeno y oxígeno líquidos llevan el conjunto a la órbita de aparcamiento de 90 millas náuticas.' },
    { id: 'aparcamiento', hasta: t('mes2'), titulo: 'Crucero en la órbita de aparcamiento',
      texto: 'Unos 43 minutos de vuelo sin propulsión sobre el Atlántico y África hasta el punto de salida.' },
    { id: 'centaur-2', hasta: t('meco2'), titulo: 'Segundo encendido del Centaur',
      texto: 'El Centaur abandona la órbita terrestre: la energía de salida pasa a C3 ≈ 51 km²/s².' },
    { id: 'separacion', hasta: t('pm-ignicion'), titulo: 'Separación de la Voyager',
      texto: 'La nave, con su módulo de propulsión, se separa del Centaur, que se aparta.' },
    { id: 'inyeccion', hasta: t('pm-apagado'), titulo: 'Inyección hacia Júpiter',
      texto: 'El motor sólido del módulo de propulsión (≈ 68 kN, 43 s) completa la inyección: C3 ≈ 105 km²/s².' },
    { id: 'despliegue', hasta: t('pm-separacion'), titulo: 'Despliegue de la nave',
      texto: 'Se sueltan los mástiles del RTG y de ciencia. Desde aquí se muestra el modelo 3D oficial de NASA de la Voyager.' },
    { id: 'final', hasta: Infinity, titulo: 'Separación del módulo de propulsión',
      texto: 'La Voyager sigue sola su camino hacia Júpiter.' }
  ];
}

// Planos de cámara (por tiempo de misión). `suave`: se funde con el anterior en lugar de cortar.
export function planosPresentacion(mision) {
  const t = id => eventoPorId(mision, id).t;
  const srm = t('srm-separacion'), e1 = t('etapa1-apagado'), cofia = t('cofia'), mes1 = t('mes1'), meco1 = t('meco1');
  const mes2 = t('mes2'), meco2 = t('meco2'), sep = t('separacion-nave'), pmI = t('pm-ignicion'), pmO = t('pm-apagado');
  const mast = t('mastiles'), pmS = t('pm-separacion');
  return [
    { id: 'aproximacion', desde: INICIO_MISION_S },
    { id: 'plataforma-general', desde: INICIO_CUENTA_ATRAS_S },
    { id: 'plataforma-base', desde: -4.5 },
    { id: 'despegue-suelo', desde: 0 },
    { id: 'seguimiento-largo', desde: 9 },
    { id: 'persecucion', desde: 62 },
    { id: 'lateral-separacion', desde: srm - 4 },
    { id: 'persecucion-alta', desde: srm + 7 },
    { id: 'lateral-etapas', desde: e1 - 3 },
    { id: 'persecucion-orbital', desde: cofia + 6, suave: true },
    { id: 'orbita-aparcamiento', desde: mes1 + 6, suave: true },
    { id: 'persecucion-orbital', desde: mes2 - 5, suave: true },
    { id: 'lateral-separacion-nave', desde: meco2 + 4 },
    { id: 'persecucion-pm', desde: pmI + 3, suave: true },
    { id: 'nave-despliegue', desde: mast - 2 },
    { id: 'nave-final', desde: pmS - 3, suave: true }
  ].map((plano, i, lista) => ({ ...plano, hasta: lista[i + 1]?.desde ?? Infinity }));
}

/**
 * Crea la línea de tiempo. Devuelve conversiones p ↔ t, el factor instantáneo, la fase, el plano y los acontecimientos con su
 * instante de presentación.
 */
export function crearLineaTiempo(mision) {
  const tramos = tramosPresentacion(mision);
  for (let i = 0; i < tramos.length; i++) {
    const [a, b, f] = tramos[i];
    if (!(b > a) || !(f > 0)) throw new RangeError(`Tramo ${i} inválido: [${a}, ${b}] × ${f}`);
    if (i > 0 && Math.abs(tramos[i - 1][1] - a) > 1e-9) throw new RangeError(`Tramos ${i - 1} y ${i} no contiguos`);
  }
  // Velocidad continua: cada tramo rápido arranca y termina a la velocidad de su vecino más lento y la alcanza con una rampa suave
  // (en escala logarítmica) de RAMPA segundos de pantalla. Los tramos lentos, donde están los acontecimientos, quedan intactos, y la
  // duración en pantalla de cada tramo se ajusta para que cubra exactamente su intervalo de misión.
  const RAMPA = 1.5, DP = 0.01;
  const suave = u => u * u * (3 - 2 * u);
  const rampa = (r0, r1, u) => Math.exp(Math.log(r0) + (Math.log(r1) - Math.log(r0)) * suave(u));
  const integralRampa = (r0, r1) => { let a = 0; const n = 200; for (let i = 0; i < n; i++) a += rampa(r0, r1, (i + 0.5) / n); return a * RAMPA / n; };
  const plan = tramos.map(([a, b, f], i) => {
    const izq = i > 0 && tramos[i - 1][2] < f ? tramos[i - 1][2] : null, der = i < tramos.length - 1 && tramos[i + 1][2] < f ? tramos[i + 1][2] : null;
    const enRampas = (izq ? integralRampa(izq, f) : 0) + (der ? integralRampa(der, f) : 0), nRampas = (izq ? 1 : 0) + (der ? 1 : 0);
    const resto = (b - a) - enRampas;
    if (resto < 0) throw new RangeError(`Tramo ${i} demasiado corto para sus rampas`);
    return { a, b, f, izq, der, duracion: resto / f + nRampas * RAMPA };
  });
  const factorLocal = (tr, x) => tr.izq && x < RAMPA ? rampa(tr.izq, tr.f, x / RAMPA)
    : tr.der && x > tr.duracion - RAMPA ? rampa(tr.der, tr.f, (tr.duracion - x) / RAMPA) : tr.f;
  const pTabla = [], tTabla = [], fTabla = [];
  let p0 = 0;
  for (const tr of plan) {
    const pasos = Math.max(1, Math.ceil(tr.duracion / DP)), h = tr.duracion / pasos;
    let t = tr.a, fAnt = factorLocal(tr, 0);
    if (!pTabla.length) { pTabla.push(0); tTabla.push(t); fTabla.push(fAnt); }
    for (let j = 1; j <= pasos; j++) {
      const fj = factorLocal(tr, j * h);
      t += 0.5 * (fAnt + fj) * h; fAnt = fj;
      pTabla.push(p0 + j * h); tTabla.push(j === pasos ? tr.b : t); fTabla.push(fj); // el final del tramo cae en su instante exacto
    }
    p0 += tr.duracion;
  }
  const N = pTabla.length, duracion = p0, tFinal = tTabla[N - 1];
  const buscar = (tabla, v) => { let lo = 0, hi = N - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tabla[mid] <= v) lo = mid; else hi = mid; } return lo; };

  function misionDesdePresentacion(p) {
    if (p <= 0) return tTabla[0];
    if (p >= duracion) return tFinal;
    const j = buscar(pTabla, p);
    return tTabla[j] + (tTabla[j + 1] - tTabla[j]) * (p - pTabla[j]) / (pTabla[j + 1] - pTabla[j]);
  }
  const factorEn = p => fTabla[buscar(pTabla, Math.min(Math.max(p, 0), duracion))];
  function presentacionDesdeMision(t) {
    if (t <= tTabla[0]) return 0;
    if (t >= tFinal) return duracion;
    const j = buscar(tTabla, t);
    return pTabla[j] + (pTabla[j + 1] - pTabla[j]) * (t - tTabla[j]) / (tTabla[j + 1] - tTabla[j]);
  }
  const fases = fasesPresentacion(mision), planos = planosPresentacion(mision);
  const eventos = mision.eventos.map(e => Object.freeze({ ...e, p: presentacionDesdeMision(e.t) }));
  return Object.freeze({
    mision, tramos, duracion, tInicio: tTabla[0], tFin: tFinal, eventos: Object.freeze(eventos), fases, planos,
    misionDesdePresentacion, presentacionDesdeMision, factorEn,
    faseEn: t => fases.find(f => t < f.hasta) ?? fases[fases.length - 1],
    planoEn: t => { let actual = planos[0]; for (const pl of planos) if (t >= pl.desde) actual = pl; return actual; },
    siguienteEvento: t => eventos.find(e => e.t > t + 0.05) ?? null,
    eventoAnterior: t => [...eventos].reverse().find(e => e.t < t - 0.05) ?? null
  });
}

/** Reloj de misión «T − 00:10» / «T + 01:02:19». */
export function formatearRelojMision(t) {
  const signo = t < 0 ? '−' : '+', s = Math.abs(t), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = Math.floor(s % 60);
  const dos = v => String(v).padStart(2, '0');
  return `T ${signo} ${h > 0 ? `${h}:${dos(m)}` : dos(m)}:${dos(seg)}`;
}
