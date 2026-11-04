# 13. Guía de Instrucciones Técnicas para Continuar con Codex

**Destinatario:** OpenAI Codex / Agente de Desarrollo de Software  
**Objetivo:** Proporcionar instrucciones operativas quirúrgicas y de alcance limitado para resolver los defectos detectados sin alterar el código que ya funciona correctamente.

---

## Regla de Oro para el Desarrollo con Codex

> [!CAUTION]
> **NO REESCRIBAS NINGÚN MÓDULO CIENTÍFICO NI DE EFEMÉRIDES.**
> El núcleo de mecánica orbital (`HermiteInterpolation.js`, `OrbitalDynamicsEngine.js`, `Time.js`, `Units.js`) cuenta con 78 pruebas unitarias automatizadas que pasan al 100%. Cualquier alteración no autorizada de estos archivos romperá los cálculos de validación.

---

## Tarea 1 (Prioridad 1): Corregir Excepción `hud.anunciar` (DEF-01)

### 1. Contexto del Error
En [src/main.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/main.js), las funciones `ejecutarHitoGuiado` (línea 973), `alCompletarLanzamiento` (línea 946) y la inicialización de la sonda (línea 1373) invocan `hud.anunciar(mensaje)`. Sin embargo, `crearControlesHUD()` en `src/ui/HudControls.js` no exporta dicha función.

### 2. Archivo a Modificar
[src/ui/HudControls.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/ui/HudControls.js)

### 3. Modificación Exacta
En `src/ui/HudControls.js`, dentro de la función `crearControlesHUD()`, añadir antes del `return`:

```javascript
function anunciar(mensaje) {
  if (anuncio) {
    anuncio.textContent = '';
    setTimeout(() => {
      anuncio.textContent = mensaje;
    }, 20);
  }
}
```

Y modificar el objeto de retorno al final del archivo:
```javascript
// ANTES:
return { actualizarSeleccion, actualizarSeleccionSonda };

// DESPUÉS:
return { actualizarSeleccion, actualizarSeleccionSonda, anunciar };
```

### 4. Verificación Obligatoria
Ejecutar en la terminal:
```powershell
node --test tests/*.test.mjs
npm run build
```

---

## Tarea 2 (Prioridad 1): Añadir Tolerancia Numérica en Límites de Cobertura JD (DEF-02)

### 1. Contexto del Error
En `src/science/HistoricalEphemerisResolver.js:423`, la consulta del vector heliocéntrico de la Tierra en el instante exacto de inyección de Voyager 2 (`JD 2443376.1479166667`) arroja `outside_coverage` debido a que el catálogo almacena el límite inferior como `2443376.147916667`. La diferencia de coma flotante de `3.3e-16` hace fallar la comparación estricta.

### 2. Archivo a Modificar
[src/science/HistoricalEphemerisResolver.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/science/HistoricalEphemerisResolver.js)

### 3. Modificación Exacta
Localizar en `src/science/HistoricalEphemerisResolver.js` las funciones de validación de cobertura temporal (`resolveStandardBody` y `resolveProbeState`) y aplicar una tolerancia numérica:
```javascript
const EPSILON_JD_COVERAGE = 1e-9; // ~86 microsegundos de tolerancia flotante

// Al comprobar si jdTdb cae dentro de [startJdTdb, endJdTdb]:
const dentroDeRango = jdTdb >= (dataset.coverage.startJdTdb - EPSILON_JD_COVERAGE) &&
                      jdTdb <= (dataset.coverage.endJdTdb + EPSILON_JD_COVERAGE);

// Si jdTdb cae dentro del margen epsilon pero fuera del límite exacto, clampear:
const jdTdbAjustado = Math.max(dataset.coverage.startJdTdb, Math.min(dataset.coverage.endJdTdb, jdTdb));
```

### 4. Verificación Obligatoria
Comprobar que `node --test tests/VoyagerHistoricalMode.test.mjs` continúe aprobando todas sus pruebas de validación con muestras retenidas.

---

## Tarea 3 (Prioridad 2): Estado Semántico en Ficha de Pre-Lanzamiento (DEF-03)

### 1. Archivo a Modificar
[src/ui/HistoricalModeControls.js](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/ui/HistoricalModeControls.js)

### 2. Modificación
En la función que actualiza los elementos `#v-card-dist-sun-au`, `#v-card-dist-earth-au` y `#v-card-light-time`, cuando la sonda tenga estado `status === 'pre_launch'` o no posea vector heliocéntrico en la fecha actual, mostrar el texto descriptivo:
```javascript
if (datosSonda?.status === 'pre_launch') {
  elDistSol.textContent = 'En plataforma LC-41';
  elDistTierra.textContent = 'Cabo Cañaveral, FL';
  elTiempoLuz.textContent = 'Superficie terrestre';
}
```

---

## Tarea 4 (Prioridad 2): Ajuste de CSS para Pantallas Compactas (DEF-04)

### 1. Archivo a Modificar
[src/ui/timeline-layout.css](file:///C:/Users/PC/simulador-sondas-espaciales/simulador-sondas-espaciales/src/ui/timeline-layout.css)

### 2. Modificación
Añadir al final del archivo:
```css
@media (max-width: 480px) {
  .hist-date-selectors {
    display: none !important;
  }
  .hist-transport-row {
    padding: 6px 8px;
    gap: 6px;
  }
  .hist-clock-readout strong {
    font-size: 0.85rem;
  }
  .hist-mission-dock {
    bottom: 84px;
    transform: scale(0.92);
  }
}
```

---

## Componentes Protegidos (NO MODIFICAR)

1. **`src/science/HermiteInterpolation.js`:** La formulación de derivadas cúbicas es exacta.
2. **`src/science/OrbitalDynamicsEngine.js`:** El integrador DOPRI54 cumple los coeficientes canónicos de Dormand-Prince.
3. **`public/models/voyager/Voyager.glb`:** Modelo oficial de la NASA; no debe ser reemplazado ni recompilado.
4. **`public/data/`:** Todos los ficheros JSON contienen los datos verificados de Horizons; no editar a mano.
