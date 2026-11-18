// Equipos ficticios de entrenamiento. Las cifras son parámetros de diseño
// ilustrativos en SI, no especificaciones de hardware NASA.
export const COMPONENT_CATEGORIES = Object.freeze([
  ['structure', 'Estructura'], ['engine', 'Propulsión'], ['tank', 'Combustible'],
  ['solar', 'Paneles solares'], ['battery', 'Baterías'], ['antenna', 'Comunicaciones'],
  ['camera', 'Cámaras'], ['sensor', 'Sensores'], ['instrument', 'Ciencia'],
  ['storage', 'Almacenamiento'], ['landing', 'Aterrizaje'], ['tool', 'Exploración']
]);

const slots = (scale = 1) => [
  ['engine', 'Propulsor axial', 'engine', [0, -1.38, 0]],
  ['tank', 'Depósito', 'tank', [0, -0.42, -1.37]],
  ['solar-left', 'Ala solar babor', 'solar', [-1.86, 0.18, 0]],
  ['solar-right', 'Ala solar estribor', 'solar', [1.86, 0.18, 0]],
  ['battery', 'Batería lateral', 'battery', [1.25, 0.57, 0.2]],
  ['antenna', 'Comunicaciones frontal', 'antenna', [0, 0.5, 1.18]],
  ['camera', 'Óptica posterior', 'camera', [0, 0.35, -1.19]],
  ['sensor', 'Sensor superior', 'sensor', [-0.48, 1.12, 0.15]],
  ['instrument', 'Instrumento superior', 'instrument', [0.48, 1.12, 0.15]],
  ['storage', 'Datos lateral', 'storage', [1.25, -0.48, 0.15]],
  ['landing', 'Tren de aterrizaje', 'landing', [0, -1.2, 0]],
  ['tool', 'Herramienta lateral', 'tool', [-1.22, -0.42, -0.25]]
].map(([id, name, category, position]) => Object.freeze({ id, name, category, position: position.map(v => v * scale) }));

const part = (id, name, category, dryMassKg, dimensionsM, extra = {}) => Object.freeze({
  id, name, category, dryMassKg, dimensionsM,
  idlePowerW: 0, activePowerW: 0, generationW: 0, batteryWh: 0,
  fuelCapacityKg: 0, thrustN: 0, ispS: 0,
  description: '', provenance: 'Diseño ficticio ilustrativo', ...extra
});

export const COMPONENTS = Object.freeze([
  part('bus-interplanetary', 'Bus interplanetario', 'structure', 165, [1.9, 1.8, 1.9], { maxAttachedMassKg: 1100, slots: slots(), description: 'Estructura octogonal para crucero y cargas modulares.' }),
  part('bus-orbiter', 'Bus orbital compacto', 'structure', 96, [1.65, 1.5, 1.65], { maxAttachedMassKg: 620, slots: slots(0.9), description: 'Estructura ligera para orbitador científico.' }),
  part('bus-lander', 'Plataforma de descenso', 'structure', 205, [2.0, 1.55, 2.0], { maxAttachedMassKg: 900, slots: slots(1.05), description: 'Base de aterrizaje conceptual; sin dinámica de descenso.' }),
  part('engine-chemical', 'Motor químico de maniobra', 'engine', 38, [0.7, 0.9, 0.7], { thrustN: 650, ispS: 310, propellant: 'chemical', activePowerW: 80, description: 'Motor ilustrativo de propelente químico.' }),
  part('engine-ion', 'Motor eléctrico iónico', 'engine', 29, [0.55, 0.75, 0.55], { thrustN: 0.04, ispS: 2500, propellant: 'xenon', activePowerW: 900, description: 'Propulsión eléctrica conceptual; requiere potencia durante operación.' }),
  part('tank-chemical', 'Tanque químico', 'tank', 26, [0.95, 1.0, 0.95], { fuelCapacityKg: 190, propellant: 'chemical', description: 'Capacidad y masa de combustible configurables.' }),
  part('tank-xenon', 'Tanque de xenón', 'tank', 20, [0.75, 0.9, 0.75], { fuelCapacityKg: 58, propellant: 'xenon', description: 'Depósito ilustrativo para motor iónico.' }),
  part('solar-wing', 'Ala fotovoltaica', 'solar', 17, [1.75, 0.1, 0.9], { generationW: 730, description: 'Potencia nominal ilustrativa a 1 AU e iluminación directa.' }),
  part('battery-pack', 'Batería de servicio', 'battery', 31, [0.58, 0.42, 0.4], { batteryWh: 2300, description: 'Capacidad energética nominal; no modela degradación ni eficiencia.' }),
  part('antenna-high-gain', 'Antena de alta ganancia', 'antenna', 18, [0.85, 0.85, 0.55], { idlePowerW: 22, description: 'Plato orientable conceptual.' }),
  part('camera-multispectral', 'Cámara multiespectral', 'camera', 12, [0.5, 0.4, 0.5], { idlePowerW: 16, description: 'Carga óptica ilustrativa.' }),
  part('sensor-navigation', 'Sensor de navegación', 'sensor', 9, [0.35, 0.36, 0.35], { idlePowerW: 11, description: 'Sensor estelar conceptual.' }),
  part('instrument-spectrometer', 'Espectrómetro', 'instrument', 24, [0.5, 0.55, 0.5], { idlePowerW: 36, description: 'Instrumento científico ilustrativo.' }),
  part('storage-module', 'Módulo de datos', 'storage', 14, [0.55, 0.43, 0.42], { idlePowerW: 13, description: 'Almacenamiento electrónico conceptual.' }),
  part('landing-legs', 'Tren de cuatro patas', 'landing', 62, [2.8, 0.9, 2.8], { description: 'Patas visuales; resistencia de impacto pendiente de modelar.' }),
  part('sampling-arm', 'Brazo de recolección', 'tool', 37, [0.75, 0.4, 0.65], { idlePowerW: 8, activePowerW: 95, description: 'Herramienta visual de muestreo, sin simulación de minería.' })
]);

export const COMPONENT_BY_ID = Object.freeze(Object.fromEntries(COMPONENTS.map(item => [item.id, item])));
export const getComponent = id => typeof id === 'string' && Object.hasOwn(COMPONENT_BY_ID, id) ? COMPONENT_BY_ID[id] : null;
