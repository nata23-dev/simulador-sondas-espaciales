# Matriz de capacidades de misión multicuerpo

Generada en la Etapa 12F a partir de los catálogos reales del proyecto (`SOLAR_SYSTEM_GM_CATALOG`, `PlanetaryMoons.js`, `Ephemerides.js`) mediante `src/lab/CelestialBodyMissionRegistry.js`. La interfaz y las pruebas leen el mismo registro: esta tabla es su reflejo documental, no una lista independiente.

**Niveles.** **OPERATIVO**: implementado y comprobado con un escenario de integración en pruebas locales (sigue pendiente la auditoría independiente de Gemini). **EXPERIMENTAL**: el mismo motor se habilita por configuración con datos suficientes, sin escenario dedicado. **PENDIENTE**: falta implementar o validar una capacidad. **NO APLICABLE**: la operación no corresponde físicamente al cuerpo.

## 1. Cuerpos disponibles (19)

Sol, 8 planetas con efemérides heliocéntricas locales (Mercurio, Venus, Tierra, Marte, Júpiter, Saturno, Urano, Neptuno) y 10 satélites con efemérides planetocéntricas (Luna, Ío, Europa, Ganímedes, Calisto, Titán, Encélado, Titania, Miranda, Tritón). El catálogo **no contiene** planetas enanos, asteroides ni cometas: no se afirma cobertura de ellos.

| Cuerpo | ID | Principal | GM (km³/s²) | Procedencia GM | Radio medio (km) | Atmósfera (cualitativa) | Descenso propulsado |
|---|---|---|---|---|---|---|---|
| Sol | 10 | — | 132 712 440 041,28 | DE440 | 695 700 | sin superficie sólida | NO APLICABLE |
| Mercurio | 199 | Sol | 22 031,868551 | DE440 | 2 439,4 | exosfera despreciable | EXPERIMENTAL (el módulo demostrativo no tiene empuje/peso suficiente) |
| Venus | 299 | Sol | 324 858,592 | DE440 | 6 051,8 | densa | PENDIENTE (descenso atmosférico) |
| Tierra | 399 | Sol | 398 600,435507 | DE440 | 6 371,0084 | densa | PENDIENTE (el ascenso existe en 12E; el descenso atmosférico no) |
| Marte | 499 | Sol | 42 828,375816 (sistema) | DE440 | 3 389,5 | tenue pero relevante | PENDIENTE (descenso atmosférico) |
| Júpiter | 599 | Sol | 126 712 764,1 (sistema) | DE440 | 69 911 | envoltura gaseosa | NO APLICABLE (futura «sonda de entrada atmosférica») |
| Saturno | 699 | Sol | 37 940 584,84 (sistema) | DE440 | 58 232 | envoltura gaseosa | NO APLICABLE (ídem) |
| Urano | 799 | Sol | 5 794 556,4 (sistema) | DE440 | 25 362 | envoltura helada | NO APLICABLE (ídem) |
| Neptuno | 899 | Sol | 6 836 527,10 (sistema) | DE440 | 24 622 | envoltura helada | NO APLICABLE (ídem) |
| Luna | 301 | Tierra | 4 902,800118 | DE440 | 1 737,4 | exosfera despreciable | **OPERATIVO** |
| Ío | 501 | Júpiter | 5 959,91547 ±0,00135 | JPL SSD satélites | 1 821,49 | extremadamente tenue | EXPERIMENTAL |
| Europa | 502 | Júpiter | 3 202,7121 ±0,00181 | JPL SSD satélites | 1 560,8 | exosfera tenue | **OPERATIVO** |
| Ganímedes | 503 | Júpiter | 9 887,83275 ±0,00247 | JPL SSD satélites | 2 631,2 | exosfera tenue | EXPERIMENTAL (comprobado en pruebas P; sin escenario dedicado en la interfaz) |
| Calisto | 504 | Júpiter | 7 179,2834 ±0,00324 | JPL SSD satélites | 2 410,3 | exosfera tenue | EXPERIMENTAL |
| Titán | 606 | Saturno | 8 978,1371 ±0,00025 | JPL SSD satélites | 2 574,76 | densa de N₂ | PENDIENTE (descenso atmosférico) |
| Encélado | 602 | Saturno | 7,21037 ±0,00009 | JPL SSD satélites | 252,1 | sin atmósfera permanente | EXPERIMENTAL (exige un módulo con empuje mínimo bajo; ver §3) |
| Titania | 703 | Urano | 226,9 ±4,1 | JPL SSD satélites | 788,9 | ninguna significativa | EXPERIMENTAL (GM con ≈2 % de incertidumbre) |
| Miranda | 705 | Urano | 4,3 ±0,2 | JPL SSD satélites | 235,8 | ninguna significativa | EXPERIMENTAL (GM con ≈5 % de incertidumbre) |
| Tritón | 801 | Neptuno | 1 428,49546 ±0,61603 | JPL SSD satélites | 1 352,6 | N₂ muy tenue (≈ Pa) | PENDIENTE (atmósfera tenue sin analizar) |

Notas de procedencia:

- «DE440» es `SOLAR_SYSTEM_GM_CATALOG`. Para Marte y los planetas gigantes el catálogo guarda el GM del **sistema planetario** concentrado en el centro; no sirve para descender sobre un satélite de ese sistema.
- «JPL SSD satélites» es la tabla `SATELLITE_GM_JPL` de 12F, leída de <https://ssd.jpl.nasa.gov/sats/phys_par/> el 2026-11-17; **requiere verificación independiente**. Los radios de esa página coinciden con `PlanetaryMoons.js`.
- La columna «Atmósfera» es una **clasificación cualitativa** del proyecto (no hay modelo atmosférico numérico salvo la Tierra, 12E). Decide si el vacío es defendible; no aporta valores físicos.

## 2. Efemérides, marcos y cobertura

| Grupo | Fuente | Marco | Tiempo | Cobertura local |
|---|---|---|---|---|
| Planetas | `public/data/efemerides-2026.json` (Horizons) | ICRF eclíptico J2000, heliocéntrico | TDB | 2026-10-01 → 2026-11-01 (1 día) |
| Satélites | `moons-2026-10.json`, `moons-stage6-2026-10.json` (Horizons) | ICRF eclíptico J2000, planetocéntrico | TDB | 2026-10-01 → 2026-11-01 (1 h) y ventanas históricas Voyager |
| Descenso 12F | simulación local | inercial local del cuerpo, ejes arbitrarios | tiempo de simulación (s) | sin efemérides; **no conectado con ICRF** |
| Planetas 12G | `public/data/interplanetary/*.json` (Horizons, DE441/mar099/jup365/sat441l/ura184/nep098) | ICRF eclíptico J2000, heliocéntrico (500@10) | TDB | 2026-11-18 → 2046-01-01 (1 d internos, 4 d externos). [Cobertura](INTERPLANETARY_EPHEMERIS_COVERAGE.md) |
| Baricentros 5–8 (13) | `interplanetary/ip-barycenters-outer-2026-2046.json` (Horizons, DE441) | ICRF eclíptico J2000, heliocéntrico (500@10) | TDB | 2026-11-18 → 2046-01-01 (4 d; error ≤ 3,2 m frente a Horizons) |
| Galileanos por ventana (13) | `interplanetary/galilean-moons-jsb-2031-2032.json` (Horizons) | ICRF eclíptico J2000, centrado en el baricentro 5 (500@5) | TDB | **solo 2031-08-01 → 2032-06-01** (1–6 h). [13](STAGE13_INTEGRATED_MISSIONS.md#3-datos-científicos) |

Rotación, eje polar y orientación IAU **no existen en el proyecto** para ningún cuerpo: `rotation: null` en todos los perfiles. Con rotación nula, la velocidad respecto al suelo es la velocidad en el marco local (error del orden de metros por segundo para cuerpos de rotación lenta). El motor ya implementa `v_rel = v − ω × r` y está probado con un perfil sintético.

## 3. Operaciones por cuerpo

| Operación | Estado | Detalle |
|---|---|---|
| Ascenso desde la Tierra (12E) | OPERATIVO | Lanzador demostrativo; atmósfera US-1976 con transición suave (12E.1). |
| Empuje finito en órbita terrestre (12D) | OPERATIVO | Tierra únicamente: contiene constantes terrestres (ver arquitectura, §22). |
| Planificación Tierra–Luna (12B) | OPERATIVO | Restringido Tierra–Luna. |
| Descenso propulsado en vacío (12F) | OPERATIVO en Luna y Europa; EXPERIMENTAL en Mercurio, Ío, Ganímedes, Calisto, Encélado, Titania, Miranda | Un solo motor físico; depende de GM, radio y del módulo. |
| Descenso atmosférico (entrada, calentamiento, paracaídas, propulsión terminal) | PENDIENTE | Venus, Tierra, Marte, Titán; Tritón tras analizar su atmósfera. |
| Sonda de entrada atmosférica | PENDIENTE (categoría futura) | Júpiter, Saturno, Urano, Neptuno. |
| Lanzamiento desde otros cuerpos | PENDIENTE | Luna y Marte exigirían generalizar `Launch*.js` (§20.4 del informe). |
| Transferencia heliocéntrica Tierra → planeta (12G) | OPERATIVO (aprobado por Gemini) | Lambert cero revoluciones con efemérides Horizons; C3, v∞, Δv ideal de inyección. Cónica de dos cuerpos, sin perturbaciones ni asistencias. [12G](STAGE12G_INTERPLANETARY_PLANNING.md) |
| Encuentro planetario: SOI, hipérbola, plano B, periapsis apuntado (13) | OPERATIVO (pendiente de auditoría) | Cónicas parcheadas; todos los planetas (gigantes al baricentro). [13](STAGE13_INTEGRATED_MISSIONS.md) |
| Captura con empuje finito en planeta o satélite (13) | EXPERIMENTAL | Retrógrada continua, corte por apoapsis, agotamiento y sobrevuelo registrados. Módulo de propulsión ilustrativo. |
| Transferencia planetocéntrica y captura en un satélite + descenso 12F conectado (13) | EXPERIMENTAL | Solo galileanos en 2031-08 → 2032-06; referencia Tierra → Júpiter → Europa. Satélites de Saturno, Urano y Neptuno: PENDIENTE (sin ventanas). |
| Inyección desde el lanzamiento 12E | PENDIENTE | La inyección interplanetaria es una condición inicial. |
| Superficie, instrumentos, muestras | PENDIENTE | Sin modelo de superficie. |

Limitaciones de la combinación módulo–cuerpo (resultados de las pruebas con el módulo demostrativo, 16 kN, acelerador mínimo 10 %):

- **Mercurio** (g = 3,70 m/s²): empuje/peso 0,70 al iniciar el frenado → **EMPUJE INSUFICIENTE**.
- **Encélado** (g = 0,113 m/s²): el empuje mínimo con la masa final (0,776 m/s²) supera la gravedad → el guiado de lazo cerrado no es aplicable y se rechaza con explicación. Un módulo de 1 200 N sí aterriza allí.
- **Titania y Miranda**: igual razón (gravedad menor que el empuje mínimo).

## 4. Datos que faltan para ampliar operaciones

1. Rotación, eje y orientación IAU de cada cuerpo (período, polo, meridiano origen) para marcos fijos al cuerpo y coordenadas superficiales.
2. Modelos atmosféricos de Venus, Marte, Titán (y Tritón) y coeficientes aerodinámicos de entrada.
3. Verificación independiente de la tabla de GM de satélites y GM de cuerpos individuales de los sistemas de Marte y de los planetas gigantes.
4. Orientación de cuerpos para anclar simulaciones locales a TDB/ICRF (las efemérides planetarias amplias existen desde 12G; en 13 solo hay una ventana de satélites galileanos 2031-08 → 2032-06).
5. Modelo de terreno y de patas/impacto para dictaminar supervivencia.
6. Perturbaciones: J2/no esfericidad, terceros cuerpos (marea del planeta anfitrión en los satélites), presión de radiación.
