import * as THREE from 'three';

const NOMBRES = { Jupiter: 'Júpiter' };
const COLORES_MARCADOR = {
  Mercurio: '#b5bac2',
  Venus: '#e6c998',
  Tierra: '#6aa8ff',
  Marte: '#e2815a',
  Jupiter: '#dab894',
  Saturno: '#e0cb9d',
  Urano: '#99dfe4',
  Neptuno: '#6c8ff2',
  Io: '#e3c261',
  Titan: '#d99b4e',
  Triton: '#d8cfd2',
  Sol: '#ffe4a8'
};
const PRIORIDAD = ['Tierra', 'Jupiter', 'Saturno', 'Marte', 'Neptuno', 'Urano', 'Venus', 'Mercurio'];

function suavizarPaso(borde0, borde1, x) {
  const t = THREE.MathUtils.clamp((x - borde0) / (borde1 - borde0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function crearEtiquetasPlanetas(
  container,
  camera,
  objetos,
  sonda = null,
  { sondasHistoricas = [], satelites = null } = {}
) {
  const capa = document.createElement('div');
  capa.className = 'planet-labels';
  capa.setAttribute('aria-hidden', 'true');
  container.append(capa);

  const elementos = new Map();
  const marcadores = new Map();

  for (const nombre of objetos.keys()) {
    const marcador = document.createElement('span');
    marcador.className = 'celestial-marker';
    marcador.style.setProperty('--marker-color', COLORES_MARCADOR[nombre] ?? '#cfd3da');
    marcador.hidden = true;
    capa.append(marcador);
    marcadores.set(nombre, marcador);

    const etiqueta = document.createElement('span');
    etiqueta.className = 'planet-label';
    etiqueta.textContent = NOMBRES[nombre] ?? nombre;
    etiqueta.hidden = true;
    capa.append(etiqueta);
    elementos.set(nombre, etiqueta);
  }

  // Etiqueta discreta del Sol (utilizada en vista primera persona / recreación desde espacio profundo)
  const marcadorSol = document.createElement('span');
  marcadorSol.className = 'celestial-marker';
  marcadorSol.style.setProperty('--marker-color', COLORES_MARCADOR.Sol);
  marcadorSol.hidden = true;
  capa.append(marcadorSol);

  const etiquetaSol = document.createElement('span');
  etiquetaSol.className = 'planet-label';
  etiquetaSol.textContent = 'Sol';
  etiquetaSol.hidden = true;
  capa.append(etiquetaSol);

  // Sondas (Sonda Experimental 01 + Voyager 1 + Voyager 2)
  const registrosSondas = [];
  if (sonda) {
    const marcadorSonda = document.createElement('span');
    marcadorSonda.className = 'celestial-marker celestial-marker--probe';
    marcadorSonda.hidden = true;
    capa.append(marcadorSonda);

    const etiquetaSonda = document.createElement('span');
    etiquetaSonda.className = 'probe-label';
    etiquetaSonda.textContent = 'Sonda Experimental 01';
    etiquetaSonda.hidden = true;
    capa.append(etiquetaSonda);

    registrosSondas.push({
      id: '__SONDA__',
      tipo: 'sonda',
      sonda,
      marcador: marcadorSonda,
      etiqueta: etiquetaSonda
    });
  }

  for (const item of sondasHistoricas) {
    const marcadorHist = document.createElement('span');
    marcadorHist.className = 'celestial-marker celestial-marker--probe';
    if (item.colorCss) {
      marcadorHist.style.setProperty('--marker-color', item.colorCss);
      marcadorHist.style.borderColor = item.colorCss;
    }
    marcadorHist.hidden = true;
    capa.append(marcadorHist);

    const etiquetaHist = document.createElement('span');
    etiquetaHist.className = 'probe-label';
    if (item.colorCss) {
      etiquetaHist.style.color = item.colorCss;
    }
    etiquetaHist.textContent = item.etiqueta;
    etiquetaHist.hidden = true;
    capa.append(etiquetaHist);

    registrosSondas.push({
      id: item.id,
      tipo: 'sonda_historica',
      sonda: item.sonda,
      marcador: marcadorHist,
      etiqueta: etiquetaHist
    });
  }

  // Satélites naturales en ventanas de encuentro (Ío, Titán, Tritón)
  const registrosSatelites = [];
  if (satelites) {
    for (const [key, sat] of satelites.entries()) {
      const marcadorSat = document.createElement('span');
      marcadorSat.className = 'celestial-marker';
      marcadorSat.style.setProperty('--marker-color', COLORES_MARCADOR[key] ?? '#d8d0c0');
      marcadorSat.hidden = true;
      capa.append(marcadorSat);

      const etiquetaSat = document.createElement('span');
      etiquetaSat.className = 'planet-label';
      etiquetaSat.textContent = sat.meta.name;
      etiquetaSat.hidden = true;
      capa.append(etiquetaSat);

      registrosSatelites.push({
        id: key,
        tipo: 'satelite',
        sat,
        marcador: marcadorSat,
        etiqueta: etiquetaSat
      });
    }
  }

  const proyectado = new THREE.Vector3();
  const haciaDelante = new THREE.Vector3();
  const rayo = new THREE.Vector3();
  const alDisco = new THREE.Vector3();
  const centroSol = new THREE.Vector3();
  let visible = false;
  let objetivosPantalla = [];
  let hoverActualId = null;

  function intersectaDisco(centro, radio, distancia) {
    if (radio <= 0) return false;
    alDisco.copy(centro).sub(camera.position);
    const avance = alDisco.dot(rayo);
    if (avance <= 0 || avance >= distancia) return false;
    const separacionCuadrada = alDisco.lengthSq() - avance * avance;
    return separacionCuadrada < radio * radio &&
      avance - Math.sqrt(Math.max(0, radio * radio - separacionCuadrada)) < distancia;
  }

  function ocultoPorDisco(nombre, centro, distancia, radioSolActual) {
    rayo.copy(centro).sub(camera.position).multiplyScalar(1 / Math.max(distancia, 1e-8));
    if (nombre !== 'Sol' && intersectaDisco(centroSol, radioSolActual * 1.08, distancia)) return true;
    for (const [otroNombre, objeto] of objetos) {
      if (otroNombre === nombre) continue;
      const radio = objeto.planeta.radio * objeto.posicion.scale.x *
        (otroNombre === 'Saturno' ? 2.02 : 1.055);
      if (intersectaDisco(objeto.posicion.position, radio, distancia)) return true;
    }
    return false;
  }

  function actualizar(
    seleccionado,
    sondaSeleccionada = false,
    radioSolActual = 0.15,
    { idSondaActiva = null, modoPrimeraPersona = false, objetivoMirada = null } = {}
  ) {
    objetivosPantalla = [];
    if (!visible) return;
    const ancho = container.clientWidth;
    const alto = container.clientHeight;
    if (!ancho || !alto) return;

    camera.getWorldDirection(haciaDelante);
    const escala = alto / (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2));
    const candidatos = [];
    const objetoSeleccionado = objetos.get(seleccionado);
    const radioSelEfectivo = objetoSeleccionado
      ? objetoSeleccionado.planeta.radio * objetoSeleccionado.posicion.scale.x
      : 0;
    const observacionCercana = Boolean(
      objetoSeleccionado &&
      camera.position.distanceTo(objetoSeleccionado.posicion.position) < radioSelEfectivo * 12
    );

    for (const [nombre, objeto] of objetos) {
      const elemento = elementos.get(nombre);
      const marcador = marcadores.get(nombre);
      const posicion = objeto.posicion.position;
      const distancia = camera.position.distanceTo(posicion);

      if (ocultoPorDisco(nombre, posicion, distancia, radioSolActual)) {
        elemento.hidden = true;
        marcador.hidden = true;
        continue;
      }

      proyectado.copy(posicion).sub(camera.position);
      if (proyectado.dot(haciaDelante) <= 0) {
        elemento.hidden = true;
        marcador.hidden = true;
        continue;
      }

      proyectado.copy(posicion).project(camera);
      if (proyectado.z >= 1) {
        elemento.hidden = true;
        marcador.hidden = true;
        continue;
      }

      const xCentro = (proyectado.x + 1) * ancho / 2;
      const yCentro = (1 - proyectado.y) * alto / 2;
      const dentroLienzo = xCentro >= 12 && xCentro <= ancho - 12 && yCentro >= 12 && yCentro <= alto - 12;

      const radioEfectivo = objeto.planeta.radio * objeto.posicion.scale.x;
      const radioPx = escala * radioEfectivo / Math.max(distancia, 1e-7);

      const esProtagonista = nombre === seleccionado || nombre === objetivoMirada;
      const opacidadMarcador = dentroLienzo
        ? (1 - suavizarPaso(3.5, 14.5, radioPx)) * (observacionCercana && !esProtagonista ? 0.45 : 0.92)
        : 0;

      if (opacidadMarcador > 0.02) {
        marcador.hidden = false;
        marcador.style.left = `${xCentro}px`;
        marcador.style.top = `${yCentro}px`;
        marcador.style.opacity = opacidadMarcador.toFixed(3);
        marcador.classList.toggle('is-selected', esProtagonista);
        marcador.classList.toggle('is-hovered', hoverActualId === nombre);
      } else {
        marcador.hidden = true;
      }

      const ocultarEtiquetaPorCercania = (esProtagonista && radioPx > 42 && !modoPrimeraPersona)
        || (observacionCercana && !esProtagonista && radioPx > 18);

      const yEtiqueta = yCentro - Math.min(Math.max(radioPx, 4), 32) - 6;
      if (ocultarEtiquetaPorCercania || xCentro < 38 || xCentro > ancho - 38 || yEtiqueta < 30 || yEtiqueta > alto - 34) {
        elemento.hidden = true;
        if (!marcador.hidden) {
          objetivosPantalla.push({
            tipo: 'planeta',
            id: nombre,
            xCentro,
            yCentro,
            etiquetaEl: null
          });
        }
        continue;
      }

      candidatos.push({
        nombre,
        elemento,
        marcador,
        x: xCentro,
        y: yEtiqueta,
        xCentro,
        yCentro,
        distancia,
        radioPx,
        esProtagonista
      });
    }

    candidatos.sort((a, b) =>
      Number(b.esProtagonista) - Number(a.esProtagonista) ||
      Number(b.nombre === hoverActualId) - Number(a.nombre === hoverActualId) ||
      PRIORIDAD.indexOf(a.nombre) - PRIORIDAD.indexOf(b.nombre)
    );

    const ocupados = [];
    const limite = ancho < 660 ? 5 : 8;
    for (const candidato of candidatos) {
      const esPrioritario = candidato.esProtagonista || candidato.nombre === hoverActualId;
      const umbralX = modoPrimeraPersona && esPrioritario ? 46 : 76;
      const solapa = !esPrioritario && (ocupados.length >= limite || ocupados.some(pos =>
        Math.abs(pos.x - candidato.x) < umbralX && Math.abs(pos.y - candidato.y) < 20));
      candidato.elemento.hidden = solapa;
      if (!solapa) {
        candidato.elemento.classList.toggle('is-selected', candidato.esProtagonista);
        candidato.elemento.classList.toggle('is-hovered', candidato.nombre === hoverActualId);
        candidato.elemento.style.left = `${candidato.x}px`;
        candidato.elemento.style.top = `${candidato.y}px`;
        ocupados.push(candidato);
      }
      objetivosPantalla.push({
        tipo: 'planeta',
        id: candidato.nombre,
        xCentro: candidato.xCentro,
        yCentro: candidato.yCentro,
        etiquetaEl: solapa ? null : candidato.elemento
      });
    }

    // Rótulo discreto del Sol en primera persona
    if (modoPrimeraPersona) {
      const distSol = camera.position.length();
      proyectado.copy(centroSol).sub(camera.position);
      if (proyectado.dot(haciaDelante) > 0) {
        proyectado.copy(centroSol).project(camera);
        const xSol = (proyectado.x + 1) * ancho / 2;
        const ySol = (1 - proyectado.y) * alto / 2;
        const dentro = xSol >= 28 && xSol <= ancho - 28 && ySol >= 30 && ySol <= alto - 34 && proyectado.z < 1;
        marcadorSol.hidden = !dentro;
        etiquetaSol.hidden = !dentro;
        if (dentro) {
          marcadorSol.style.left = `${xSol}px`;
          marcadorSol.style.top = `${ySol}px`;
          marcadorSol.style.opacity = '0.82';
          marcadorSol.classList.toggle('is-selected', objetivoMirada === 'Sol');
          etiquetaSol.style.left = `${xSol}px`;
          etiquetaSol.style.top = `${ySol + 16}px`;
          etiquetaSol.classList.toggle('is-selected', objetivoMirada === 'Sol');
          objetivosPantalla.push({ tipo: 'sol', id: 'Sol', xCentro: xSol, yCentro: ySol, etiquetaEl: etiquetaSol, distancia: distSol });
        }
      } else {
        marcadorSol.hidden = true;
        etiquetaSol.hidden = true;
      }
    } else {
      marcadorSol.hidden = true;
      etiquetaSol.hidden = true;
    }

    // Satélites naturales en ventanas de encuentro
    for (const regSat of registrosSatelites) {
      const nodo = regSat.sat.posicion;
      if (!nodo.visible) {
        regSat.etiqueta.hidden = true;
        regSat.marcador.hidden = true;
        continue;
      }
      const pos = nodo.position;
      const dist = camera.position.distanceTo(pos);
      proyectado.copy(pos).sub(camera.position);
      if (proyectado.dot(haciaDelante) <= 0 || ocultoPorDisco(regSat.id, pos, dist, radioSolActual)) {
        regSat.etiqueta.hidden = true;
        regSat.marcador.hidden = true;
        continue;
      }
      proyectado.copy(pos).project(camera);
      if (proyectado.z >= 1) {
        regSat.etiqueta.hidden = true;
        regSat.marcador.hidden = true;
        continue;
      }
      const xCentro = (proyectado.x + 1) * ancho / 2;
      const yCentro = (1 - proyectado.y) * alto / 2;
      const radioPx = escala * nodo.scale.x / Math.max(dist, 1e-6);
      const dentro = xCentro >= 16 && xCentro <= ancho - 16 && yCentro >= 24 && yCentro <= alto - 24;
      const esProt = objetivoMirada === regSat.id;
      const opMarc = dentro ? (1 - suavizarPaso(4, 16, radioPx)) * 0.9 : 0;
      if (opMarc > 0.03) {
        regSat.marcador.hidden = false;
        regSat.marcador.style.left = `${xCentro}px`;
        regSat.marcador.style.top = `${yCentro}px`;
        regSat.marcador.style.opacity = opMarc.toFixed(3);
        regSat.marcador.classList.toggle('is-selected', esProt);
      } else {
        regSat.marcador.hidden = true;
      }
      const yEt = yCentro - Math.min(Math.max(radioPx, 4), 26) - 6;
      const solapa = !esProt && ocupados.some(p => Math.abs(p.x - xCentro) < 62 && Math.abs(p.y - yEt) < 18);
      regSat.etiqueta.hidden = !dentro || solapa || (radioPx > 46 && !modoPrimeraPersona);
      if (!regSat.etiqueta.hidden) {
        regSat.etiqueta.style.left = `${xCentro}px`;
        regSat.etiqueta.style.top = `${yEt}px`;
        regSat.etiqueta.classList.toggle('is-selected', esProt);
        ocupados.push({ x: xCentro, y: yEt });
      }
      objetivosPantalla.push({
        tipo: 'satelite',
        id: regSat.id,
        xCentro,
        yCentro,
        etiquetaEl: regSat.etiqueta.hidden ? null : regSat.etiqueta
      });
    }

    // Sondas (Experimental + Voyager 1 + Voyager 2)
    for (const reg of registrosSondas) {
      const s = reg.sonda;
      // Si la cámara está en primera persona dentro de esta sonda, su visual está oculta
      if (!s.posicion.visible || !s.visual.visible) {
        reg.etiqueta.hidden = true;
        reg.marcador.hidden = true;
        continue;
      }
      const posSonda = s.posicion.position;
      const distSonda = camera.position.distanceTo(posSonda);
      const radioObsSonda = s.obtenerRadioObservacionActual ? s.obtenerRadioObservacionActual() : 0.72;
      const cercaDeSonda = distSonda < radioObsSonda * 7.5;
      const esSeleccionada = (reg.id === '__SONDA__' && sondaSeleccionada)
        || (idSondaActiva && reg.id === idSondaActiva)
        || (objetivoMirada && reg.id === objetivoMirada);

      if (ocultoPorDisco(reg.id, posSonda, distSonda, radioSolActual)) {
        reg.etiqueta.hidden = true;
        reg.marcador.hidden = true;
        continue;
      }

      proyectado.copy(posSonda).sub(camera.position);
      if (proyectado.dot(haciaDelante) <= 0) {
        reg.etiqueta.hidden = true;
        reg.marcador.hidden = true;
        continue;
      }

      proyectado.copy(posSonda).project(camera);
      const xCentro = (proyectado.x + 1) * ancho / 2;
      const yCentro = (1 - proyectado.y) * alto / 2;
      const radioSondaPx = escala * radioObsSonda / Math.max(distSonda, 1e-6);
      const opacidadMarcadorSonda = (xCentro >= 12 && xCentro <= ancho - 12 && yCentro >= 12 && yCentro <= alto - 12 && proyectado.z < 1)
        ? (1 - suavizarPaso(5, 20, radioSondaPx)) * 0.95
        : 0;

      if (opacidadMarcadorSonda > 0.02) {
        reg.marcador.hidden = false;
        reg.marcador.style.left = `${xCentro}px`;
        reg.marcador.style.top = `${yCentro}px`;
        reg.marcador.style.opacity = opacidadMarcadorSonda.toFixed(3);
        reg.marcador.classList.toggle('is-selected', esSeleccionada);
        reg.marcador.classList.toggle('is-hovered', hoverActualId === reg.id);
      } else {
        reg.marcador.hidden = true;
      }

      const yEtiqueta = yCentro - 11;
      const fuera = cercaDeSonda || xCentro < 42 || xCentro > ancho - 42 || yEtiqueta < 32 || yEtiqueta > alto - 36 || proyectado.z >= 1;
      const solapa = !esSeleccionada && hoverActualId !== reg.id && ocupados.some(pos =>
        Math.abs(pos.x - xCentro) < 88 && Math.abs(pos.y - yEtiqueta) < 20);
      reg.etiqueta.hidden = fuera || solapa;
      if (!reg.etiqueta.hidden) {
        reg.etiqueta.classList.toggle('is-selected', esSeleccionada);
        reg.etiqueta.classList.toggle('is-hovered', hoverActualId === reg.id);
        reg.etiqueta.style.left = `${xCentro}px`;
        reg.etiqueta.style.top = `${yEtiqueta}px`;
        ocupados.push({ x: xCentro, y: yEtiqueta });
      }

      if (!reg.marcador.hidden || !reg.etiqueta.hidden) {
        objetivosPantalla.push({
          tipo: reg.tipo,
          id: reg.id,
          xCentro,
          yCentro,
          etiquetaEl: reg.etiqueta.hidden ? null : reg.etiqueta
        });
      }
    }
  }

  function objetivoEnPantalla(clientX, clientY) {
    if (!visible || objetivosPantalla.length === 0) return null;
    const rectContenedor = container.getBoundingClientRect();
    const lx = clientX - rectContenedor.left;
    const ly = clientY - rectContenedor.top;

    for (const item of objetivosPantalla) {
      if (!item.etiquetaEl || item.etiquetaEl.hidden) continue;
      const r = item.etiquetaEl.getBoundingClientRect();
      if (clientX >= r.left - 3 && clientX <= r.right + 3 && clientY >= r.top - 2 && clientY <= r.bottom + 2) {
        return { tipo: item.tipo, id: item.id };
      }
    }

    let mejor = null;
    let menorDistancia = 16;
    for (const item of objetivosPantalla) {
      const d = Math.hypot(lx - item.xCentro, ly - item.yCentro);
      if (d <= menorDistancia) {
        menorDistancia = d;
        mejor = { tipo: item.tipo, id: item.id };
      }
    }
    return mejor;
  }

  function establecerHover(id) {
    hoverActualId = id ?? null;
  }

  function mostrar(valor) {
    visible = valor;
    capa.hidden = !valor;
    if (!valor) objetivosPantalla = [];
  }

  mostrar(false);
  return { actualizar, mostrar, objetivoEnPantalla, establecerHover };
}
