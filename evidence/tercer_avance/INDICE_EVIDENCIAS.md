# Índice Exhaustivo de Evidencias Visuales y Funcionales — Tercer Avance
**Proyecto:** Simulador de Sondas Espaciales  
**Rama de trabajo:** `revision/modo-historico-voyager`  
**Auditor:** Gemini (Auditoría Independiente)  
**Fecha de corte:** 19 de noviembre de 2026  
**Entorno de ejecución:** Chrome Headless (Playwright, SwiftShader / WebGL), Node.js v24, Windows x64.  
**Total de capturas:** 57 archivos organizados en 14 carpetas temáticas.

---

## Convenciones de Validación Científica y Técnica

- **VALIDADO CIENTÍFICAMENTE:** Módulos contrastados con soluciones de referencia analíticas, efemérides JPL Horizons/SPK, y auditados de forma independiente (Etapas 1–12B, 12E.1, 12F.1, 12G).
- **EXPERIMENTAL / APROBADO CON OBSERVACIONES:** Módulos numéricos funcionales bajo aproximaciones declaradas (DOPRI54 geocéntrico/lunar, guiado por gravedad en vacío, Tsiolkovsky ilustrativo).
- **IMPLEMENTADO Y PROBADO LOCALMENTE (PENDIENTE DE AUDITORÍA CIENTÍFICA):** Módulo de Misiones Integradas (Etapa 13). Cuenta con 259 pruebas unitarias superadas, pero su aprobación científica formal independiente está pendiente.

---

## 01. Sistema Solar (`01_Sistema_Solar/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `solar_01_vista_general_1920x1080.png` | 1920×1080 | Vista global tras la carga inicial del simulador. Renderizado heliocéntrico con Sol emisor, planetas, órbitas elípticas, fondo estelar y dock de transporte. | Origen en el baricentro del Sistema Solar; órbitas elípticas dibujadas con semiejes reales; escala visual adaptativa. | VALIDADO (Horizons DE430/DE440) |
| `solar_02_mapa_areas_1920x1080.png` | 1920×1080 | Apertura del menú global de navegación («Áreas», `#app-nav-panel`). | Despliegue de las 12 áreas del simulador en 4 categorías temáticas (Explorar, Diseñar, Planificar, Ejecutar). Cierre accesible con tecla Escape. | VALIDADO (UI/UX Stage 14) |
| `solar_03_jupiter_seleccionado_ficha_1920x1080.png` | 1920×1080 | Búsqueda y selección de Júpiter desde el buscador de destinos (`#search-destination-btn`). Reencuadre automático de cámara. | Ficha científica lateral con distancia heliocéntrica (5.309864 AU / 794,344,418 km), rapidez (12.796 km/s), coordenadas eclípticas J2000 y procedencia explícita Horizons. | VALIDADO (Horizons ephemeris) |
| `solar_04_saturno_y_anillos_1920x1080.png` | 1920×1080 | Selección y encuadre del planeta Saturno, mostrando la geometría de sus anillos y satélites mayores. | Texturas PBR, anillos con transparencia alfa y ficha astronómica con parámetros de masa y período orbital. | VALIDADO (Física Three.js / Horizons) |
| `solar_05_controles_tiempo_y_camaras_1920x1080.png` | 1920×1080 | Visualización del panel inferior de escala temporal, controles de paso de simulación (1× a 100 000×) y selectores de cámara. | Permite avanzar, retroceder, pausar y conmutar modos de cámara (libre, seguimiento, cenital). | VALIDADO |

---

## 02. Misiones Históricas Voyager (`02_Voyager/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `voyager_01_dialogo_bienvenida_1920x1080.png` | 1920×1080 | Diálogo de inicio del Modo Histórico (`#hist-welcome-modal`). | Ofrece las alternativas de «Recorrido guiado» (12 hitos) o «Exploración libre». | VALIDADO |
| `voyager_02_exploracion_libre_trayectoria_1920x1080.png` | 1920×1080 | Vista de exploración libre de la Voyager 2 (20 de agosto de 1977). | Modelo 3D de alta fidelidad `Voyager.glb`, trayectoria continua, dock cronológico con escala dual UTC/TDB. | VALIDADO (Tramos SPK certificados; cortes señalados) |
| `voyager_03_telemetria_pestana_datos_1920x1080.png` | 1920×1080 | Inspector lateral: pestaña «Datos». | Distancia al Sol y a la Tierra en AU y km, velocidad heliocéntrica, tiempo luz de comunicación y procedencia de kernels SPK. | VALIDADO |
| `voyager_04_linea_historica_pestana_historia_1920x1080.png` | 1920×1080 | Inspector lateral: pestaña «Historia». | Lista cronológica estructurada de 14 hitos clave de las misiones Voyager 1 y 2 (1977–2026). | VALIDADO |
| `voyager_05_fotografias_nasa_pestana_fotos_1920x1080.png` | 1920×1080 | Inspector lateral: pestaña «Fotos». | Catálogo de fotografías históricas de la NASA/JPL con metadatos de instrumento (cámara ISS-NAC/WAC) y fecha de captura. | VALIDADO (Archivo NASA) |
| `voyager_06_perspectiva_pestana_camaras_1920x1080.png` | 1920×1080 | Inspector lateral: pestaña «Cámaras». | Modos de cámara: perspectiva exterior en seguimiento, vista cenital orbital y vista en primera persona (POV) desde la plataforma científica. | VALIDADO |
| `voyager_07_recorrido_comparador_foto_3d_1920x1080.png` | 1920×1080 | Apertura del Comparador A/B (`#photo-comparator-panel`) en el encuentro de Ío. | Panel flotante comparativo: fotografía real de la NASA a la izquierda y renderizado 3D en tiempo real a la derecha, con telemetría geométrica. | VALIDADO |

---

## 03. Laboratorio Experimental: Visión General (`03_Laboratorio_General/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `lab_01_cabecera_y_navegacion_3pasos_1920x1080.png` | 1920×1080 | Cabecera del Laboratorio Experimental con flujo en tres etapas numeradas (1 Diseñar, 2 Planificar, 3 Ejecutar). | Ruta de migas de pan dinámica (`#lab-crumb-tool`), título de herramienta, banda de contexto con sonda activa (masa húmeda y Δv) y acceso al Centro de Misión. | VALIDADO (UI Stage 14) |
| `lab_02_simulacion_orbital_escena_1920x1080.png` | 1920×1080 | Entorno 3D de simulación orbital de la Sonda Experimental 01 en el Sistema Solar. | Propagación numérica orbital con integrador DOPRI54 de paso adaptativo; representación de la sonda en coordenadas físicas. | EXPERIMENTAL |
| `lab_03_mapa_areas_desde_laboratorio_1920x1080.png` | 1920×1080 | Despliegue del panel global de áreas desde el entorno del Laboratorio. | Acceso inmediato a cualquiera de las 12 herramientas del simulador sin perder el estado de trabajo. | VALIDADO |

---

## 04. Hangar de Diseño (`04_Hangar/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `hangar_01_ensamblaje_interplanetario_1920x1080.png` | 1920×1080 | Visualización de la sonda ensamblada «Exploración interplanetaria» en el viewport 3D del Hangar. | Renderizado de 11 módulos ensamblados (cuerpo, aviónica, motores químicos, depósitos de combustible, paneles solares e instrumental). Indicador «Ensamblaje válido». | EXPERIMENTAL (Diseño modular ilustrativo) |
| `hangar_02_catalogo_y_configuracion_piezas_1920x1080.png` | 1920×1080 | Desplazamiento por el catálogo de piezas y tabla de propiedades físicas. | Parámetros editables por componente: masa seca, volumen de propelente, empuje nominal, impulso específico y consumo másico. | EXPERIMENTAL |

---

## 05. Ingeniería de la Sonda (`05_Ingenieria/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `ingenieria_01_analisis_metricas_tsiolkovsky_1920x1080.png` | 1920×1080 | Panel de cálculo analítico de ingeniería del vehículo. | Masa total húmeda (561.0 kg), masa seca (280.0 kg), masa de propelente (281.0 kg), fracción másica y cálculo estricto del Δv ideal (1,260.4 m/s) mediante la ecuación del cohete de Tsiolkovsky. | VALIDADO (Ecuación de Tsiolkovsky) |
| `ingenieria_02_balance_propulsion_y_twr_1920x1080.png` | 1920×1080 | Métricas de propulsión y relación empuje-peso (TWR). | Indicadores de empuje total (N), flujo de masa ($\dot{m}$), aceleración inicial y final, y capacidad de empuje frente a diversos campos gravitatorios locales. | VALIDADO |

---

## 06. Planificador Tierra–Luna (`06_Planificador_Tierra_Luna/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `lunar_01_configuracion_maniobra_1920x1080.png` | 1920×1080 | Formulario de configuración de la transferencia translunar. | Parámetros de entrada: fecha de inyección (octubre de 2026), altitud de órbita de aparcamiento terrestre (200 km) y distancia objetivo a la Luna. | VALIDADO (Etapas 12B/12B.1) |
| `lunar_02_transferencia_calculada_1920x1080.png` | 1920×1080 | Ejecución de cálculo de transferencia impulsiva (`#mission-calculate`). | Trayectoria translunar graficada en 3D geocéntrico; cálculo de Δv de inyección (~3,130 m/s), duración del vuelo (~4.3 días) y punto de máxima aproximación lunar. | VALIDADO (DOPRI54 + efemérides Luna) |
| `lunar_03_evaluacion_viabilidad_presupuesto_1920x1080.png` | 1920×1080 | Panel de evaluación de viabilidad del presupuesto de maniobra. | Comparación directa entre el Δv requerido por la trayectoria calculada y el Δv disponible en la sonda activa. Veredicto: «INSUFICIENTE» para el diseño por defecto. | VALIDADO |

---

## 07. Propulsión y Empuje Finito (`07_Propulsion_Empuje_Finito/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `propulsion_01_controles_empuje_finito_1920x1080.png` | 1920×1080 | Activación del panel de maniobras de empuje finito (`#ft-controls-host`). | Formulario multi-encendido: definición de instantes de encendido (T+horas), duración del quemado (min), porcentaje de empuje y orientación del vector (inercial o pro-grado). | VALIDADO (Etapa 12D) |
| `propulsion_02_perfiles_motor_quimico_vs_ionico_1920x1080.png` | 1920×1080 | Cálculo numérico de la trayectoria con aceleración continua (`#ft-calculate`). | Integración acoplada de ecuaciones diferenciales con masa variable $\dot{m} = -T / (I_{sp} g_0)$; visualización de arcos propulsados frente a tramos balísticos. | VALIDADO (DOPRI54 masa variable) |

---

## 08. Lanzamiento Terrestre (`08_Lanzamiento_Terrestre/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `lanzamiento_01_configuracion_inicial_1920x1080.png` | 1920×1080 | Estado inicial del planificador de ascenso atmosférico (`#lab-launch`). | Parámetros del vehículo multietapa, sitio de lanzamiento (latitud Cabo Cañaveral), azimut de lanzamiento y panel de resultados con invitación interactiva a calcular. | VALIDADO (Etapa 12E.1) |
| `lanzamiento_02_ascenso_atmosferico_y_etapas_1920x1080.png` | 1920×1080 | Cálculo del perfil de ascenso propulsado (`#ln-calculate`). | Gráfica de trayectoria: fases de despegue vertical, giro por gravedad (*gravity turn*), separación de primera etapa, ignición de segunda etapa y apagado de inserción. | VALIDADO (Atmosférico US Standard 1976) |
| `lanzamiento_03_resultados_y_clasificacion_orbital_1920x1080.png` | 1920×1080 | Detalle de clasificación del resultado y telemetría final de inserción. | Verificación de cruce de la línea de Kármán (100 km), perigeo alcanzado (>180 km), apogeo (~240 km), excentricidad y clasificación: «ÓRBITA TERRESTRE BAJA (LEO)». | VALIDADO |

---

## 09. Descenso y Aterrizajes Multicuerpo (`09_Aterrizajes_Multicuerpo/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `aterrizaje_01_configuracion_luna_1920x1080.png` | 1920×1080 | Configuración de descenso en la Luna (`#ld-body` = 301). | Órbita inicial circular a 100 km, masa del módulo de descenso, empuje estrangulable e indicación de gravedad superficial lunar ($1.62\text{ m/s}^2$). | VALIDADO (Etapa 12F.1) |
| `aterrizaje_02_contacto_suave_luna_1920x1080.png` | 1920×1080 | Cálculo de guiado y frenado en la Luna (`#ld-calculate`). | Veredicto: «ATERRIZAJE SUAVE SEGÚN EL MODELO». Duración: T+3,958 s; velocidad residual vertical: 1.31 m/s (límite < 3 m/s); horizontal: 0.03 m/s; consumo: 2,852 kg de propelente. | VALIDADO |
| `aterrizaje_03_configuracion_europa_1920x1080.png` | 1920×1080 | Selección de Europa (`#ld-body` = 502), satélite de Júpiter. | Actualización de parámetros ambientales: gravedad superficial ($1.315\text{ m/s}^2$), radio de Europa (1,560.8 km) y ausencia de atmósfera (modelo de vacío aplicable). | VALIDADO |
| `aterrizaje_04_contacto_suave_europa_1920x1080.png` | 1920×1080 | Cálculo de la ley de frenado en Europa. | Veredicto: «ATERRIZAJE SUAVE SEGÚN EL MODELO». Duración: T+4,096 s; velocidad residual: 1.28 m/s vertical; propelente consumido: 2,517 kg. | VALIDADO |
| `aterrizaje_05_escenario_fallido_impacto_o_combustible_1920x1080.png` | 1920×1080 | Inyección intencionada de combustible insuficiente (1,200 kg en lugar de 4,200 kg) en la Luna. | Veredicto de fallo documentado: «COMBUSTIBLE AGOTADO» en T+3,695 s seguido de «IMPACTO» contra la superficie a 78.0 m/s vertical y 81.2 m/s horizontal. | VALIDADO (Mecanismo de detección de fallos) |

---

## 10. Misiones Interplanetarias (`10_Misiones_Interplanetarias/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `interplanetaria_01_porkchop_tierra_marte_1920x1080.png` | 1920×1080 | Búsqueda de ventanas Tierra–Marte 2026–2035 (`#ip-search`). | Mapa de contornos de energía (*Porkchop plot*), curvas de $C_3$, solución óptima resaltada (salida: 2028-11-30, llegada: 2029-10-12, $C_3 = 8.996\text{ km}^2/\text{s}^2$, $v_\infty = 2.65\text{ km/s}$), órbita polar heliocéntrica y tabla de mínimos locales. | VALIDADO INDEPENDIENTEMENTE (Gemini Stage 12G) |
| `interplanetaria_02_transferencia_tierra_venus_1920x1080.png` | 1920×1080 | Búsqueda de ventanas Tierra–Venus con rango sugerido. | Gráfico de oportunidades para transferencia interior; arcos elípticos de Lambert de menor duración (~140 días) con $C_3$ característico. | VALIDADO (Lambert heliocéntrico) |
| `interplanetaria_03_transferencia_tierra_jupiter_1920x1080.png` | 1920×1080 | Búsqueda de ventanas Tierra–Júpiter (2028–2032). | Trayectoria heliocéntrica de largo alcance (~1,000 días de vuelo); visualización de posiciones planetarias reales al momento de salida y llegada. | VALIDADO (Efemérides 2026–2045) |

---

## 11. Misiones Integradas — Etapa 13 (`11_Misiones_Integradas_Etapa13/`)
> [!IMPORTANT]
> **Aviso de Estado Académico:** Esta etapa se encuentra **implementada y verificada localmente** mediante 259 pruebas unitarias automáticas, pero permanece **pendiente de auditoría científica independiente**.

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `integrada_01_escenario_A1_marte_captura_1920x1080.png` | 1920×1080 | Cálculo del Escenario A1: Misión completa Tierra–Marte con captura orbital en apoapsis de 33,000 km. | Secuencia de 13 tramos: salida heliocéntrica, crucero balístico, entrada en SOI marciana y encendido de frenado impulsivo ($\Delta v = 1,184.5\text{ m/s}$). Veredicto: «VIABLE SEGÚN EL MODELO». | Implementada / Pendiente de auditoría independiente |
| `integrada_02_escenario_A1_grafico_planetocentrico_1920x1080.png` | 1920×1080 | Detalle del gráfico planetocéntrico de la elipse de captura capturada en Marte (`#im-plot`). | Representación en el plano orbital: hipérbola de aproximación, punto de periapsis donde ocurre el frenado y órbita elíptica final cerrada. | Implementada / Pendiente de auditoría independiente |
| `integrada_03_escenario_B2_sobrevuelo_hiperbolico_1920x1080.png` | 1920×1080 | Cálculo del Escenario B2: Nave pesada (50,000 kg) hacia Júpiter con propelente insuficiente para frenado. | Veredicto: «SIN CAPTURA · SOBREVUELO HIPERBÓLICO; NO VIABLE para el escenario». Demuestra que el simulador no asume capturas automáticas ficticias. | Implementada / Pendiente de auditoría independiente |
| `integrada_04_escenario_B1_jupiter_europa_descenso_1920x1080.png` | 1920×1080 | Cálculo del Escenario B1: Gran Tour Joviano (Tierra → Júpiter → Inserción JOI → Transferencia a Europa → Descenso). | Cadena cinemática de 13 fases completa; balance de propelente y consumo en cada quemado; veredicto de viabilidad positiva según el modelo. | Implementada / Pendiente de auditoría independiente |
| `integrada_05_escenario_B1_grafico_planetocentrico_1920x1080.png` | 1920×1080 | Gráfico planetocéntrico joviano del Escenario B1 (`#im-plot`). | Arcos orbitales en el sistema joviano: inserción en Júpiter, arco de resonancia hacia Europa e interfaz de descenso. | Implementada / Pendiente de auditoría independiente |

---

## 12. Centro de Control de Misión (`12_Centro_de_Mision/`)

| Archivo | Resolución | Descripción y Acción Realizada | Resultado Observado | Estado de Validación |
|---|---|---|---|---|
| `centro_01_lanzamiento_ascenso_hud_1920x1080.png` | 1920×1080 | Reproducción del lanzamiento terrestre en el Centro de Misión (`#lab-mission-center`). | HUD superior contextualizado («Lanzamiento terrestre», fase «Ascenso», altitud, velocidad, masa, propelente); cámara de seguimiento del cohete. | VALIDADO (UI Stage 14) |
| `centro_02_descenso_lunar_contacto_1920x1080.png` | 1920×1080 | Reproducción del descenso lunar en el instante de contacto. | Activación de la «Cámara local» a ras de suelo; módulo sobre la superficie lunar; HUD en fase «Contacto y evaluación». | VALIDADO |
| `centro_03_interplanetaria_trayectoria_helio_1920x1080.png` | 1920×1080 | Vista heliocéntrica del crucero interplanetario de la misión B1. | Sonda desplazándose a lo largo del arco de Lambert; posiciones dinámicas de la Tierra y Júpiter en sus órbitas. | VALIDADO |
| `centro_04_B1_entrada_soi_jupiter_1920x1080.png` | 1920×1080 | Salto al evento «Entrada en la esfera de influencia de Júpiter». | Conmutación automática del marco de referencia: del centro solar al baricentro joviano; actualización de distancias planetocéntricas. | Implementada (13/14) |
| `centro_05_B1_insercion_orbital_joi_1920x1080.png` | 1920×1080 | Evento «Inserción en órbita de Júpiter · inicio» (JOI). | HUD destacando la fase de encendido de frenado; telemetría de empuje y variación de velocidad en tiempo real. | Implementada (13/14) |
| `centro_06_B1_vista_amplia_inmersiva_1920x1080.png` | 1920×1080 | Activación del modo «Vista amplia» (`[data-mc-panel="wide"]`). | Colapso de los paneles laterales de control y telemetría; maximización del viewport 3D interactivo a pantalla completa. | VALIDADO (UI Stage 14) |
| `centro_07_B1_barra_transporte_eventos_1920x1080.png` | 1920×1080 | Interacción con la barra de reproducción en la escena (`.mc-timeline-bar`). | Avance paso a paso (`[data-tr="next"]`), botones de reproducción/pausa, visualización de marcas de hitos (*ticks*) y tiempo transcurrido. | VALIDADO (UI Stage 14) |
| `centro_08_B1_soi_europa_contexto_1920x1080.png` | 1920×1080 | Salto al evento «Entrada en la esfera de influencia de Europa». | Transición del marco joviano al marco satelital de Europa; reescalado de cámara centrado en el satélite galileano. | Implementada (13/14) |
| `centro_09_B1_contacto_europa_camara_local_1920x1080.png` | 1920×1080 | Final de la misión B1: contacto suave en la superficie de Europa con cámara local. | Módulo asentado en la superficie helada de Europa; HUD confirmando contacto suave y finalización de la reproducción interactiva. | Implementada (13/14) |

---

## 13. Adaptabilidad y Responsividad (`13_Responsive/`)

| Archivo | Resolución / Dispositivo | Elementos Verificados | Resultado de Adaptabilidad | Estado |
|---|---|---|---|---|
| `responsive_01_escritorio_1920x1080.png` | 1920×1080 (Desktop FHD) | Sistema Solar, dock de transporte, inspector lateral y selector de áreas. | Disposición espaciosa, textos legibles sin recortes, jerarquía visual óptima. | APROBADO |
| `responsive_02_portatil_1600x900.png` | 1600×900 (Laptop WXGA+) | Hangar y panel de piezas con viewport 3D. | Paneles translúcidos ajustados; proporción de la escena preservada. | APROBADO |
| `responsive_03_portatil_1366x768.png` | 1366×768 (Laptop HD estándar) | Centro de Misión y menús de control. | Menús compactados verticalmente; sin barras de scroll horizontal parásitas. | APROBADO |
| `responsive_04_tableta_768x1024.png` | 768×1024 (iPad vertical) | Cabecera del simulador, selector de modos e inspector. | El botón «Áreas» conmuta a modo icono para evitar solapamientos; paneles apilados en columna. | APROBADO |
| `responsive_05_movil_390x844.png` | 390×844 (iPhone 12/13/14) | Vista móvil completa del simulador y navegación del laboratorio. | Botón hamburguesa accesible; cabecera reducida a 2 columnas; controles táctiles operativos. | APROBADO |
| `responsive_06_movil_320x568.png` | 320×568 (iPhone SE 1.ª gen) | Ancho crítico mínimo de pantalla. | Ausencia de desbordamiento horizontal (`scrollWidth === clientWidth`); tipografía legible en tamaño mínimo (11-12px). | APROBADO CON OBSERVACIONES |

---

## 14. Defectos y Observaciones Visuales (`14_Defectos/`)

| Archivo | Severidad | Descripción del Defecto / Observación | Causa Técnica y Recomendación |
|---|---|---|---|
| `defecto_01_truncamiento_sonda_activa_movil.png` | **Menor** | En resoluciones móviles estrechas ($\le 390\text{ px}$), la cadena de estado de la sonda activa (`#lab-ctx-design`) se trunca con elipsis (`...`), ocultando el desglose de masa seca y $\Delta v$. | La regla CSS `text-overflow: ellipsis` previene el desbordamiento horizontal, lo cual es correcto, pero se recomienda añadir un indicador táctil o tooltip accesible para consultar los valores completos en pantalla reducida. |
| `defecto_02_ajuste_veredicto_largo.png` | **Observación** | En veredictos con justificaciones científicas largas (p. ej. sobrevuelo hiperbólico de B2), el contenedor de veredicto requiere múltiples líneas de texto denso. | Se recomienda estructurar los veredictos extensos en una píldora de estado concisa («NO VIABLE») acompañada de un acordeón `<details>` desplegable para los motivos físicos detallados. |

---

*Fin del índice de evidencias visuales. Compilado de forma independiente para el Tercer Avance del Simulador de Sondas Espaciales.*
