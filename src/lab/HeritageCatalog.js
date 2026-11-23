// En este módulo reúno la biblioteca de herencia con piezas y configuraciones derivadas de sondas reales (Voyager, Cassini, Dawn y Juno).
//
// Aplico una política estricta de trazabilidad: cada cifra relevante lleva su calidad y fuente asociada:
//   · documentado: valor publicado por NASA, JPL, ESA o NSSDCA (fuente primaria);
//   · secundario: ficha de fabricante de la misma familia o compilación enciclopédica sin contraste primario directo;
//   · derivado: valor calculado a partir de cifras documentadas (explico la operación en la nota);
//   · estimado: reparto o estimación interna del simulador para cerrar el balance de masa/potencia (no es una ficha histórica);
//   · desconocido: dato no disponible que no invento ni utilizo como si existiera.
// Como las masas individuales por pieza rara vez se publican, las estimo y obtengo la masa del bus cerrando con la masa seca documentada.
// Las geometrías 3D asociadas son reconstrucciones procedimentales a partir de las dimensiones publicadas, no modelos CAD oficiales.

export const DATA_QUALITY = Object.freeze({
  documented: 'documentado', secondary: 'secundario', derived: 'derivado', estimated: 'estimado', unknown: 'desconocido'
});
const { documented: DOC, secondary: SEC, derived: DER, estimated: EST, unknown: UNK } = DATA_QUALITY;

export const HERITAGE_SOURCES = Object.freeze({
  'nssdca-voyager1': { title: 'NSSDCA Master Catalog — Voyager 1 (1977-084A)', publisher: 'NASA GSFC', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-084A' },
  'wiki-voyager2': { title: 'Voyager 2 (masa de lanzamiento, hidracina y propulsores)', publisher: 'Wikipedia, fuente secundaria', url: 'https://en.wikipedia.org/wiki/Voyager_2' },
  'esa-cassini-eng': { title: 'Cassini-Huygens — Engineering', publisher: 'ESA', url: 'https://sci.esa.int/web/cassini-huygens/35026-engineering' },
  'jpl-cassini-charm': { title: 'Cassini CHARM: Spacecraft overview (propelente 3132 kg)', publisher: 'NASA/JPL vía PDS Atmospheres', url: 'https://atmos.nmsu.edu/data_and_services/atmospheres_data/Cassini/Cassini/1919-3644/6-20060328_CHARM_Webster.pdf' },
  'nasa-cassini-soi': { title: 'Cassini Saturn Orbit Insertion timeline (626 m/s, 96 min)', publisher: 'NASA', url: 'https://webarchive.library.unt.edu/eot2008/20080920062914/http://www.nasa.gov/pdf/61369main_soiTimeline.pdf' },
  'l3harris-r4d': { title: 'Bipropellant Rocket Engines (R-4D-11)', publisher: 'L3Harris / Aerojet Rocketdyne, ficha de fabricante', url: 'https://www.l3harris.com/sites/default/files/2023-07/AJRD-LHX_Bipropellant_Rocket_Engines_SpecSheet_CMYK_061423_APPROVED.pdf' },
  'nssdca-dawn': { title: 'NSSDCA Master Catalog — Dawn (2007-043A)', publisher: 'NASA GSFC', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2007-043A' },
  'jpl-juno-facts': { title: 'Juno Launch Press Kit — Quick Facts', publisher: 'NASA/JPL', url: 'https://www.jpl.nasa.gov/news/press_kits/juno/facts/' },
  'nssdca-juno': { title: 'NSSDCA Master Catalog — Juno (2011-040A)', publisher: 'NASA GSFC', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2011-040A' },
  'nasa-juno-joi': { title: 'NASA’s Juno Spacecraft in Orbit Around Mighty Jupiter (Leros-1b, 645 N, 542 m/s)', publisher: 'NASA/JPL', url: 'https://www.jpl.nasa.gov/news/nasas-juno-spacecraft-in-orbit-around-mighty-jupiter/' },
  'wiki-leros': { title: 'LEROS (tabla de prestaciones)', publisher: 'Wikipedia, fuente secundaria', url: 'https://en.wikipedia.org/wiki/LEROS' }
});

export const HERITAGE_PROGRAMS = Object.freeze([
  ['voyager', 'Voyager'], ['cassini', 'Cassini'], ['dawn', 'Dawn'], ['juno', 'Juno']
]);

const Q = (quality, source = null, note = '') => Object.freeze({ quality, source, note });
const v3 = (x, y, z) => Object.freeze([x, y, z]);
const unit = (x, y, z) => { const n = Math.hypot(x, y, z); return v3(x / n, y / n, z / n); };

// Construyo un punto de montaje de bus de herencia indicando categorías admitidas, interfaz mecánica, envolvente máxima y normal exterior (+Y local).
const slot = (id, name, accepts, iface, position, direction, envelopeM) => Object.freeze({
  id, name, category: accepts[0], accepts: Object.freeze(accepts), interface: iface,
  position: v3(...position), direction: direction.length === 3 ? unit(...direction) : direction, envelopeM
});
const PAYLOAD = ['camera', 'instrument', 'sensor'];
const BAY = ['avionics', 'storage', 'battery'];

// Creo cada pieza de herencia con los mismos campos base del catálogo ilustrativo más sus metadatos de calidad y fuentes.
const piece = (id, name, category, heritage, dryMassKg, dimensionsM, extra = {}) => Object.freeze({
  id, name, category, heritage, dryMassKg, dimensionsM: Object.freeze(dimensionsM),
  idlePowerW: 0, activePowerW: 0, generationW: 0, batteryWh: 0, fuelCapacityKg: 0, thrustN: 0, ispS: 0,
  mount: 'external', description: '', provenance: 'Pieza de herencia: valores con calidad y fuente declaradas', data: Object.freeze({}), sources: Object.freeze([]),
  ...extra
});
const meta = (data, sources) => ({ data: Object.freeze(data), sources: Object.freeze(sources) });

// Ajusto la constante de decaimiento exponencial de un RTG a partir de dos potencias documentadas: P(t) = P0·e^(−λt).
const rtgDecay = (p0, p1, years) => Math.log(p0 / p1) / years;
// Ajusto el exponente de la ley de potencia solar P(r) = P1·r^(−k) con dos puntos documentados en unidades astronómicas.
const solarExponent = (p1, pr, rAu) => Math.log(p1 / pr) / Math.log(rAu);

// ---------------------------------------------------------------------------------------------------------------------------
// Defino el bloque de piezas y bus decagonal de Voyager (3 MHW-RTG, antena de 3,66 m y propulsión de hidracina).
// ---------------------------------------------------------------------------------------------------------------------------
const VOYAGER_DRY_KG = 825.5 - 100; // obtengo la masa seca restando la hidracina a la masa de lanzamiento del módulo de misión
const VOYAGER_PARTS = [
  piece('voy-hga', 'Antena de alta ganancia de Voyager (3,66 m)', 'antenna', 'voyager', 50, [3.66, 0.75, 3.66], {
    shape: 'dish', interface: 'hga-mount', idlePowerW: 60,
    description: 'Reflector parabólico de 3,66 m en banda S y X montado sobre el bus. Consumo: asignación estimada del subsistema de telecomunicaciones.',
    ...meta({ dimensionsM: Q(DOC, 'nssdca-voyager1', 'Diámetro 3,66 m; profundidad estimada.'), dryMassKg: Q(EST), idlePowerW: Q(EST, null, 'Asignación del balance de 470 W.') }, ['nssdca-voyager1']) }),
  piece('voy-rtg', 'Pértiga con 3 generadores MHW-RTG', 'rtg', 'voyager', 120, [0.42, 2.6, 0.42], {
    shape: 'rtg-stack', units: 3, interface: 'rtg-boom', generationW: 470, rtgDecayPerYear: rtgDecay(470, 335, 1997.0 - 1977.7), powerSource: 'rtg',
    description: 'Tres RTG en serie sobre una pértiga: unos 470 W de 30 V CC en el lanzamiento y 335 W a comienzos de 1997.',
    ...meta({ generationW: Q(DOC, 'nssdca-voyager1', '≈ 470 W en el lanzamiento.'), rtgDecayPerYear: Q(DER, 'nssdca-voyager1', 'Ajuste exponencial 470 W (sep 1977) → 335 W (ene 1997).'),
      dryMassKg: Q(EST, null, 'Orden de magnitud de tres MHW-RTG con su pértiga.'), dimensionsM: Q(EST) }, ['nssdca-voyager1']) }),
  piece('voy-scan', 'Plataforma de barrido de Voyager (ISS, IRIS, UVS, PPS)', 'camera', 'voyager', 105, [0.9, 2.3, 0.7], {
    shape: 'scan-platform', interface: 'scan-platform-boom', idlePowerW: 85,
    description: 'Pértiga científica con la plataforma orientable de cámaras de ángulo estrecho y amplio y espectrómetros de teledetección.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST), dimensionsM: Q(EST) }, []) }),
  piece('voy-fields', 'Instrumentos de campos y partículas de Voyager', 'instrument', 'voyager', 35, [0.6, 0.5, 0.6], {
    shape: 'box', interface: 'payload-deck', idlePowerW: 45,
    description: 'Rayos cósmicos, partículas de baja energía, plasma y ondas (agrupados como un módulo).',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('voy-mag', 'Pértiga del magnetómetro de Voyager (13 m)', 'boom', 'voyager', 5.5, [0.1, 13, 0.1], {
    shape: 'boom', interface: 'boom-canister', idlePowerW: 3,
    description: 'Pértiga desplegable de 13 m para alejar los magnetómetros del campo propio de la nave.',
    ...meta({ dimensionsM: Q(DOC, 'nssdca-voyager1', 'Longitud 13 m.'), dryMassKg: Q(EST), idlePowerW: Q(EST) }, ['nssdca-voyager1']) }),
  piece('voy-tcm', 'Propulsores TCM de hidracina de Voyager (4 × MR-103)', 'engine', 'voyager', 10, [0.5, 0.35, 0.5], {
    shape: 'thruster-cluster', interface: 'monoprop-cluster', thrustN: 3.56, ispS: 220, propellant: 'hydrazine', propulsionType: 'chemical', activePowerW: 10,
    description: 'Cuatro de los dieciséis propulsores MR-103 se usaban para correcciones de trayectoria.',
    ...meta({ thrustN: Q(EST, 'wiki-voyager2', '4 propulsores × 0,89 N (valor por propulsor sin contraste primario).'), ispS: Q(EST, null, 'Rango típico de monopropelente catalítico (200–230 s).'),
      dryMassKg: Q(EST) }, ['wiki-voyager2']) }),
  piece('voy-tank', 'Depósito de hidracina de Voyager', 'tank', 'voyager', 10, [0.72, 0.72, 0.72], {
    shape: 'tank-sphere', mount: 'internal', interface: 'central-tank-bay', fuelCapacityKg: 100, propellant: 'hydrazine',
    description: 'Depósito esférico central; unos 100 kg de hidracina en el lanzamiento.',
    ...meta({ fuelCapacityKg: Q(SEC, 'wiki-voyager2', '100 kg en el lanzamiento.'), dryMassKg: Q(EST), dimensionsM: Q(EST) }, ['wiki-voyager2']) }),
  piece('voy-rcs', 'Propulsores de actitud de Voyager (12 × MR-103)', 'rcs', 'voyager', 8, [0.35, 0.2, 0.35], {
    shape: 'rcs-cluster', interface: 'rcs-mount', rcsCount: 12, rcsThrustN: 0.89, rcsPropellant: 'hydrazine', rcsPropellantKg: 0, sharesMainPropellant: true,
    description: 'Control de actitud; comparte la hidracina del depósito principal (el simulador no reserva una fracción).',
    ...meta({ rcsCount: Q(SEC, 'wiki-voyager2', '16 propulsores en total; 4 para TCM.'), rcsThrustN: Q(EST), dryMassKg: Q(EST) }, ['wiki-voyager2']) }),
  piece('voy-computers', 'Computadoras de Voyager (CCS, AACS, FDS)', 'avionics', 'voyager', 50, [0.55, 0.4, 0.45], {
    shape: 'box', mount: 'internal', interface: 'bus-bay', idlePowerW: 140,
    description: 'Mando y control, actitud y articulación, y subsistema de datos de vuelo. Incluye calentadores asignados.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('voy-dtr', 'Grabador digital de cinta de Voyager', 'storage', 'voyager', 9, [0.45, 0.25, 0.35], {
    shape: 'box', mount: 'internal', interface: 'bus-bay', idlePowerW: 10, dataCapacityMbit: 536,
    description: 'Grabador de cinta para datos científicos (capacidad citada habitualmente ≈ 536 Mbit, no verificada en esta etapa).',
    ...meta({ dataCapacityMbit: Q(UNK, null, 'Cifra habitual no contrastada.'), dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) })
];
const voyagerAttached = VOYAGER_PARTS.reduce((n, p) => n + p.dryMassKg, 0);
const VOYAGER_BUS = piece('bus-voyager', 'Bus decagonal de Voyager', 'structure', 'voyager', Math.round((VOYAGER_DRY_KG - voyagerAttached) * 10) / 10, [1.78, 0.47, 1.78], {
  shape: 'decagon', mount: 'internal', idlePowerW: 60, maxAttachedMassKg: Math.round((voyagerAttached + 100) * 1.15),
  description: 'Bus de diez caras, 47 cm de alto y 1,78 m entre caras opuestas. Masa por cierre con la masa seca derivada.',
  slots: Object.freeze([
    slot('hga', 'Antena superior', ['antenna'], 'hga-mount', [0, 0.3, 0], [0, 1, 0], 4.5),
    slot('power', 'Pértiga de potencia', ['rtg', 'solar'], 'rtg-boom', [-0.92, 0, 0], [-1, 0, 0], 12),
    slot('science', 'Pértiga científica', [...PAYLOAD], 'scan-platform-boom', [0.92, 0.05, 0], [1, 0, 0], 4),
    slot('fields', 'Cubierta de instrumentos', [...PAYLOAD], 'payload-deck', [0.45, 0.3, -0.45], [0, 1, 0], 1.5),
    slot('mag', 'Pértiga del magnetómetro', ['boom'], 'boom-canister', [0.3, 0.05, -0.86], [0.3, 0, -1], 15),
    slot('propulsion', 'Propulsores axiales', ['engine'], 'monoprop-cluster', [0, -0.3, 0], [0, -1, 0], 1.5),
    slot('tank', 'Cavidad central', ['tank'], 'central-tank-bay', [0, -0.05, 0], [0, 1, 0], 0.9),
    slot('rcs', 'Propulsores de actitud', ['rcs'], 'rcs-mount', [-0.3, -0.26, 0.62], [0, -1, 0], 1),
    slot('bay-1', 'Compartimento 1', [...BAY], 'bus-bay', [0.55, 0, 0.45], [0, 1, 0], 0.65),
    slot('bay-2', 'Compartimento 2', [...BAY], 'bus-bay', [-0.45, 0, 0.5], [0, 1, 0], 0.65)
  ]),
  ...meta({ dimensionsM: Q(DOC, 'nssdca-voyager1', '47 cm de alto, 1,78 m entre caras.'), dryMassKg: Q(DER, null, 'Cierre: masa seca − piezas estimadas.'),
    maxAttachedMassKg: Q(EST, null, 'Configuración histórica + 15 %.'), idlePowerW: Q(EST, null, 'Calentadores y regulación de potencia.') }, ['nssdca-voyager1', 'wiki-voyager2'])
});

// ---------------------------------------------------------------------------------------------------------------------------
// Defino el bloque de piezas y estructura de Cassini (2125 kg secos, 3 GPHS-RTG, 2 motores de 445 N y antena de 4 m).
// ---------------------------------------------------------------------------------------------------------------------------
const CASSINI_DRY_KG = 2125;
const CASSINI_RTG = piece('cas-rtg', 'Generador GPHS-RTG de Cassini', 'rtg', 'cassini', 56, [0.42, 1.14, 0.42], {
  shape: 'rtg', interface: 'rtg-mount', generationW: 295, rtgDecayPerYear: rtgDecay(885, 633, 11), powerSource: 'rtg',
  description: 'Uno de los tres RTG: unos 300 W en el lanzamiento y 210 W al final de la misión nominal de 11 años.',
  ...meta({ generationW: Q(DER, 'esa-cassini-eng', '885 W / 3 al inicio de la misión.'), rtgDecayPerYear: Q(DER, 'esa-cassini-eng', 'Ajuste 885 W → 633 W en 11 años.'),
    dryMassKg: Q(EST, null, 'Orden de magnitud de un GPHS-RTG.'), dimensionsM: Q(EST) }, ['esa-cassini-eng']) });
const CASSINI_PARTS = [
  piece('cas-hga', 'Antena de alta ganancia de Cassini (4 m)', 'antenna', 'cassini', 105, [4, 0.8, 4], {
    shape: 'dish', interface: 'hga-mount', idlePowerW: 100,
    description: 'Reflector primario de 4 m; también sirvió de escudo térmico en el interior del Sistema Solar.',
    ...meta({ dimensionsM: Q(DOC, 'esa-cassini-eng', 'Diámetro 4 m.'), dryMassKg: Q(EST), idlePowerW: Q(EST) }, ['esa-cassini-eng']) }),
  CASSINI_RTG,
  piece('cas-main-engine', 'Motores principales de Cassini (2 × R-4D-11, uno de reserva)', 'engine', 'cassini', 30, [0.9, 1.1, 0.9], {
    shape: 'nozzle', interface: 'biprop-gimbal', thrustN: 445, ispS: 311, propellant: 'nto-mmh', propulsionType: 'chemical', activePowerW: 50, gimbaled: true,
    description: 'Dos motores bipropelentes orientables; uno en uso y otro de reserva. Inserción en Saturno: 626 m/s en 96 min.',
    ...meta({ thrustN: Q(DOC, 'esa-cassini-eng', '445 N por motor.'), ispS: Q(SEC, 'l3harris-r4d', 'Familia R-4D-11: 311 s con ε = 164; el valor de vuelo de Cassini no se contrastó.'),
      dryMassKg: Q(EST, null, 'Dos motores con cardanes.'), activePowerW: Q(EST) }, ['esa-cassini-eng', 'l3harris-r4d', 'nasa-cassini-soi']) }),
  piece('cas-tanks', 'Depósitos bipropelentes de Cassini (NTO/MMH)', 'tank', 'cassini', 150, [1.6, 3.3, 1.6], {
    shape: 'tank-cylinder', mount: 'internal', interface: 'propulsion-module-bay', fuelCapacityKg: 3000, propellant: 'nto-mmh',
    description: 'Depósitos de oxidante y combustible del módulo de propulsión, agrupados como una pieza.',
    ...meta({ fuelCapacityKg: Q(EST, 'jpl-cassini-charm', 'Reparto estimado del total documentado de 3132 kg (bipropelente + hidracina).'), dryMassKg: Q(EST) }, ['jpl-cassini-charm']) }),
  piece('cas-rcs', 'Propulsores de actitud de Cassini (16 × 0,5 N, hidracina)', 'rcs', 'cassini', 25, [0.4, 0.3, 0.4], {
    shape: 'rcs-cluster', interface: 'rcs-mount', rcsCount: 16, rcsThrustN: 0.5, rcsPropellant: 'hydrazine', rcsPropellantKg: 132, idlePowerW: 30,
    description: 'Cuatro grupos de cuatro propulsores de hidracina con su depósito propio.',
    ...meta({ rcsCount: Q(DOC, 'esa-cassini-eng', '16 propulsores de 0,5 N.'), rcsThrustN: Q(DOC, 'esa-cassini-eng'), rcsPropellantKg: Q(EST, 'jpl-cassini-charm', 'Resto del total de 3132 kg.'),
      dryMassKg: Q(EST), idlePowerW: Q(EST, null, 'Calentadores de líneas.') }, ['esa-cassini-eng']) }),
  piece('cas-rsp', 'Paleta de teledetección de Cassini (ISS, VIMS, CIRS, UVIS)', 'camera', 'cassini', 170, [1.3, 1.0, 0.9], {
    shape: 'pallet', interface: 'pallet-mount', idlePowerW: 150,
    description: 'Cámaras y espectrómetros fijos al cuerpo; la nave entera gira para apuntarlos.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('cas-fpp', 'Paleta de campos y partículas de Cassini (MIMI, CAPS, …)', 'instrument', 'cassini', 110, [1.1, 0.8, 0.8], {
    shape: 'pallet', interface: 'pallet-mount', idlePowerW: 90,
    description: 'Instrumentos de plasma, partículas energéticas y polvo agrupados.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('cas-mag', 'Pértiga del magnetómetro de Cassini', 'boom', 'cassini', 30, [0.12, 11, 0.12], {
    shape: 'boom', interface: 'boom-canister', idlePowerW: 12,
    description: 'Pértiga desplegable con magnetómetros (longitud de 11 m citada habitualmente, no contrastada).',
    ...meta({ dimensionsM: Q(UNK, null, 'Longitud no contrastada.'), dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('cas-ssr', 'Grabadores de estado sólido de Cassini', 'storage', 'cassini', 20, [0.5, 0.3, 0.4], {
    shape: 'box', mount: 'internal', interface: 'bus-bay', idlePowerW: 15, dataCapacityMbit: 4000,
    description: 'Grabador de estado sólido de 4 Gbit.',
    ...meta({ dataCapacityMbit: Q(DOC, 'esa-cassini-eng', '4 gigabits.'), dryMassKg: Q(EST), idlePowerW: Q(EST) }, ['esa-cassini-eng']) }),
  piece('cas-avionics', 'Mando, datos y actitud de Cassini (CDS, AACS)', 'avionics', 'cassini', 80, [0.7, 0.45, 0.5], {
    shape: 'box', mount: 'internal', interface: 'bus-bay', idlePowerW: 150,
    description: 'Computadoras de mando y datos y de actitud y articulación.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('cas-huygens', 'Sonda Huygens con equipo de soporte', 'payload', 'cassini', 349, [2.7, 1.3, 2.7], {
    shape: 'probe-shell', interface: 'probe-support', idlePowerW: 0,
    description: 'Sonda de entrada de Titán (ESA). En este simulador viaja como masa: su separación y descenso no se modelan.',
    ...meta({ dryMassKg: Q(SEC, null, 'Masa de sistema citada habitualmente; no contrastada en esta etapa.'), dimensionsM: Q(EST, null, 'Escudo de unos 2,7 m.') }, ['esa-cassini-eng']) })
];
const cassiniAttached = CASSINI_PARTS.filter(p => p.id !== 'cas-huygens').reduce((n, p) => n + p.dryMassKg, 0) + 2 * CASSINI_RTG.dryMassKg; // tres RTG
const CASSINI_BUS = piece('bus-cassini', 'Estructura de Cassini (módulos de equipos y de propulsión)', 'structure', 'cassini', Math.round((CASSINI_DRY_KG - cassiniAttached) * 10) / 10, [2.2, 4.4, 2.2], {
  shape: 'cassini-stack', mount: 'internal', idlePowerW: 150, maxAttachedMassKg: Math.round((cassiniAttached + 3132 + 349) * 1.15),
  description: 'Bus de doce caras sobre el módulo de propulsión. Masa por cierre con los 2125 kg secos del orbitador.',
  slots: Object.freeze([
    slot('hga', 'Antena superior', ['antenna'], 'hga-mount', [0, 1.45, 0], [0, 1, 0], 4.6),
    slot('main-engine', 'Motor principal', ['engine'], 'biprop-gimbal', [0, -2.2, 0], [0, -1, 0], 2),
    slot('tank', 'Módulo de propulsión', ['tank'], 'propulsion-module-bay', [0, -0.55, 0], [0, 1, 0], 3.6),
    slot('rtg-1', 'Soporte de potencia 1', ['rtg', 'solar'], 'rtg-mount', [0, -1.75, 0.95], [0, -0.25, 1], 12),
    slot('rtg-2', 'Soporte de potencia 2', ['rtg', 'solar'], 'rtg-mount', [0.82, -1.75, -0.48], [0.866, -0.25, -0.5], 12),
    slot('rtg-3', 'Soporte de potencia 3', ['rtg', 'solar'], 'rtg-mount', [-0.82, -1.75, -0.48], [-0.866, -0.25, -0.5], 12),
    slot('rcs', 'Propulsores de actitud', ['rcs'], 'rcs-mount', [0.7, -1.3, 0.7], [0.7, 0, 0.7], 1),
    slot('pallet-1', 'Paleta de teledetección', [...PAYLOAD], 'pallet-mount', [1.1, 0.95, 0.2], [1, 0, 0], 2.5),
    slot('pallet-2', 'Paleta de campos y partículas', [...PAYLOAD], 'pallet-mount', [-1.1, 0.95, -0.2], [-1, 0, 0], 2.5),
    slot('probe', 'Soporte de sonda', ['payload'], 'probe-support', [0, -0.4, -1.0], [0, 0, -1], 3),
    slot('mag', 'Pértiga del magnetómetro', ['boom'], 'boom-canister', [-0.75, 1.05, 0.75], [-1, 0, 1], 14),
    slot('bay-1', 'Compartimento 1', [...BAY], 'bus-bay', [0.5, 0.95, -0.5], [0, 1, 0], 1),
    slot('bay-2', 'Compartimento 2', [...BAY], 'bus-bay', [-0.5, 0.95, 0.5], [0, 1, 0], 1)
  ]),
  ...meta({ dimensionsM: Q(DOC, 'esa-cassini-eng', 'Conjunto de 6,7 m de alto y 4 m de ancho; el bus solo, estimado.'), dryMassKg: Q(DER, 'esa-cassini-eng', 'Cierre: 2125 kg − piezas estimadas.'),
    maxAttachedMassKg: Q(EST, null, 'Configuración histórica + 15 %.'), idlePowerW: Q(EST) }, ['esa-cassini-eng', 'jpl-cassini-charm'])
});

// ---------------------------------------------------------------------------------------------------------------------------
// Defino el bloque de piezas y bus prismático de Dawn (747,1 kg secos, 425 kg de xenón, propulsión iónica y 10,3 kW a 1 AU).
// ---------------------------------------------------------------------------------------------------------------------------
const DAWN_DRY_KG = 747.1;
const DAWN_WING = piece('dawn-wing', 'Ala solar de Dawn (2,3 × 8,3 m)', 'solar', 'dawn', 60, [2.3, 9.03, 0.06], {
  shape: 'wing', panelLengthM: 8.3, interface: 'wing-drive', generationW: 5150, solarExponent: solarExponent(10300, 1300, 3), powerSource: 'solar',
  description: 'Cada ala aporta la mitad de los 10,3 kW a 1 AU; 1,3 kW en total a 3 AU al final de la vida útil. Envergadura total 19,7 m.',
  ...meta({ generationW: Q(DER, 'nssdca-dawn', '10,3 kW / 2 a 1 AU.'), solarExponent: Q(DER, 'nssdca-dawn', 'Ley P₁·r^(−k) ajustada a 10,3 kW (1 AU) y 1,3 kW (3 AU, fin de vida).'),
    dimensionsM: Q(DOC, 'nssdca-dawn', 'Paneles de 2,3 × 8,3 m; yugo derivado de la envergadura de 19,7 m.'), dryMassKg: Q(EST) }, ['nssdca-dawn']) });
const DAWN_PARTS = [
  DAWN_WING,
  piece('dawn-ion', 'Propulsión iónica NSTAR de Dawn (3 × 30 cm, uno en operación)', 'engine', 'dawn', 70, [1.2, 0.6, 1.2], {
    shape: 'ion-cluster', interface: 'ep-gimbal', thrustN: 0.092, ispS: 3100, propellant: 'xenon', propulsionType: 'electric', activePowerW: 2600, gimbaled: true,
    electric: Object.freeze({ maxInputPowerW: 2600, minInputPowerW: 500, efficiency: 0.092 * 9.80665 * 3100 / (2 * 2600) }),
    description: 'Tres propulsores iónicos de rejilla; empuje máximo de 92 mN con 2,6 kW de entrada. El empuje cae con la potencia disponible.',
    ...meta({ thrustN: Q(DOC, 'nssdca-dawn', '92 mN a 2,6 kW.'), ispS: Q(EST, 'nssdca-dawn', 'Valor dentro del intervalo documentado 1900–3200 s (máxima potencia).'),
      'electric.maxInputPowerW': Q(DOC, 'nssdca-dawn', '2,6 kW.'), 'electric.minInputPowerW': Q(EST, null, 'Umbral de encendido del simulador.'),
      'electric.efficiency': Q(DER, null, 'η = T·g₀·Isp / (2P).'), dryMassKg: Q(EST, null, 'Propulsores, unidades de potencia y cardanes.') }, ['nssdca-dawn']) }),
  piece('dawn-xenon', 'Depósito de xenón de Dawn', 'tank', 'dawn', 22, [0.9, 1.1, 0.9], {
    shape: 'tank-cylinder', mount: 'internal', interface: 'central-cylinder', fuelCapacityKg: 425, propellant: 'xenon',
    description: 'Depósito de xenón a alta presión en el cilindro central: 425 kg en el lanzamiento.',
    ...meta({ fuelCapacityKg: Q(DOC, 'nssdca-dawn', '425 kg en el lanzamiento.'), dryMassKg: Q(EST) }, ['nssdca-dawn']) }),
  piece('dawn-rcs', 'Propulsores de actitud de Dawn (12 × 0,9 N, hidracina)', 'rcs', 'dawn', 15, [0.35, 0.25, 0.35], {
    shape: 'rcs-cluster', interface: 'rcs-mount', rcsCount: 12, rcsThrustN: 0.9, rcsPropellant: 'hydrazine', rcsPropellantKg: 45.6, idlePowerW: 10,
    description: 'Doce propulsores de hidracina con 45,6 kg en el lanzamiento.',
    ...meta({ rcsCount: Q(DOC, 'nssdca-dawn'), rcsThrustN: Q(DOC, 'nssdca-dawn'), rcsPropellantKg: Q(DOC, 'nssdca-dawn'), dryMassKg: Q(EST) }, ['nssdca-dawn']) }),
  piece('dawn-hga', 'Antena de alta ganancia de Dawn (1,52 m)', 'antenna', 'dawn', 12, [1.52, 0.35, 1.52], {
    shape: 'dish', interface: 'hga-mount', idlePowerW: 50,
    description: 'Plato parabólico fijo de 1,52 m.',
    ...meta({ dimensionsM: Q(DOC, 'nssdca-dawn', 'Diámetro 1,52 m.'), dryMassKg: Q(EST), idlePowerW: Q(EST) }, ['nssdca-dawn']) }),
  piece('dawn-battery', 'Batería NiH₂ de Dawn (35 Ah)', 'battery', 'dawn', 32, [0.5, 0.4, 0.4], {
    shape: 'box', mount: 'internal', interface: 'bus-bay', batteryWh: 35 * 28,
    description: 'Batería de níquel-hidrógeno de 35 Ah; la energía supone 28 V nominales.',
    ...meta({ batteryWh: Q(DER, 'nssdca-dawn', '35 Ah documentados × 28 V supuestos.'), dryMassKg: Q(EST) }, ['nssdca-dawn']) }),
  piece('dawn-fc', 'Cámara de encuadre de Dawn', 'camera', 'dawn', 11, [0.4, 0.5, 0.35], {
    shape: 'camera', interface: 'payload-deck', idlePowerW: 18,
    description: 'Cámara de encuadre (dos unidades redundantes).',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('dawn-vir', 'Espectrómetro VIR de Dawn', 'instrument', 'dawn', 24, [0.5, 0.45, 0.45], {
    shape: 'box', interface: 'payload-deck', idlePowerW: 30,
    description: 'Espectrómetro de imagen visible e infrarrojo.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('dawn-grand', 'Detector GRaND de Dawn', 'sensor', 'dawn', 10, [0.35, 0.3, 0.35], {
    shape: 'box', interface: 'payload-deck', idlePowerW: 9,
    description: 'Detector de rayos gamma y neutrones.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('dawn-avionics', 'Computadora y control de Dawn', 'avionics', 'dawn', 30, [0.5, 0.35, 0.4], {
    shape: 'box', mount: 'internal', interface: 'bus-bay', idlePowerW: 150,
    description: 'Mando, datos y control de actitud.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) })
];
const dawnAttached = DAWN_PARTS.reduce((n, p) => n + p.dryMassKg, 0) + DAWN_WING.dryMassKg; // dos alas
const DAWN_BUS = piece('bus-dawn', 'Bus prismático de Dawn', 'structure', 'dawn', Math.round((DAWN_DRY_KG - dawnAttached) * 10) / 10, [1.64, 1.77, 1.27], {
  shape: 'box-bus', mount: 'internal', idlePowerW: 180, maxAttachedMassKg: Math.round((dawnAttached + 425 + 45.6) * 1.15),
  description: 'Bus de 1,64 × 1,27 × 1,77 m con cilindro central para el xenón. Masa por cierre con 747,1 kg secos.',
  slots: Object.freeze([
    slot('wing-left', 'Ala de babor', ['solar', 'rtg'], 'wing-drive', [-0.84, 0.1, 0], [-1, 0, 0], 12),
    slot('wing-right', 'Ala de estribor', ['solar', 'rtg'], 'wing-drive', [0.84, 0.1, 0], [1, 0, 0], 12),
    slot('ep', 'Cubierta de propulsión', ['engine'], 'ep-gimbal', [0, -0.9, 0], [0, -1, 0], 1.6),
    slot('tank', 'Cilindro central', ['tank'], 'central-cylinder', [0, 0, 0], [0, 1, 0], 1.25),
    slot('rcs', 'Propulsores de actitud', ['rcs'], 'rcs-mount', [0.6, -0.9, 0.5], [0, -1, 0], 1),
    slot('hga', 'Antena lateral', ['antenna'], 'hga-mount', [0, 0.2, 0.65], [0, 0, 1], 2),
    slot('deck-1', 'Cubierta científica 1', [...PAYLOAD], 'payload-deck', [0, 0.9, -0.2], [0, 1, 0], 1),
    slot('deck-2', 'Cubierta científica 2', [...PAYLOAD], 'payload-deck', [0.45, 0.9, 0.3], [0, 1, 0], 1),
    slot('deck-3', 'Cubierta científica 3', [...PAYLOAD], 'payload-deck', [-0.45, 0.9, 0.3], [0, 1, 0], 1),
    slot('bay-1', 'Compartimento 1', [...BAY], 'bus-bay', [0.5, 0.25, -0.35], [0, 1, 0], 0.7),
    slot('bay-2', 'Compartimento 2', [...BAY], 'bus-bay', [-0.5, 0.25, -0.35], [0, 1, 0], 0.7)
  ]),
  ...meta({ dimensionsM: Q(DOC, 'nssdca-dawn', '1,64 × 1,27 × 1,77 m.'), dryMassKg: Q(DER, 'nssdca-dawn', 'Cierre: 747,1 kg − piezas estimadas.'),
    maxAttachedMassKg: Q(EST, null, 'Configuración histórica + 15 %.'), idlePowerW: Q(EST, null, 'Calentadores y regulación.') }, ['nssdca-dawn'])
});

// ---------------------------------------------------------------------------------------------------------------------------
// Defino el bloque de piezas y bus hexagonal de Juno (3 alas solares de 9 m, 14 kW a 1 AU y motor principal Leros-1b de 645 N).
// ---------------------------------------------------------------------------------------------------------------------------
const JUNO_PROPELLANT_KG = 1280 + 752;
const JUNO_DRY_KG = 3625 - JUNO_PROPELLANT_KG; // calculo la masa seca restando combustible y oxidante a la masa de lanzamiento
const JUNO_WING = piece('juno-wing', 'Ala solar de Juno (9 × 2,65 m)', 'solar', 'juno', 112, [2.65, 9, 0.08], {
  shape: 'wing', panelLengthM: 9, interface: 'wing-hinge', generationW: 14000 / 3, solarExponent: solarExponent(14000, 400, 5.4), powerSource: 'solar',
  description: 'Una de las tres alas (18 698 células en total): unos 14 kW a la distancia de la Tierra y unos 400 W en Júpiter.',
  ...meta({ generationW: Q(DER, 'jpl-juno-facts', '14 kW / 3 alas (reparto uniforme; una ala tiene un panel menos).'),
    solarExponent: Q(DER, 'jpl-juno-facts', 'Ley P₁·r^(−k) ajustada a 14 kW (1 AU) y 400 W en Júpiter (≈ 5,4 AU en la llegada).'),
    dimensionsM: Q(DOC, 'jpl-juno-facts', '9 × 2,65 m.'), dryMassKg: Q(EST) }, ['jpl-juno-facts', 'nssdca-juno']) });
const JUNO_PARTS = [
  JUNO_WING,
  piece('juno-leros', 'Motor principal Leros-1b de Juno', 'engine', 'juno', 10, [0.6, 0.9, 0.6], {
    shape: 'nozzle', interface: 'fixed-engine-mount', thrustN: 645, ispS: 318, propellant: 'mon-hydrazine', propulsionType: 'chemical', activePowerW: 40,
    description: 'Motor bipropelente de 645 N; la inserción en Júpiter (4-5 jul 2016) duró 35 min y redujo la velocidad 542 m/s.',
    ...meta({ thrustN: Q(DOC, 'nasa-juno-joi', '645 N.'), ispS: Q(SEC, 'wiki-leros', '318 s (tabla secundaria).'), dryMassKg: Q(EST), activePowerW: Q(EST) }, ['nasa-juno-joi', 'wiki-leros']) }),
  piece('juno-tanks', 'Depósitos de Juno (hidracina y oxidante)', 'tank', 'juno', 120, [2.4, 1.4, 2.4], {
    shape: 'tank-ring', mount: 'internal', interface: 'tank-ring', fuelCapacityKg: JUNO_PROPELLANT_KG, propellant: 'mon-hydrazine',
    description: 'Seis depósitos esféricos: 1280 kg de hidracina y 752 kg de oxidante en el lanzamiento.',
    ...meta({ fuelCapacityKg: Q(DOC, 'jpl-juno-facts', '1280 + 752 kg.'), dryMassKg: Q(EST) }, ['jpl-juno-facts']) }),
  piece('juno-rcs', 'Propulsores de actitud de Juno (modo dual)', 'rcs', 'juno', 20, [0.4, 0.3, 0.4], {
    shape: 'rcs-cluster', interface: 'rcs-mount', rcsCount: null, rcsThrustN: null, rcsPropellant: 'hydrazine', rcsPropellantKg: 0, sharesMainPropellant: true, idlePowerW: 10,
    description: 'Propulsores de monopropelente alimentados por la hidracina del sistema principal (número y empuje no contrastados).',
    ...meta({ rcsCount: Q(UNK), rcsThrustN: Q(UNK), dryMassKg: Q(EST) }, ['jpl-juno-facts']) }),
  piece('juno-vault', 'Bóveda de radiación de Juno con electrónica de mando', 'avionics', 'juno', 190, [0.8, 0.6, 0.8], {
    shape: 'vault', interface: 'vault-deck', idlePowerW: 150,
    description: 'Bóveda de titanio de 0,8 × 0,8 × 0,6 m y 150 kg que protege la electrónica (más unos 40 kg estimados de electrónica).',
    ...meta({ dimensionsM: Q(DOC, 'nssdca-juno', '0,8 × 0,8 × 0,6 m.'), dryMassKg: Q(DER, 'nssdca-juno', '150 kg de bóveda documentados + 40 kg estimados.'), idlePowerW: Q(EST) }, ['nssdca-juno']) }),
  piece('juno-hga', 'Antena de alta ganancia de Juno', 'antenna', 'juno', 30, [2.5, 0.5, 2.5], {
    shape: 'dish', interface: 'hga-mount', idlePowerW: 60,
    description: 'Plato fijo en la cara superior (diámetro de 2,5 m citado habitualmente, no contrastado).',
    ...meta({ dimensionsM: Q(UNK, null, 'Diámetro no contrastado.'), dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('juno-mwr', 'Radiómetro de microondas de Juno (MWR)', 'instrument', 'juno', 40, [1.4, 0.4, 1.0], {
    shape: 'panel-antenna', interface: 'payload-deck', idlePowerW: 30,
    description: 'Antenas de parche en las caras del bus para sondear la atmósfera profunda.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('juno-cam', 'JunoCam', 'camera', 'juno', 2, [0.2, 0.25, 0.2], {
    shape: 'camera', interface: 'payload-deck', idlePowerW: 6,
    description: 'Cámara de luz visible para divulgación.',
    ...meta({ dryMassKg: Q(EST), idlePowerW: Q(EST) }, []) }),
  piece('juno-mag', 'Pértiga de magnetómetros de Juno', 'boom', 'juno', 20, [0.4, 4, 0.4], {
    shape: 'boom', interface: 'boom-canister', idlePowerW: 12,
    description: 'En Juno, los magnetómetros van al extremo de un ala; aquí se modela como pértiga propia en el bus.',
    ...meta({ dryMassKg: Q(EST), dimensionsM: Q(EST), idlePowerW: Q(EST) }, ['nssdca-juno']) }),
  piece('juno-battery', 'Baterías de ion-litio de Juno', 'battery', 'juno', 30, [0.6, 0.4, 0.5], {
    shape: 'box', mount: 'internal', interface: 'bus-bay', batteryWh: 2 * 55 * 28,
    description: 'Dos baterías (2 × 55 Ah citados habitualmente; 28 V supuestos).',
    ...meta({ batteryWh: Q(EST, null, 'Capacidad no contrastada × 28 V supuestos.'), dryMassKg: Q(EST) }, []) })
];
const junoAttached = JUNO_PARTS.reduce((n, p) => n + p.dryMassKg, 0) + 2 * JUNO_WING.dryMassKg; // tres alas
const JUNO_BUS = piece('bus-juno', 'Bus hexagonal de Juno', 'structure', 'juno', Math.round((JUNO_DRY_KG - junoAttached) * 10) / 10, [3.5, 1.9, 3.5], {
  shape: 'hexagon', mount: 'internal', idlePowerW: 80, maxAttachedMassKg: Math.round((junoAttached + JUNO_PROPELLANT_KG) * 1.15),
  description: 'Cilindro hexagonal de 3,5 m de diámetro (3,5 m de alto con la antena). Masa por cierre con la masa seca derivada (1593 kg).',
  slots: Object.freeze([
    slot('hga', 'Antena superior', ['antenna'], 'hga-mount', [0, 1.0, 0], [0, 1, 0], 3),
    slot('wing-1', 'Ala 1', ['solar', 'rtg'], 'wing-hinge', [1.75, 0.2, 0], [1, 0, 0], 12),
    slot('wing-2', 'Ala 2', ['solar', 'rtg'], 'wing-hinge', [-0.875, 0.2, 1.516], [-0.5, 0, 0.866], 12),
    slot('wing-3', 'Ala 3', ['solar', 'rtg'], 'wing-hinge', [-0.875, 0.2, -1.516], [-0.5, 0, -0.866], 12),
    slot('main-engine', 'Motor principal', ['engine'], 'fixed-engine-mount', [0, -1.0, 0], [0, -1, 0], 1.5),
    slot('tank', 'Anillo de depósitos', ['tank'], 'tank-ring', [0, -0.1, 0], [0, 1, 0], 3.2),
    slot('rcs', 'Propulsores de actitud', ['rcs'], 'rcs-mount', [1.2, -0.95, 0.6], [0, -1, 0], 1),
    slot('vault', 'Cubierta de la bóveda', ['avionics'], 'vault-deck', [0.75, 0.95, 0.45], [0, 1, 0], 1.2),
    slot('side-1', 'Cara científica 1', [...PAYLOAD], 'payload-deck', [0.875, 0, 1.516], [0.5, 0, 0.866], 1.6),
    slot('side-2', 'Cara científica 2', [...PAYLOAD], 'payload-deck', [0.875, 0, -1.516], [0.5, 0, -0.866], 1.6),
    slot('mag', 'Pértiga de magnetómetros', ['boom'], 'boom-canister', [-1.75, 0.2, 0], [-1, 0, 0], 12),
    slot('bay-1', 'Compartimento 1', [...BAY], 'bus-bay', [-0.6, 0.3, -0.5], [0, 1, 0], 1),
    slot('bay-2', 'Compartimento 2', [...BAY], 'bus-bay', [-0.6, 0.3, 0.5], [0, 1, 0], 1)
  ]),
  ...meta({ dimensionsM: Q(DOC, 'jpl-juno-facts', '3,5 m de diámetro; altura del prisma estimada.'), dryMassKg: Q(DER, 'jpl-juno-facts', 'Cierre: (3625 − 2032) kg − piezas estimadas.'),
    maxAttachedMassKg: Q(EST, null, 'Configuración histórica + 15 %.'), idlePowerW: Q(EST) }, ['jpl-juno-facts', 'nssdca-juno'])
});

export const HERITAGE_COMPONENTS = Object.freeze([
  VOYAGER_BUS, ...VOYAGER_PARTS, CASSINI_BUS, ...CASSINI_PARTS, DAWN_BUS, ...DAWN_PARTS, JUNO_BUS, ...JUNO_PARTS
]);

// Ensamblo las configuraciones históricas de referencia en formato [punto de montaje, pieza, propelente cargado en kg].
const fact = (label, value, quality, source = null) => Object.freeze({ label, value, quality, source });
export const HISTORICAL_PROBES = Object.freeze([
  Object.freeze({
    id: 'voyager', name: 'Voyager 1 y 2', coreId: 'bus-voyager', launch: '1977', role: 'Sobrevuelos de planetas gigantes y espacio interestelar',
    parts: Object.freeze([['hga', 'voy-hga'], ['power', 'voy-rtg'], ['science', 'voy-scan'], ['fields', 'voy-fields'], ['mag', 'voy-mag'], ['propulsion', 'voy-tcm'],
      ['tank', 'voy-tank', 100], ['rcs', 'voy-rcs'], ['bay-1', 'voy-computers'], ['bay-2', 'voy-dtr']]),
    facts: Object.freeze([
      fact('Bus', 'Decagonal, 47 cm × 1,78 m', DOC, 'nssdca-voyager1'), fact('Antena de alta ganancia', '3,66 m', DOC, 'nssdca-voyager1'),
      fact('Potencia', '≈ 470 W (30 V CC) en 1977; ≈ 335 W en 1997', DOC, 'nssdca-voyager1'), fact('Pértiga del magnetómetro', '13 m', DOC, 'nssdca-voyager1'),
      fact('Masa de lanzamiento (módulo de misión)', '825,5 kg', SEC, 'wiki-voyager2'), fact('Hidracina', '≈ 100 kg', SEC, 'wiki-voyager2'),
      fact('Propulsores', '16 MR-103 (4 para correcciones de trayectoria)', SEC, 'wiki-voyager2')
    ]),
    notes: 'Voyager 1 y 2 son idénticas en esta representación. El módulo de propulsión sólido de la inyección no forma parte del Hangar.'
  }),
  Object.freeze({
    id: 'cassini', name: 'Cassini', coreId: 'bus-cassini', launch: '1997', role: 'Orbitador de Saturno con la sonda Huygens',
    parts: Object.freeze([['hga', 'cas-hga'], ['main-engine', 'cas-main-engine'], ['tank', 'cas-tanks', 3000], ['rtg-1', 'cas-rtg'], ['rtg-2', 'cas-rtg'], ['rtg-3', 'cas-rtg'],
      ['rcs', 'cas-rcs'], ['pallet-1', 'cas-rsp'], ['pallet-2', 'cas-fpp'], ['probe', 'cas-huygens'], ['mag', 'cas-mag'], ['bay-1', 'cas-avionics'], ['bay-2', 'cas-ssr']]),
    facts: Object.freeze([
      fact('Masa de lanzamiento', '5712 kg (orbitador, Huygens, adaptador y propelente)', DOC, 'esa-cassini-eng'), fact('Masa seca del orbitador', '2125 kg', DOC, 'esa-cassini-eng'),
      fact('Propelente', '3132 kg', DOC, 'jpl-cassini-charm'), fact('Motores principales', '2 × 445 N (NTO/MMH), uno de reserva', DOC, 'esa-cassini-eng'),
      fact('Isp del motor principal', '≈ 311 s (familia R-4D-11)', SEC, 'l3harris-r4d'), fact('Control de actitud', '16 × 0,5 N, hidracina', DOC, 'esa-cassini-eng'),
      fact('Potencia (3 RTG)', '885 W al inicio; 633 W al final de la misión nominal', DOC, 'esa-cassini-eng'), fact('Antena de alta ganancia', '4 m', DOC, 'esa-cassini-eng'),
      fact('Dimensiones', '6,7 m de alto × 4 m de ancho', DOC, 'esa-cassini-eng'), fact('Inserción en Saturno', '626 m/s en 96 min (1 jul 2004)', DOC, 'nasa-cassini-soi')
    ]),
    notes: 'El reparto 3000 kg bipropelente + 132 kg de hidracina es una estimación del total documentado. La masa del adaptador de lanzamiento (no viaja) explica la diferencia con 5712 kg.'
  }),
  Object.freeze({
    id: 'dawn', name: 'Dawn', coreId: 'bus-dawn', launch: '2007', role: 'Orbitador de Vesta y Ceres con propulsión iónica',
    parts: Object.freeze([['wing-left', 'dawn-wing'], ['wing-right', 'dawn-wing'], ['ep', 'dawn-ion'], ['tank', 'dawn-xenon', 425], ['rcs', 'dawn-rcs'], ['hga', 'dawn-hga'],
      ['deck-1', 'dawn-fc'], ['deck-2', 'dawn-vir'], ['deck-3', 'dawn-grand'], ['bay-1', 'dawn-battery'], ['bay-2', 'dawn-avionics']]),
    facts: Object.freeze([
      fact('Bus', '1,64 × 1,27 × 1,77 m', DOC, 'nssdca-dawn'), fact('Masa seca', '747,1 kg', DOC, 'nssdca-dawn'), fact('Masa de lanzamiento', '1217,7 kg', DOC, 'nssdca-dawn'),
      fact('Xenón', '425 kg', DOC, 'nssdca-dawn'), fact('Hidracina', '45,6 kg (12 × 0,9 N)', DOC, 'nssdca-dawn'),
      fact('Propulsión iónica', '3 propulsores de 30 cm; 92 mN a 2,6 kW; Isp 1900–3200 s', DOC, 'nssdca-dawn'),
      fact('Paneles solares', '2 × 2,3 × 8,3 m; 10,3 kW a 1 AU; 1,3 kW a 3 AU (fin de vida)', DOC, 'nssdca-dawn'), fact('Batería', 'NiH₂ de 35 Ah', DOC, 'nssdca-dawn'),
      fact('Antena de alta ganancia', '1,52 m', DOC, 'nssdca-dawn')
    ]),
    notes: 'El crucero de bajo empuje heliocéntrico de Dawn no se reproduce: el simulador evalúa la propulsión eléctrica en maniobras con la potencia disponible, sin optimizar trayectorias de empuje continuo.'
  }),
  Object.freeze({
    id: 'juno', name: 'Juno', coreId: 'bus-juno', launch: '2011', role: 'Orbitador polar de Júpiter con energía solar',
    parts: Object.freeze([['wing-1', 'juno-wing'], ['wing-2', 'juno-wing'], ['wing-3', 'juno-wing'], ['main-engine', 'juno-leros'], ['tank', 'juno-tanks', JUNO_PROPELLANT_KG],
      ['rcs', 'juno-rcs'], ['vault', 'juno-vault'], ['hga', 'juno-hga'], ['side-1', 'juno-mwr'], ['side-2', 'juno-cam'], ['mag', 'juno-mag'], ['bay-1', 'juno-battery']]),
    facts: Object.freeze([
      fact('Masa de lanzamiento', '3625 kg', DOC, 'jpl-juno-facts'), fact('Propelente', '1280 kg de hidracina + 752 kg de oxidante', DOC, 'jpl-juno-facts'),
      fact('Masa seca', '1593 kg (lanzamiento − propelente)', DER, 'jpl-juno-facts'), fact('Bus', 'Hexagonal, 3,5 m × 3,5 m', DOC, 'jpl-juno-facts'),
      fact('Paneles solares', '3 alas de 9 × 2,65 m; ≈ 14 kW en la Tierra y ≈ 400 W en Júpiter', DOC, 'jpl-juno-facts'),
      fact('Motor principal', 'Leros-1b, 645 N', DOC, 'nasa-juno-joi'), fact('Isp', '≈ 318 s', SEC, 'wiki-leros'),
      fact('Inserción en Júpiter', '35 min; −542 m/s (5 jul 2016 UTC)', DOC, 'nasa-juno-joi'), fact('Bóveda de radiación', '0,8 × 0,8 × 0,6 m; 150 kg', DOC, 'nssdca-juno')
    ]),
    notes: 'La disposición real coloca los magnetómetros en el extremo de un ala; aquí ocupan una pértiga propia.'
  })
]);

export const getHistoricalProbe = id => HISTORICAL_PROBES.find(p => p.id === id) ?? null;
