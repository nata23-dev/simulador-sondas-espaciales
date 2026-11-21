// Etapa 17 — documentación visual de la flota: diagramas y fotografías oficiales de NASA/JPL servidos desde public/images/fleet
// (copias reducidas a tamaño web; procedencia, fecha de descarga y SHA-256 de cada original en public/images/fleet/README.md).
// Solo presentación: ningún cálculo usa estas imágenes. Se distingue lo que es un diagrama rotulado, una fotografía real
// y la reconstrucción técnica del simulador; no se incluyen planos de fabricación.
import { HISTORICAL_PROBES, HERITAGE_SOURCES } from './HeritageCatalog.js';

export const DOCUMENT_KINDS = Object.freeze({
  diagram: 'Diagrama oficial rotulado',
  photo: 'Fotografía oficial',
  reconstruction: 'Reconstrucción técnica del simulador'
});

const doc = (probeId, file, kind, title, caption, credit, date, sourceUrl) => Object.freeze({
  probeId, kind, title, caption, credit, date, sourceUrl,
  file: `images/fleet/${file}.jpg`, thumb: `images/fleet/${file}-thumb.jpg`
});

export const FLEET_DOCUMENTS = Object.freeze([
  doc('voyager', 'voyager-instruments', 'diagram', 'Instrumentos de Voyager 2 (PIA22915)',
    'Ilustración rotulada con los instrumentos que seguían operando en 2018: magnetómetro, rayos cósmicos, plasma, partículas cargadas de baja energía y antenas de ondas de plasma.',
    'NASA/JPL-Caltech', '10 dic 2018', 'https://www.jpl.nasa.gov/images/pia22915-voyager-2-spacecraft-instruments/'),
  doc('voyager', 'voyager-testing', 'photo', 'Voyager en el simulador espacial de JPL (PIA21737)',
    'Una de las dos Voyager en la cámara de simulación espacial de 25 pies de JPL, en Pasadena, antes del lanzamiento.',
    'NASA/JPL-Caltech', 'Fotografía del 27 abr 1977', 'https://www.jpl.nasa.gov/images/pia21737-voyager-testing/'),
  doc('cassini', 'cassini-diagram', 'diagram', 'Diagrama de la nave Cassini',
    'Antena de alta ganancia de 4 m, pértiga del magnetómetro de 11 m, sonda Huygens, palés de instrumentos, RTG y motores de 445 N.',
    'NASA/JPL (proyecto conjunto de NASA, ESA y ASI)', '30 oct 1996', 'https://science.nasa.gov/resource/diagram-of-the-cassini-spacecraft/'),
  doc('cassini', 'cassini-assembly', 'photo', 'Cassini en una sala de ensamblaje de JPL (PIA04603)',
    'La nave ya montada y cubierta con mantas térmicas, en 1997, antes de su viaje a Saturno.',
    'NASA/JPL', 'Fotografía de 1997', 'https://www.jpl.nasa.gov/images/pia04603-cassini-spacecraft-in-a-jpl-assembly-room/'),
  doc('dawn', 'dawn-diagram', 'diagram', 'Diagrama de la nave Dawn (n.º 1)',
    'Paneles solares (parcialmente dibujados), propulsor iónico (1 de 3), antenas, buscadores de estrellas, cámaras de encuadre, VIR y GRaND.',
    'NASA/JPL-Caltech', '12 dic 2018', 'https://science.nasa.gov/resource/dawn-spacecraft-diagram-no-1'),
  doc('dawn', 'dawn-fairing', 'photo', 'Dawn con los paneles plegados (PIA12018)',
    'Las alas solares plegadas para caber en la cofia del lanzador; se ve la antena de alta ganancia cubierta.',
    'NASA/JPL', 'Publicada el 29 may 2009', 'https://photojournal.jpl.nasa.gov/catalog/PIA12018'),
  doc('juno', 'juno-instruments', 'diagram', 'Infografía de la nave Juno',
    'Ubicación de JunoCam, UVS, JIRAM, Waves, JADE, JEDI, MWR, ciencia de gravedad y magnetómetro; diámetro de 20 m y altura de 4,5 m.',
    'NASA/JPL (kit de prensa de Juno)', 'Sin fecha en la fuente', 'https://www.jpl.nasa.gov/news/press_kits/juno/spacecraft/'),
  doc('juno', 'juno-tanks', 'photo', 'Depósitos de Juno durante el ensamblaje (PIA13923)',
    'La estructura de Juno sin cubiertas, con tres de sus depósitos esféricos de propelente a la vista.',
    'NASA/JPL-Caltech/Lockheed Martin', 'Fotografía del 29 jun 2010 (según el pie)', 'https://www.jpl.nasa.gov/images/pia13923-junos-fuel-tanks/')
]);

export const documentsFor = probeId => FLEET_DOCUMENTS.filter(item => item.probeId === probeId);

/** Fuentes técnicas citadas por la ficha de la sonda (las mismas que muestran la calidad de cada cifra). */
export function probeSources(probeId) {
  const probe = HISTORICAL_PROBES.find(item => item.id === probeId);
  if (!probe) return [];
  const ids = [...new Set(probe.facts.map(fact => fact.source).filter(Boolean))];
  return ids.map(id => ({ id, ...HERITAGE_SOURCES[id] })).filter(item => item.url);
}

// Grupos de la pestaña «Arquitectura y componentes»: reparten las categorías del catálogo de piezas.
export const ARCHITECTURE_GROUPS = Object.freeze([
  Object.freeze({ id: 'structure', label: 'Estructura', categories: Object.freeze(['structure', 'boom']) }),
  Object.freeze({ id: 'propulsion', label: 'Propulsión', categories: Object.freeze(['engine']) }),
  Object.freeze({ id: 'tanks', label: 'Depósitos', categories: Object.freeze(['tank']) }),
  Object.freeze({ id: 'antennas', label: 'Antenas', categories: Object.freeze(['antenna']) }),
  Object.freeze({ id: 'science', label: 'Instrumentos científicos', categories: Object.freeze(['camera', 'sensor', 'instrument', 'payload']) }),
  Object.freeze({ id: 'power', label: 'Energía', categories: Object.freeze(['solar', 'rtg', 'battery']) }),
  Object.freeze({ id: 'attitude', label: 'Control de actitud', categories: Object.freeze(['rcs']) }),
  Object.freeze({ id: 'electronics', label: 'Sistemas electrónicos', categories: Object.freeze(['avionics', 'storage']) })
]);
export const architectureGroupOf = category => ARCHITECTURE_GROUPS.find(group => group.categories.includes(category))?.id ?? 'electronics';
