import * as THREE from 'three';

/**
 * Reconstrucción tridimensional procedural del lanzador Titan IIIE-Centaur
 * basada en documentación oficial NASA/JPL y Smithsonian National Air and Space Museum:
 * - Altura total: ~48.8 m (escala 1 unidad Three.js = 10 m en escena local de lanzamiento)
 * - Núcleo Titan IIIE (Etapa 1 y 2): diámetro ~3.05 m
 * - 2x Propulsores de combustible sólido UA1205 (5 segmentos cada uno): diámetro ~3.05 m, altura ~25.9 m
 * - Etapa superior criogénica Centaur D-1T: diámetro ~3.05 m, 2 motores RL10
 * - Cubierta protectora Centaur Standard Shroud (CSS): diámetro ensanchado ~4.27 m (perfil característico)
 * - Carga útil: adaptador y sonda Voyager con componentes desplegables
 */
export function crearCoheteTitanCentaur({ escala = 1.0 } = {}) {
  const grupo = new THREE.Group();
  grupo.name = 'TitanIIIE_Centaur';

  // Materiales PBR optimizados sin dependencias externas
  const matBlancoTitan = new THREE.MeshStandardMaterial({
    color: 0xf4f5f7,
    roughness: 0.35,
    metalness: 0.15
  });

  const matNegroDetalle = new THREE.MeshStandardMaterial({
    color: 0x1a1c22,
    roughness: 0.5,
    metalness: 0.2
  });

  const matGrisInteretapa = new THREE.MeshStandardMaterial({
    color: 0x424652,
    roughness: 0.6,
    metalness: 0.3
  });

  const matMetalTobera = new THREE.MeshStandardMaterial({
    color: 0x2b2927,
    roughness: 0.3,
    metalness: 0.8
  });

  const matAislamientoCentaur = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.05
  });

  const matDoradoTermico = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.2,
    metalness: 0.85
  });

  const matFuego = new THREE.MeshBasicMaterial({
    color: 0xff7722,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
  });

  const matFuegoCentro = new THREE.MeshBasicMaterial({
    color: 0xfff0aa,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending
  });

  // Geometrías reutilizables
  const geomCilindro = (rt, rb, h, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);

  // ----------------------------------------------------
  // 1. NÚCLEO TITAN ETAPA 1 (Base Y = 0 hasta Y = 2.23)
  // ----------------------------------------------------
  const grupoEtapa1 = new THREE.Group();
  grupoEtapa1.name = 'Etapa1_Titan';

  // Cilindro principal etapa 1 (diámetro 0.305, h 2.23)
  const radioTitan = 0.152;
  const altoEtapa1 = 2.23;
  const cuerpoEtapa1 = new THREE.Mesh(geomCilindro(radioTitan, radioTitan, altoEtapa1), matBlancoTitan);
  cuerpoEtapa1.position.y = altoEtapa1 / 2;
  grupoEtapa1.add(cuerpoEtapa1);

  // Anillos de refuerzo y canaletas de cables exteriores
  const anilloBase1 = new THREE.Mesh(geomCilindro(radioTitan * 1.03, radioTitan * 1.03, 0.08), matGrisInteretapa);
  anilloBase1.position.y = 0.04;
  grupoEtapa1.add(anilloBase1);

  const canaletaE1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, altoEtapa1 * 0.9, 0.03), matGrisInteretapa);
  canaletaE1.position.set(0, altoEtapa1 / 2, radioTitan + 0.01);
  grupoEtapa1.add(canaletaE1);

  // Dos toberas de motor LR87-AJ-11 en la base
  const toberaE1A = new THREE.Mesh(geomCilindro(0.04, 0.07, 0.18, 16), matMetalTobera);
  toberaE1A.position.set(0.06, -0.09, 0);
  const toberaE1B = new THREE.Mesh(geomCilindro(0.04, 0.07, 0.18, 16), matMetalTobera);
  toberaE1B.position.set(-0.06, -0.09, 0);
  grupoEtapa1.add(toberaE1A, toberaE1B);

  grupo.add(grupoEtapa1);

  // ----------------------------------------------------
  // 2. INTERETAPA Y TITAN ETAPA 2 (Y = 2.23 hasta Y = 3.0)
  // ----------------------------------------------------
  const grupoEtapa2 = new THREE.Group();
  grupoEtapa2.name = 'Etapa2_Titan';
  grupoEtapa2.position.y = altoEtapa1;

  // Celosía de ventilación interetapa
  const interetapa = new THREE.Mesh(geomCilindro(radioTitan * 0.98, radioTitan, 0.16), matGrisInteretapa);
  interetapa.position.y = 0.08;
  grupoEtapa2.add(interetapa);

  // Tobera simple motor LR91-AJ-11
  const toberaE2 = new THREE.Mesh(geomCilindro(0.03, 0.08, 0.15, 16), matMetalTobera);
  toberaE2.position.set(0, 0.07, 0);
  grupoEtapa2.add(toberaE2);

  // Cuerpo Etapa 2
  const altoEtapa2 = 0.71;
  const cuerpoEtapa2 = new THREE.Mesh(geomCilindro(radioTitan, radioTitan, altoEtapa2), matBlancoTitan);
  cuerpoEtapa2.position.y = 0.16 + altoEtapa2 / 2;
  grupoEtapa2.add(cuerpoEtapa2);

  // Banda de separación negra característica de Titan
  const bandaE2 = new THREE.Mesh(geomCilindro(radioTitan * 1.01, radioTitan * 1.01, 0.06), matNegroDetalle);
  bandaE2.position.y = 0.16 + altoEtapa2 - 0.03;
  grupoEtapa2.add(bandaE2);

  grupo.add(grupoEtapa2);

  // ----------------------------------------------------
  // 3. ETAPA CRIO-SUPERIOR CENTAUR D-1T (Y = 3.10 hasta Y = 3.95)
  // ----------------------------------------------------
  const grupoCentaur = new THREE.Group();
  grupoCentaur.name = 'EtapaCentaur_D1T';
  const yBaseCentaur = altoEtapa1 + 0.16 + altoEtapa2;
  grupoCentaur.position.y = yBaseCentaur;

  // Aislamiento térmico blanco y doble motor criogénico RL10
  const altoCentaur = 0.85;
  const cuerpoCentaur = new THREE.Mesh(geomCilindro(radioTitan * 0.96, radioTitan * 0.96, altoCentaur), matAislamientoCentaur);
  cuerpoCentaur.position.y = altoCentaur / 2;
  grupoCentaur.add(cuerpoCentaur);

  // Motores duales RL10
  const toberaCentA = new THREE.Mesh(geomCilindro(0.025, 0.05, 0.12, 16), matMetalTobera);
  toberaCentA.position.set(0.045, -0.05, 0);
  const toberaCentB = new THREE.Mesh(geomCilindro(0.025, 0.05, 0.12, 16), matMetalTobera);
  toberaCentB.position.set(-0.045, -0.05, 0);
  grupoCentaur.add(toberaCentA, toberaCentB);

  // Star-37E (motor de inyección de perigeo / propulsión de escape de Voyager)
  const etapaStar37 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), matGrisInteretapa);
  etapaStar37.scale.set(1, 1.25, 1);
  etapaStar37.position.y = altoCentaur + 0.1;
  grupoCentaur.add(etapaStar37);

  grupo.add(grupoCentaur);

  // ----------------------------------------------------
  // 4. SONDA VOYAGER MINIATURIZADA (Carga útil dentro de la cofia)
  // ----------------------------------------------------
  const grupoVoyagerPayload = new THREE.Group();
  grupoVoyagerPayload.name = 'Voyager_Payload';
  grupoVoyagerPayload.position.y = yBaseCentaur + altoCentaur + 0.18;

  // Bus decagonal dorado
  const busVoyager = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10), matDoradoTermico);
  grupoVoyagerPayload.add(busVoyager);

  // Antena parabólica HGA de alta ganancia (3.7 m escala local)
  const platoHga = new THREE.Mesh(new THREE.ConeGeometry(0.185, 0.05, 24, 1, true), matBlancoTitan);
  platoHga.position.y = 0.055;
  platoHga.rotation.x = Math.PI;
  grupoVoyagerPayload.add(platoHga);

  const subreflector = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 12), matDoradoTermico);
  subreflector.position.y = 0.09;
  grupoVoyagerPayload.add(subreflector);

  // Brazos de magnetómetro y RTG plegados
  const brazoRtg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16), matNegroDetalle);
  brazoRtg.position.set(0.12, 0.02, 0);
  brazoRtg.rotation.z = Math.PI / 3;
  grupoVoyagerPayload.add(brazoRtg);

  grupo.add(grupoVoyagerPayload);

  // ----------------------------------------------------
  // 5. CUBIERTA PROTECTORA CENTAUR STANDARD SHROUD (CSS)
  // Perfil "hammerhead" ensanchado de 4.27 m (radio 0.213)
  // Dividida en dos mitades simétricas para animación de separación
  // ----------------------------------------------------
  const grupoCofia = new THREE.Group();
  grupoCofia.name = 'Cofia_CentaurStandardShroud';
  grupoCofia.position.y = yBaseCentaur;

  const radioCofia = 0.213;
  const altoCofiaCilindro = 1.25;
  const altoConoCofia = 0.65;

  // Mitad Izquierda (-X)
  const mitadCofiaIzq = new THREE.Group();
  const cCilIzq = new THREE.Mesh(new THREE.CylinderGeometry(radioCofia, radioCofia, altoCofiaCilindro, 24, 1, true, Math.PI / 2, Math.PI), matBlancoTitan);
  cCilIzq.position.y = altoCofiaCilindro / 2;
  const cConoIzq = new THREE.Mesh(new THREE.ConeGeometry(radioCofia, altoConoCofia, 24, 1, true, Math.PI / 2, Math.PI), matBlancoTitan);
  cConoIzq.position.y = altoCofiaCilindro + altoConoCofia / 2;
  const conoTransicionIzq = new THREE.Mesh(new THREE.CylinderGeometry(radioCofia, radioTitan, 0.14, 24, 1, true, Math.PI / 2, Math.PI), matBlancoTitan);
  conoTransicionIzq.position.y = -0.07;
  mitadCofiaIzq.add(cCilIzq, cConoIzq, conoTransicionIzq);

  // Mitad Derecha (+X)
  const mitadCofiaDer = new THREE.Group();
  const cCilDer = new THREE.Mesh(new THREE.CylinderGeometry(radioCofia, radioCofia, altoCofiaCilindro, 24, 1, true, -Math.PI / 2, Math.PI), matBlancoTitan);
  cCilDer.position.y = altoCofiaCilindro / 2;
  const cConoDer = new THREE.Mesh(new THREE.ConeGeometry(radioCofia, altoConoCofia, 24, 1, true, -Math.PI / 2, Math.PI), matBlancoTitan);
  cConoDer.position.y = altoCofiaCilindro + altoConoCofia / 2;
  const conoTransicionDer = new THREE.Mesh(new THREE.CylinderGeometry(radioCofia, radioTitan, 0.14, 24, 1, true, -Math.PI / 2, Math.PI), matBlancoTitan);
  conoTransicionDer.position.y = -0.07;
  mitadCofiaDer.add(cCilDer, cConoDer, conoTransicionDer);

  grupoCofia.add(mitadCofiaIzq, mitadCofiaDer);
  grupo.add(grupoCofia);

  // ----------------------------------------------------
  // 6. DOS PROPULSORES SÓLIDOS LATERALES (UA1205 - 5 Segmentos)
  // ----------------------------------------------------
  const grupoPropulsores = new THREE.Group();
  grupoPropulsores.name = 'PropulsoresSolidos_UA1205';

  const radioSRB = 0.152;
  const altoSRB = 2.59;
  const distanciaEjeSRB = radioTitan + radioSRB + 0.015;

  function crearBoosterSRB(direccionX) {
    const srb = new THREE.Group();
    srb.name = direccionX > 0 ? 'SRB_Derecho' : 'SRB_Izquierdo';
    srb.position.set(direccionX * distanciaEjeSRB, altoSRB / 2 - 0.18, 0);

    // Cilindro principal con 5 segmentos articulados
    const cuerpo = new THREE.Mesh(geomCilindro(radioSRB, radioSRB, altoSRB), matBlancoTitan);
    srb.add(cuerpo);

    // 4 anillos divisores de los 5 segmentos característicos de UA1205
    for (let i = 1; i <= 4; i++) {
      const ring = new THREE.Mesh(geomCilindro(radioSRB * 1.025, radioSRB * 1.025, 0.03), matGrisInteretapa);
      ring.position.y = -altoSRB / 2 + (altoSRB / 5) * i;
      srb.add(ring);
    }

    // Ojiva cónica inclinada (canted forward cone)
    const ojiva = new THREE.Mesh(new THREE.ConeGeometry(radioSRB, 0.45, 24), matBlancoTitan);
    ojiva.position.set(-direccionX * 0.02, altoSRB / 2 + 0.225, 0);
    ojiva.rotation.z = -direccionX * 0.06;
    srb.add(ojiva);

    // Tobera inclinada hacia afuera (6 grados canted nozzle para vector de empuje sobre CdG)
    const tobera = new THREE.Mesh(geomCilindro(0.06, 0.13, 0.28, 20), matMetalTobera);
    tobera.position.set(direccionX * 0.025, -altoSRB / 2 - 0.14, 0);
    tobera.rotation.z = direccionX * 0.10;
    srb.add(tobera);

    // Tanque cilíndrico de control de vector de empuje (TVC N2O4) lateral
    const tvcTanque = new THREE.Mesh(geomCilindro(0.035, 0.035, altoSRB * 0.7), matBlancoTitan);
    tvcTanque.position.set(0, 0, radioSRB + 0.025);
    srb.add(tvcTanque);

    // Herrajes de anclaje al núcleo central Titan
    const anclajeSuperior = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), matGrisInteretapa);
    anclajeSuperior.position.set(-direccionX * (radioSRB + 0.01), altoSRB * 0.35, 0);
    const anclajeInferior = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), matGrisInteretapa);
    anclajeInferior.position.set(-direccionX * (radioSRB + 0.01), -altoSRB * 0.38, 0);
    srb.add(anclajeSuperior, anclajeInferior);

    // Pluma de propulsión de fuego y humo volumétrico
    const grupoLlama = new THREE.Group();
    grupoLlama.name = 'Llama_SRB';
    grupoLlama.position.copy(tobera.position);
    grupoLlama.position.y -= 0.14;

    const llamaExterna = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 16), matFuego);
    llamaExterna.position.y = -0.7;
    llamaExterna.rotation.x = Math.PI;

    const llamaInterna = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.95, 16), matFuegoCentro);
    llamaInterna.position.y = -0.475;
    llamaInterna.rotation.x = Math.PI;

    grupoLlama.add(llamaExterna, llamaInterna);
    srb.add(grupoLlama);

    return { grupo: srb, llama: grupoLlama, direccionX };
  }

  const srbIzq = crearBoosterSRB(-1);
  const srbDer = crearBoosterSRB(1);
  grupoPropulsores.add(srbIzq.grupo, srbDer.grupo);
  grupo.add(grupoPropulsores);

  // Luz puntual del despegue (iluminación dinámica de llamarada)
  const luzLlamarada = new THREE.PointLight(0xff8833, 0, 15, 2);
  luzLlamarada.position.set(0, -0.5, 0);
  grupo.add(luzLlamarada);

  // Escala general
  grupo.scale.setScalar(escala);

  // ----------------------------------------------------
  // CONTROLADOR DE ANIMACIONES DE ETAPAS Y PROPULSIÓN
  // ----------------------------------------------------
  function encenderLlamas(activo, intensidad = 1.0) {
    srbIzq.llama.visible = activo;
    srbDer.llama.visible = activo;
    luzLlamarada.intensity = activo ? 18.0 * intensidad : 0;
    if (activo) {
      const escalaLlama = 0.85 + Math.random() * 0.3;
      srbIzq.llama.scale.set(escalaLlama, 0.9 + Math.random() * 0.25, escalaLlama);
      srbDer.llama.scale.set(escalaLlama, 0.9 + Math.random() * 0.25, escalaLlama);
    }
  }
  encenderLlamas(false);

  function separarPropulsores(progreso) {
    const t = THREE.MathUtils.clamp(progreso, 0, 1);
    const despX = Math.pow(t, 1.4) * 2.2;
    const despY = -Math.pow(t, 1.8) * 3.5;
    const rotZ = Math.pow(t, 1.2) * 0.45;

    srbIzq.grupo.position.x = -distanciaEjeSRB - despX;
    srbIzq.grupo.position.y = (altoSRB / 2 - 0.18) + despY;
    srbIzq.grupo.rotation.z = -rotZ;

    srbDer.grupo.position.x = distanciaEjeSRB + despX;
    srbDer.grupo.position.y = (altoSRB / 2 - 0.18) + despY;
    srbDer.grupo.rotation.z = rotZ;

    if (t > 0.05) encenderLlamas(false);
  }

  function separarEtapa1(progreso) {
    const t = THREE.MathUtils.clamp(progreso, 0, 1);
    grupoEtapa1.position.y = -Math.pow(t, 1.6) * 4.0;
    grupoEtapa1.rotation.x = Math.sin(t * 3) * 0.08;
    grupoEtapa1.visible = t < 0.98;
  }

  function separarCofia(progreso) {
    const t = THREE.MathUtils.clamp(progreso, 0, 1);
    const desp = Math.pow(t, 1.3) * 1.8;
    const rot = Math.pow(t, 1.1) * 0.65;

    mitadCofiaIzq.position.x = -desp;
    mitadCofiaIzq.rotation.z = -rot;
    mitadCofiaDer.position.x = desp;
    mitadCofiaDer.rotation.z = rot;

    grupoCofia.visible = t < 0.98;
  }

  function separarEtapa2(progreso) {
    const t = THREE.MathUtils.clamp(progreso, 0, 1);
    grupoEtapa2.position.y = altoEtapa1 - Math.pow(t, 1.6) * 4.5;
    grupoEtapa2.visible = t < 0.98;
  }

  function desplegarSondaVoyager(progreso) {
    const t = THREE.MathUtils.clamp(progreso, 0, 1);
    // Extiende el brazo del generador termoeléctrico RTG y abre visualmente la antena
    brazoRtg.rotation.z = Math.PI / 3 + t * (Math.PI / 2.2);
    grupoVoyagerPayload.position.y = (yBaseCentaur + altoCentaur + 0.18) + t * 0.4;
  }

  function restablecerTodo() {
    grupoEtapa1.position.set(0, 0, 0);
    grupoEtapa1.rotation.set(0, 0, 0);
    grupoEtapa1.visible = true;

    grupoEtapa2.position.set(0, altoEtapa1, 0);
    grupoEtapa2.rotation.set(0, 0, 0);
    grupoEtapa2.visible = true;

    grupoCentaur.position.set(0, yBaseCentaur, 0);
    grupoCentaur.visible = true;

    mitadCofiaIzq.position.set(0, 0, 0);
    mitadCofiaIzq.rotation.set(0, 0, 0);
    mitadCofiaDer.position.set(0, 0, 0);
    mitadCofiaDer.rotation.set(0, 0, 0);
    grupoCofia.visible = true;

    srbIzq.grupo.position.set(-distanciaEjeSRB, altoSRB / 2 - 0.18, 0);
    srbIzq.grupo.rotation.set(0, 0, 0);
    srbDer.grupo.position.set(distanciaEjeSRB, altoSRB / 2 - 0.18, 0);
    srbDer.grupo.rotation.set(0, 0, 0);
    grupoPropulsores.visible = true;

    brazoRtg.rotation.z = Math.PI / 3;
    grupoVoyagerPayload.position.set(0, yBaseCentaur + altoCentaur + 0.18, 0);
    grupoVoyagerPayload.visible = true;

    encenderLlamas(false);
  }

  function destruir() {
    grupo.traverse(node => {
      if (node.isMesh) {
        node.geometry?.dispose();
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
        else node.material?.dispose();
      }
    });
  }

  return {
    grupo,
    encenderLlamas,
    separarPropulsores,
    separarEtapa1,
    separarCofia,
    separarEtapa2,
    desplegarSondaVoyager,
    restablecerTodo,
    destruir,
    obtenerAlturaTotal: () => 4.88 * escala
  };
}
