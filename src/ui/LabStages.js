// En este módulo defino la estructura de navegación del laboratorio en tres etapas y sus pestañas.
// Lo mantengo libre de DOM y estilos para que el laboratorio, la misión guiada y el menú compartan exactamente la misma fuente de verdad.
import { MC_PANES } from './MissionControlCenter.js';

// Organizo cada etapa y cada pestaña como objetos inmutables; cambiar entre ellas solo alterna la vista y conserva el estado de cada herramienta.
const tab = (id, title, desc, chain = null) => Object.freeze({ id, title, desc, chain });
export const LAB_STAGES = Object.freeze([
  Object.freeze({ id: 'probe', number: 1, title: 'Elegir sonda', tabs: Object.freeze([
    tab('overview', 'Vista general', 'Elige una de las cuatro sondas reales y conócela: modelo 3D oficial de NASA, misión histórica y características principales.'),
    tab('architecture', 'Arquitectura y componentes', 'Subsistemas de la sonda agrupados por función, con sus cifras, la calidad de cada dato y su fuente.'),
    tab('docs', 'Planos y documentación', 'Diagramas rotulados y fotografías oficiales de NASA/JPL con su procedencia, y las fuentes técnicas de la ficha.'),
    tab('engineering', 'Ingeniería', 'Primero, el resumen de capacidades (masa, propelente, Δv, energía); debajo, el detalle técnico con la calidad de cada dato.')]) }),
  Object.freeze({ id: 'plan', number: 2, title: 'Planificar', tabs: Object.freeze([
    tab('integrated', 'Misión completa', 'El planificador principal: eliges destino, fechas y tipo de misión, y un solo cálculo une el viaje desde la Tierra, la llegada, la captura y un satélite.', 'Fases conectadas en un solo cálculo'),
    tab('interplanetary', 'Ventanas interplanetarias', 'Busca las mejores fechas de salida hacia un planeta con posiciones de NASA/JPL (mapa de oportunidades y Lambert).', 'Herramienta independiente'),
    tab('lunar', 'Tierra–Luna y empuje finito', 'Transferencia a la Luna desde una órbita terrestre, con impulso ideal o con empuje finito y masa variable.', 'Herramienta independiente'),
    tab('launch', 'Lanzamiento terrestre', 'Despegue hasta una órbita baja con un lanzador ilustrativo de dos etapas; la sonda activa es la carga útil.', 'Herramienta independiente: no se encadena con «Misión completa»')]) }),
  Object.freeze({ id: 'play', number: 3, title: 'Reproducir', tabs: Object.freeze([
    tab('playback', MC_PANES.playback, 'Centro de Misión: reproduce en 3D la misión enviada desde Planificar, con la misma sonda y los mismos estados calculados.'),
    tab('cameras', MC_PANES.cameras, 'Cámaras para mirar la misma trayectoria (las disponibles dependen de la escena); cambiar de cámara no altera ningún estado.'),
    tab('telemetry', MC_PANES.telemetry, 'Estado propagado, distancias y energía en el instante que se está reproduciendo.'),
    tab('trajectory', MC_PANES.trajectory, 'Tramos, encendidos y recursos de la trayectoria calculada.'),
    tab('events', MC_PANES.events, 'Fases y eventos calculados: pulsa uno para saltar a su instante.'),
    tab('results', MC_PANES.results, 'Resultado según el modelo, restricciones y simplificaciones de la misión en reproducción.')]) })
]);
// Devuelvo los metadatos de la pestaña pedida dentro de su etapa, o null si la combinación no existe.
export const labTab = (stageId, tabId) => LAB_STAGES.find(stage => stage.id === stageId)?.tabs.find(item => item.id === tabId) ?? null;
