import { HORIZONS_FRAME, requireVector3 } from './Frames.js';
import { GM_UNIT } from './GravitationalParameters.js';
import { DYNAMICAL_MODELS } from './GravitationalDynamics.js';
import { INTEGRATOR_METHODS } from './NumericalIntegrator.js';
import { createScientificState } from './ScientificState.js';
import { createSimulationInstant } from './SimulationTime.js';
import { requireJdTdb } from './Time.js';
import { requireFiniteNumber } from './Units.js';

const PROBE_CLASSIFICATIONS = new Set([
  'fictional_experimental',
  'custom_mission',
  'synthetic_test',
  'historical_reconstruction'
]);

const MASS_TREATMENTS = new Set(['test_particle']);
const ALLOWED_MODEL_KINDS = new Set(Object.values(DYNAMICAL_MODELS));
const ALLOWED_INTEGRATORS = new Set(Object.values(INTEGRATOR_METHODS));

const FORBIDDEN_VISUAL_KEYS = new Set([
  'mesh',
  'material',
  'geometry',
  'color',
  'sceneScale',
  'posicionEscena',
  'threeObject'
]);

function requirePlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} debe ser un objeto.`);
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_VISUAL_KEYS.has(key)) {
      throw new RangeError(`${name} no debe mezclar propiedades de representación gráfica (${key}).`);
    }
  }
  return value;
}

function requireNonEmptyText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} debe ser una cadena no vacía.`);
  }
  return value.trim();
}

/**
 * Define la identidad física y descriptiva de una sonda espacial, estrictamente
 * separada de su estado instantáneo y de su representación gráfica en Three.js.
 *
 * Incluye una ranura contractual (`maneuverPlan`) preparada para futuras maniobras
 * impulsivas o de empuje continuo, sin activar todavía un sistema de propulsión.
 */
export function createProbeDefinition(input) {
  requirePlainObject(input, 'probe');
  const id = requireNonEmptyText(input.id, 'probe.id');
  const name = requireNonEmptyText(input.name, 'probe.name');
  const classification = requireNonEmptyText(input.classification, 'probe.classification');
  if (!PROBE_CLASSIFICATIONS.has(classification)) {
    throw new RangeError(`probe.classification desconocida: ${classification}.`);
  }

  let massKg = null;
  if (input.massKg !== null && input.massKg !== undefined) {
    requireFiniteNumber(input.massKg, 'probe.massKg');
    if (input.massKg <= 0) {
      throw new RangeError('probe.massKg debe ser estrictamente positiva cuando se especifica.');
    }
    massKg = input.massKg;
  }

  const massTreatment = input.massTreatment ?? 'test_particle';
  if (!MASS_TREATMENTS.has(massTreatment)) {
    throw new RangeError(`probe.massTreatment no soportado en esta etapa: ${massTreatment}.`);
  }

  const description = input.description === null || input.description === undefined
    ? null
    : requireNonEmptyText(input.description, 'probe.description');

  const plannedEvents = input.plannedManeuvers ?? [];
  if (!Array.isArray(plannedEvents)) {
    throw new TypeError('probe.plannedManeuvers debe ser una lista.');
  }
  if (plannedEvents.length > 0) {
    throw new RangeError(
      'La ejecución de maniobras propulsivas está reservada para etapas posteriores; plannedManeuvers debe permanecer vacía en Etapa 2A/2B.'
    );
  }

  return Object.freeze({
    id,
    name,
    classification,
    massKg,
    massTreatment,
    description,
    maneuverPlan: Object.freeze({
      contractVersion: 1,
      propulsionEnabled: false,
      events: Object.freeze([])
    })
  });
}

/**
 * Describe de manera verificable e inmutable el modelo dinámico e integrador
 * empleados para obtener un estado de sonda.
 */
export function createDynamicalModelDescriptor(input) {
  requirePlainObject(input, 'dynamicalModel');
  const id = requireNonEmptyText(input.id, 'dynamicalModel.id');
  const kind = requireNonEmptyText(input.kind, 'dynamicalModel.kind');
  if (!ALLOWED_MODEL_KINDS.has(kind)) {
    throw new RangeError(`dynamicalModel.kind desconocido: ${kind}.`);
  }
  const centralBodyId = requireNonEmptyText(input.centralBodyId, 'dynamicalModel.centralBodyId');
  if (!Array.isArray(input.perturbingBodyIds)) {
    throw new TypeError('dynamicalModel.perturbingBodyIds debe ser un arreglo.');
  }
  const perturbingBodyIds = input.perturbingBodyIds.map((bodyId, idx) =>
    requireNonEmptyText(bodyId, `dynamicalModel.perturbingBodyIds[${idx}]`)
  );
  if (new Set(perturbingBodyIds).size !== perturbingBodyIds.length || perturbingBodyIds.includes(centralBodyId)) {
    throw new RangeError('dynamicalModel.perturbingBodyIds contiene duplicados o incluye el cuerpo central.');
  }
  if (typeof input.includeIndirectTerms !== 'boolean') {
    throw new TypeError('dynamicalModel.includeIndirectTerms debe ser booleano.');
  }
  const frameId = requireNonEmptyText(input.frameId ?? HORIZONS_FRAME.id, 'dynamicalModel.frameId');
  const origin = requireNonEmptyText(input.origin ?? HORIZONS_FRAME.origin, 'dynamicalModel.origin');
  const integratorMethod = requireNonEmptyText(input.integratorMethod, 'dynamicalModel.integratorMethod');
  if (!ALLOWED_INTEGRATORS.has(integratorMethod)) {
    throw new RangeError(`dynamicalModel.integratorMethod desconocido: ${integratorMethod}.`);
  }

  return Object.freeze({
    id,
    kind,
    centralBodyId,
    perturbingBodyIds: Object.freeze([...perturbingBodyIds]),
    includeIndirectTerms: input.includeIndirectTerms,
    frameId,
    origin,
    integratorMethod,
    notes: input.notes ? requireNonEmptyText(input.notes, 'dynamicalModel.notes') : null
  });
}

/**
 * Registra la procedencia explícita de las condiciones iniciales de una sonda.
 */
export function createInitialConditionProvenance(input) {
  requirePlainObject(input, 'initialConditionProvenance');
  const kind = requireNonEmptyText(input.kind, 'initialConditionProvenance.kind');
  const source = requireNonEmptyText(input.source, 'initialConditionProvenance.source');
  requireJdTdb(input.epochJdTdb);
  const description = requireNonEmptyText(input.description, 'initialConditionProvenance.description');
  const referenceBodyId = input.referenceBodyId === null || input.referenceBodyId === undefined
    ? null
    : requireNonEmptyText(input.referenceBodyId, 'initialConditionProvenance.referenceBodyId');
  const isAuthenticHistorical = Boolean(input.isAuthenticHistorical ?? false);

  return Object.freeze({
    kind,
    source,
    epochJdTdb: input.epochJdTdb,
    referenceBodyId,
    isAuthenticHistorical,
    description
  });
}

function validateGravitationalParameterSnapshot(snapshot) {
  requirePlainObject(snapshot, 'gravitationalParameters');
  const catalogId = requireNonEmptyText(snapshot.catalogId, 'gravitationalParameters.catalogId');
  if (typeof snapshot.isSynthetic !== 'boolean') {
    throw new TypeError('gravitationalParameters.isSynthetic debe ser booleano.');
  }
  if (snapshot.unit !== GM_UNIT) {
    throw new RangeError(`gravitationalParameters.unit debe ser ${GM_UNIT}.`);
  }
  requirePlainObject(snapshot.valuesKm3PerS2, 'gravitationalParameters.valuesKm3PerS2');
  const entries = Object.entries(snapshot.valuesKm3PerS2);
  if (entries.length === 0) {
    throw new RangeError('gravitationalParameters.valuesKm3PerS2 no puede estar vacío.');
  }
  const cleanValues = {};
  for (const [bodyId, mu] of entries) {
    requireNonEmptyText(bodyId, 'gravitationalParameters.bodyId');
    requireFiniteNumber(mu, `gravitationalParameters.valuesKm3PerS2.${bodyId}`);
    if (mu <= 0) {
      throw new RangeError(`gravitationalParameters.valuesKm3PerS2.${bodyId} debe ser positivo.`);
    }
    cleanValues[bodyId] = mu;
  }
  return Object.freeze({
    catalogId,
    isSynthetic: snapshot.isSynthetic,
    unit: GM_UNIT,
    valuesKm3PerS2: Object.freeze(cleanValues)
  });
}

/**
 * Crea un estado dinámico inmutable de una sonda espacial.
 * Conserva posición en km, velocidad en km/s, tiempo interno en segundos desde
 * `epochJdTdb` junto con `jdTdb`, marco, origen, modelo dinámico, parámetros GM
 * utilizados y procedencia de condiciones iniciales.
 */
export function createProbeDynamicState(input) {
  requirePlainObject(input, 'probeState');
  const probe = createProbeDefinition(input.probe);

  requirePlainObject(input.time, 'probeState.time');
  if (input.time.scale !== undefined && input.time.scale !== 'TDB') {
    throw new RangeError(`probeState.time.scale incompatible: ${input.time.scale}.`);
  }
  const epochJdTdb = input.time.epochJdTdb ?? input.time.jdTdb;
  const elapsedSeconds = input.time.elapsedSeconds ?? 0;
  const timeInstant = createSimulationInstant(epochJdTdb, elapsedSeconds);
  if (input.time.jdTdb !== undefined) {
    requireJdTdb(input.time.jdTdb);
    if (Math.abs(input.time.jdTdb - timeInstant.jdTdb) > 1e-9) {
      throw new RangeError('probeState.time.jdTdb no coincide con epochJdTdb + elapsedSeconds.');
    }
  }

  requirePlainObject(input.position, 'probeState.position');
  requirePlainObject(input.velocity, 'probeState.velocity');
  requireVector3(input.position, 'probeState.position');
  requireVector3(input.velocity, 'probeState.velocity');
  if (input.position.unit !== 'km') {
    throw new RangeError(`probeState.position.unit debe ser 'km'; recibido ${input.position.unit}.`);
  }
  if (input.velocity.unit !== 'km/s') {
    throw new RangeError(`probeState.velocity.unit debe ser 'km/s'; recibido ${input.velocity.unit}.`);
  }

  const origin = input.origin ?? HORIZONS_FRAME.origin;
  const reference = input.reference ?? HORIZONS_FRAME;
  requirePlainObject(reference, 'probeState.reference');
  if (origin !== HORIZONS_FRAME.origin || reference.origin !== HORIZONS_FRAME.origin
    || reference.id !== HORIZONS_FRAME.id
    || reference.referenceSystem !== HORIZONS_FRAME.referenceSystem
    || reference.referencePlane !== HORIZONS_FRAME.referencePlane) {
    throw new RangeError('probeState.reference u origin incompatibles con el marco científico admitido.');
  }

  const dynamicalModel = createDynamicalModelDescriptor(input.dynamicalModel);
  if (dynamicalModel.origin !== origin || dynamicalModel.frameId !== reference.id) {
    throw new RangeError('dynamicalModel.origin/frameId debe coincidir con el estado de la sonda.');
  }

  const gravitationalParameters = validateGravitationalParameterSnapshot(input.gravitationalParameters);
  if (!Object.hasOwn(gravitationalParameters.valuesKm3PerS2, dynamicalModel.centralBodyId)) {
    throw new RangeError(`Falta GM del cuerpo central ${dynamicalModel.centralBodyId} en gravitationalParameters.`);
  }
  for (const bodyId of dynamicalModel.perturbingBodyIds) {
    if (!Object.hasOwn(gravitationalParameters.valuesKm3PerS2, bodyId)) {
      throw new RangeError(`Falta GM del cuerpo perturbador ${bodyId} en gravitationalParameters.`);
    }
  }

  const initialConditionProvenance = createInitialConditionProvenance(input.initialConditionProvenance);
  const segmentIndex = input.segmentIndex ?? 0;
  if (!Number.isSafeInteger(segmentIndex) || segmentIndex < 0) {
    throw new RangeError('probeState.segmentIndex debe ser un entero no negativo.');
  }

  return Object.freeze({
    probe,
    time: timeInstant,
    position: Object.freeze({
      x: input.position.x,
      y: input.position.y,
      z: input.position.z,
      unit: 'km'
    }),
    velocity: Object.freeze({
      x: input.velocity.x,
      y: input.velocity.y,
      z: input.velocity.z,
      unit: 'km/s'
    }),
    origin,
    reference: HORIZONS_FRAME,
    dynamicalModel,
    gravitationalParameters,
    initialConditionProvenance,
    segmentIndex
  });
}

/**
 * Adapta un `ProbeDynamicState` al contrato canónico `ScientificState`
 * (`identity.type === 'probe'`) sin mutar el estado original.
 */
export function probeStateToScientificState(probeDynamicState) {
  const validated = createProbeDynamicState(probeDynamicState);
  return createScientificState({
    identity: {
      id: validated.probe.id,
      type: 'probe',
      origin: validated.origin
    },
    time: {
      jdTdb: validated.time.jdTdb,
      scale: 'TDB'
    },
    position: validated.position,
    velocity: validated.velocity,
    reference: validated.reference,
    provenance: {
      source: `Propagación numérica (${validated.dynamicalModel.id})`,
      sourceUrl: null,
      version: '2A-2B.1',
      queriedAtUtc: null,
      precision: null,
      uncertainty: null,
      sourceMetadata: {
        probeName: validated.probe.name,
        probeClassification: validated.probe.classification,
        epochJdTdb: validated.time.epochJdTdb,
        elapsedSeconds: validated.time.elapsedSeconds,
        dynamicalModelKind: validated.dynamicalModel.kind,
        integratorMethod: validated.dynamicalModel.integratorMethod,
        includeIndirectTerms: validated.dynamicalModel.includeIndirectTerms,
        gravitationalCatalogId: validated.gravitationalParameters.catalogId,
        isSyntheticCatalog: validated.gravitationalParameters.isSynthetic,
        initialConditionSource: validated.initialConditionProvenance.source,
        segmentIndex: validated.segmentIndex
      }
    }
  });
}
