import * as THREE from 'three';
import { crearCoheteTitanCentaur } from './TitanCentaurRocket.js';
import { crearPlataformaLanzamientoLC41 } from './LaunchPadLC41.js';
import {
  HISTORICAL_MISSIONS_CATALOG,
  VOYAGER_1_ID,
  VOYAGER_2_ID
} from '../science/VoyagerHistoricalMissions.js';

export const FASES_LANZAMIENTO = Object.freeze({
  APROXIMACION_TIERRA: 'aproximacion_tierra',
  PREPARACION_PLATAFORMA: 'preparacion_plataforma',
  DESPEGUE: 'despegue',
  ASCENSO_ATMOSFERICO: 'ascenso_atmosferico',
  SEPARACION_ETAPAS: 'separacion_etapas',
  INYECCION_VOYAGER: 'inyeccion_voyager',
  COMPLETADO: 'completado'
});

export const METADATOS_HISTORICOS_LANZAMIENTO = Object.freeze({
  [VOYAGER_2_ID]: {
    misionId: VOYAGER_2_ID,
    nombreMision: 'Voyager 2',
    fechaLanzamientoUtc: '20 de agosto de 1977 · 14:29:44 UTC',
    vehiculo: 'Titan IIIE-Centaur (TC-7 / Centaur D-1T)',
    lugar: 'Complejo de Lanzamiento 41 (LC-41), Cabo Cañaveral, Florida (28.5833° N, 80.5828° W)',
    objetivoPrimario: 'Gran Vuelta (Grand Tour) a Júpiter, Saturno, Urano y Neptuno',
    fuenteOficial: 'NASA / JPL Mission Overview & NSSDCA Master Catalog (1977-076A)'
  },
  [VOYAGER_1_ID]: {
    misionId: VOYAGER_1_ID,
    nombreMision: 'Voyager 1',
    fechaLanzamientoUtc: '5 de septiembre de 1977 · 12:56:01 UTC',
    vehiculo: 'Titan IIIE-Centaur (TC-6 / Centaur D-1T)',
    lugar: 'Complejo de Lanzamiento 41 (LC-41), Cabo Cañaveral, Florida (28.5833° N, 80.5828° W)',
    objetivoPrimario: 'Sobrevuelos de alta resolución de Júpiter, Saturno y satélite Titán',
    fuenteOficial: 'NASA / JPL Mission Overview & NSSDCA Master Catalog (1977-084A)'
  }
});

/**
 * Controlador de la secuencia cinematográfica de lanzamiento histórico.
 * Coordina la plataforma LC-41, el cohete Titan IIIE-Centaur procedural,
 * los efectos atmosféricos y las cámaras para una experiencia inmersiva.
 */
export function crearControladorLanzamientoCinematografico({
  scene,
  camera,
  controls,
  tierraMesh,
  alFinalizarLanzamiento,
  alCambiarFase
}) {
  const grupoLanzamiento = new THREE.Group();
  grupoLanzamiento.name = 'EscenaCinematografica_Lanzamiento';
  grupoLanzamiento.visible = false;
  scene.add(grupoLanzamiento);

  // Instancias procedurales
  const plataforma = crearPlataformaLanzamientoLC41({ escala: 1.0 });
  const cohete = crearCoheteTitanCentaur({ escala: 1.0 });
  cohete.grupo.position.y = plataforma.alturaMesa;

  grupoLanzamiento.add(plataforma.grupo);
  grupoLanzamiento.add(cohete.grupo);

  // Cúpula celeste atmosférica local para el despegue (degradado azul diurno a negro espacial)
  const geomCielo = new THREE.SphereGeometry(25, 32, 16);
  const matCielo = new THREE.MeshBasicMaterial({
    color: 0x487cb0,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.95
  });
  const cieloAtmosferico = new THREE.Mesh(geomCielo, matCielo);
  cieloAtmosferico.position.y = 8;
  grupoLanzamiento.add(cieloAtmosferico);

  // Luz solar para la escena del lanzamiento
  const luzSolLanzamiento = new THREE.DirectionalLight(0xfff8ee, 2.5);
  luzSolLanzamiento.position.set(12, 18, 10);
  grupoLanzamiento.add(luzSolLanzamiento);

  const luzAmbienteLanzamiento = new THREE.AmbientLight(0x7da4d4, 0.6);
  grupoLanzamiento.add(luzAmbienteLanzamiento);

  // Estado interno
  let activo = false;
  let enPausa = false;
  let tiempoTranscurrido = 0; // segundos de la cinemática
  const DURACION_TOTAL = 28.0; // 28 segundos para la secuencia completa
  let misionIdActiva = VOYAGER_2_ID;
  let faseActual = FASES_LANZAMIENTO.APROXIMACION_TIERRA;
  let visibilidadAnterior = null;

  // Variables de cámara auxiliares para interpolaciones fluidas
  const camPosScratch = new THREE.Vector3();
  const camTargetScratch = new THREE.Vector3();

  function iniciar(misionId = VOYAGER_2_ID) {
    misionIdActiva = misionId === VOYAGER_1_ID ? VOYAGER_1_ID : VOYAGER_2_ID;
    activo = true;
    enPausa = false;
    tiempoTranscurrido = 0;
    faseActual = FASES_LANZAMIENTO.APROXIMACION_TIERRA;

    if (!visibilidadAnterior) {
      visibilidadAnterior = new Map(scene.children
        .filter(objeto => objeto !== grupoLanzamiento)
        .map(objeto => [objeto, objeto.visible]));
    }
    for (const objeto of visibilidadAnterior.keys()) objeto.visible = false;
    grupoLanzamiento.visible = true;
    camera.clearViewOffset();
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    cohete.restablecerTodo();
    cohete.grupo.position.y = plataforma.alturaMesa;
    plataforma.retraerBrazosServicio(0);
    camera.position.set(9, 8, 16);
    camera.lookAt(0, 1.5, 0);

    // Deshabilita controles de ratón orbital durante la cinemática
    if (controls) controls.enabled = false;

    notificarFase();
  }

  function pausar() {
    enPausa = true;
  }

  function reanudar() {
    enPausa = false;
  }

  function saltar() {
    tiempoTranscurrido = DURACION_TOTAL;
    finalizar();
  }

  function reiniciar() {
    iniciar(misionIdActiva);
  }

  function notificarFase() {
    const meta = METADATOS_HISTORICOS_LANZAMIENTO[misionIdActiva];
    alCambiarFase?.({
      fase: faseActual,
      tiempo: tiempoTranscurrido,
      duracionTotal: DURACION_TOTAL,
      mision: meta,
      progresoNormalizado: Math.min(1, tiempoTranscurrido / DURACION_TOTAL)
    });
  }

  function actualizar(dt) {
    if (!activo || enPausa) return;

    tiempoTranscurrido += dt;
    const t = tiempoTranscurrido;

    // ----------------------------------------------------
    // FASE A: APROXIMACIÓN A LA TIERRA (0.0s – 5.0s)
    // Vista desde el espacio descendiendo hacia Florida / Cabo Cañaveral
    // ----------------------------------------------------
    if (t < 5.0) {
      if (faseActual !== FASES_LANZAMIENTO.APROXIMACION_TIERRA) {
        faseActual = FASES_LANZAMIENTO.APROXIMACION_TIERRA;
        notificarFase();
      }
      const u = t / 5.0;
      const suave = u * u * (3 - 2 * u);

      // Cámara desciende desde órbita alta hacia la plataforma LC-41
      camPosScratch.set(
        THREE.MathUtils.lerp(9, 5.5, suave),
        THREE.MathUtils.lerp(8, 2.8, suave),
        THREE.MathUtils.lerp(16, 8.5, suave)
      );
      camTargetScratch.set(0, THREE.MathUtils.lerp(0, 1.8, suave), 0);

      matCielo.opacity = THREE.MathUtils.lerp(0.1, 0.95, suave);
      matCielo.color.setHex(0x487cb0);

      cohete.encenderLlamas(false);
      plataforma.retraerBrazosServicio(0);
    }
    // ----------------------------------------------------
    // FASE B: PREPARACIÓN EN PLATAFORMA (5.0s – 9.0s)
    // Cohete vertical en LC-41, retracción de brazos umbilicales, cuenta regresiva T-5..0
    // ----------------------------------------------------
    else if (t < 9.0) {
      if (faseActual !== FASES_LANZAMIENTO.PREPARACION_PLATAFORMA) {
        faseActual = FASES_LANZAMIENTO.PREPARACION_PLATAFORMA;
        notificarFase();
      }
      const u = (t - 5.0) / 4.0;

      // Paneo dramático ascendente a lo largo del Titan IIIE
      camPosScratch.set(3.8, 1.2 + u * 2.2, 4.2 - u * 0.8);
      camTargetScratch.set(0, 1.8 + u * 1.5, 0);

      // Retracción suave de brazos de servicio
      plataforma.retraerBrazosServicio(u);
      cohete.encenderLlamas(u > 0.85, (u - 0.85) / 0.15); // ignición en T-1s
    }
    // ----------------------------------------------------
    // FASE C: DESPEGUE / LIFTOFF (9.0s – 14.0s)
    // Ignición de propulsores sólidos UA1205, elevación vertical, vibración sutil
    // ----------------------------------------------------
    else if (t < 14.0) {
      if (faseActual !== FASES_LANZAMIENTO.DESPEGUE) {
        faseActual = FASES_LANZAMIENTO.DESPEGUE;
        notificarFase();
      }
      const u = (t - 9.0) / 5.0;
      const elevacion = Math.pow(u, 2.1) * 14.0; // aceleración cuadrática realista

      cohete.grupo.position.y = plataforma.alturaMesa + elevacion;
      cohete.encenderLlamas(true, 1.0);

      // Cámara sigue el ascenso desde un ángulo lateral espectacular con leve vibración
      const vibracion = Math.sin(t * 45) * 0.015;
      camPosScratch.set(
        5.2 + vibracion,
        2.5 + elevacion * 0.72 + vibracion,
        6.5
      );
      camTargetScratch.set(0, elevacion + 2.0, 0);
    }
    // ----------------------------------------------------
    // FASE D: ASCENSO ATMOSFÉRICO (14.0s – 19.0s)
    // El cohete atraviesa la atmósfera; el cielo pasa a negro con estrellas
    // ----------------------------------------------------
    else if (t < 19.0) {
      if (faseActual !== FASES_LANZAMIENTO.ASCENSO_ATMOSFERICO) {
        faseActual = FASES_LANZAMIENTO.ASCENSO_ATMOSFERICO;
        notificarFase();
      }
      const u = (t - 14.0) / 5.0;
      const elevacion = 14.0 + u * 28.0;

      cohete.grupo.position.y = elevacion;
      cohete.encenderLlamas(true, 1.0);

      // La cúpula celeste pasa de azul a negro espacial
      const opacidadCielo = Math.max(0, 0.95 - u * 1.1);
      matCielo.opacity = opacidadCielo;

      // Cámara en seguimiento aéreo de persecución (chase camera)
      camPosScratch.set(2.5, elevacion - 3.2, 5.0);
      camTargetScratch.set(0, elevacion + 1.5, 0);
    }
    // ----------------------------------------------------
    // FASE E: SEPARACIÓN DE ETAPAS (19.0s – 24.0s)
    // 1. Separación de propulsores sólidos UA1205
    // 2. Separación de Etapa 1
    // 3. Apertura de cofia Centaur Standard Shroud
    // ----------------------------------------------------
    else if (t < 24.0) {
      if (faseActual !== FASES_LANZAMIENTO.SEPARACION_ETAPAS) {
        faseActual = FASES_LANZAMIENTO.SEPARACION_ETAPAS;
        notificarFase();
      }
      const u = (t - 19.0) / 5.0;
      const elevacion = 42.0 + u * 22.0;
      cohete.grupo.position.y = elevacion;

      // Secuencia de separación escalonada
      if (u < 0.35) {
        cohete.separarPropulsores(u / 0.35);
      } else if (u < 0.65) {
        cohete.separarPropulsores(1.0);
        cohete.separarEtapa1((u - 0.35) / 0.30);
      } else {
        cohete.separarPropulsores(1.0);
        cohete.separarEtapa1(1.0);
        cohete.separarCofia((u - 0.65) / 0.35);
      }

      camPosScratch.set(4.0, elevacion + 1.2, 5.5);
      camTargetScratch.set(0, elevacion + 2.5, 0);
    }
    // ----------------------------------------------------
    // FASE F: INYECCIÓN DE VOYAGER Y TRANSICIÓN HELIOCÉNTRICA (24.0s – 28.0s)
    // Centaur se separa, Voyager despliega RTG y antena HGA, transición al viaje
    // ----------------------------------------------------
    else if (t < DURACION_TOTAL) {
      if (faseActual !== FASES_LANZAMIENTO.INYECCION_VOYAGER) {
        faseActual = FASES_LANZAMIENTO.INYECCION_VOYAGER;
        notificarFase();
      }
      const u = (t - 24.0) / 4.0;
      const elevacion = 64.0 + u * 18.0;
      cohete.grupo.position.y = elevacion;

      cohete.separarEtapa2(u);
      cohete.desplegarSondaVoyager(u);

      // Cámara en primer plano observando la sonda Voyager lista para el espacio
      camPosScratch.set(1.1, elevacion + 4.2, 1.8);
      camTargetScratch.set(0, elevacion + 4.2, 0);
    } else {
      finalizar();
      return;
    }

    camera.position.copy(camPosScratch);
    camera.lookAt(camTargetScratch);
  }

  function finalizar() {
    activo = false;
    grupoLanzamiento.visible = false;
    if (visibilidadAnterior) {
      for (const [objeto, visible] of visibilidadAnterior) objeto.visible = visible;
      visibilidadAnterior = null;
    }
    cohete.restablecerTodo();
    faseActual = FASES_LANZAMIENTO.COMPLETADO;

    if (controls) controls.enabled = true;

    alFinalizarLanzamiento?.({
      misionId: misionIdActiva,
      transicionCompleta: true
    });
  }

  function destruir() {
    activo = false;
    if (visibilidadAnterior) {
      for (const [objeto, visible] of visibilidadAnterior) objeto.visible = visible;
      visibilidadAnterior = null;
    }
    scene.remove(grupoLanzamiento);
    plataforma.destruir();
    cohete.destruir();
    geomCielo.dispose();
    matCielo.dispose();
  }

  function cancelar() {
    if (!activo) return;
    activo = false;
    grupoLanzamiento.visible = false;
    if (visibilidadAnterior) {
      for (const [objeto, visible] of visibilidadAnterior) objeto.visible = visible;
      visibilidadAnterior = null;
    }
    if (controls) controls.enabled = true;
  }

  return {
    grupo: grupoLanzamiento,
    iniciar,
    pausar,
    reanudar,
    saltar,
    cancelar,
    reiniciar,
    actualizar,
    destruir,
    estaActivo: () => activo,
    estaEnPausa: () => enPausa,
    obtenerFaseActual: () => faseActual,
    obtenerMisionActiva: () => misionIdActiva,
    obtenerProgreso: () => Math.min(1, tiempoTranscurrido / DURACION_TOTAL),
    obtenerTiempo: () => tiempoTranscurrido
  };
}
