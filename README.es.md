# Jobdar

[🇺🇸 English](README.md) · **🇲🇽 Español**

Un centro de búsqueda de empleo bilingüe (inglés estadounidense / Español) en EE. UU. para
**recién graduados y personas que se incorporan al mundo laboral** — incluidas las que **no
tienen un título universitario**. **Adaptable por región** (Medio Oeste por defecto; cambia a
Sur, Suroeste, Noreste, Oeste o todo el país) y **de nivel inicial por defecto** (cambia a nivel
intermedio, y senior cuando tú lo elijas).

Jobdar escanea las páginas de empleo de las empresas (con soporte de primera clase para
**Workday** e **iCIMS**, los ATS que dominan a las grandes empresas de EE. UU.), evalúa cada
puesto frente a tu currículum, adapta un CV y una carta de presentación compatibles con ATS, y
registra cada postulación.

> **Estado:** Fases 0–7 **completas** — **Jobdar CLI `1.10.0`**: núcleo bilingüe, escáneres Workday /
> iCIMS / Greenhouse verificados en vivo, selectores de nivel y región, el asistente `jobdar init` y una
> tubería **descubrir → evaluar → construir** — `scan` encuentra y filtra puestos (nunca los puntúa), el
> modelo (`jobdar eval`) puntúa la compatibilidad (0–5 → Postular / Investigar / Descartar) y la registra,
> visible en `jobdar tui`; más un currículum ATS adaptado (`jobdar pdf`). Pendiente para 1.0:
> publicar en npm + marketplace, y luego una beta cerrada. Consulta **[ROADMAP.md](ROADMAP.md)** para el
> plan completo y **[CHANGELOG.md](CHANGELOG.md)** para lo ya entregado.

## Tus datos se quedan en local

Tu currículum y tu historial se quedan **en tu dispositivo** (o en tu navegador, en la aplicación
web). El modelo que hace el trabajo es **intercambiable**:

- **Modelo en el dispositivo por defecto** — privado, sin clave de API, sin costo (ideal para
  personas no técnicas).
- **Complemento de API (opcional)** — trae tu propia clave para mayor precisión; solo se envía la
  porción mínima, con retención cero.
- **Nube confidencial** — una opción posterior para calidad de nube que el operador no puede leer.

El escáner solo toca ofertas de empleo **públicas** — nunca tu currículum — así que **no alojamos
datos personales**. Eso protege tu privacidad y limita nuestra responsabilidad. Consulta
**[SECURITY.md](SECURITY.md)** y **[Legal y uso responsable](docs/legal.md)** para conocer todo el enfoque.

## Dos superficies, un mismo motor

- **CLI (la columna vertebral)** — local primero, para personas técnicas, se ejecuta con tu propia
  CLI/API de IA. Sale primero.
- **Aplicación web (después — [Fase 9](ROADMAP.md#phase-9--web-app-for-non-technical-users-future))**
  — una app alojada, multiplataforma y bilingüe para personas no técnicas: sube un currículum y
  recibe orientación hacia empleos que encajan, con poco esfuerzo. La evaluación se ejecuta **en
  tu navegador** por defecto, así que el currículum nunca sale de tu dispositivo. Objetivos:
  **facilidad de uso** y **precisión**.

## Uso de la CLI

`jobdar` es un solo comando con subcomandos sencillos:

```bash
jobdar init           # asistente de configuración bilingüe (región, nivel, perfil)
jobdar scan           # escanea portales en busca de nuevos puestos (sin modelo)
jobdar seed --region midwest --write   # agrega empleadores reales de tu región
jobdar eval <url>     # evalúa un puesto frente a tu currículum
jobdar pipeline       # escanear -> evaluar -> registrar, de principio a fin
jobdar pdf [empresa]  # currículum adaptado para ATS → output/ (HTML, +PDF con Playwright)
jobdar tracker        # consulta tus postulaciones
jobdar dashboard      # panel web local de tu flujo
jobdar tui            # panel interactivo en la terminal
jobdar doctor         # revisa tu configuración
```

Instala con `npm i -g jobdar` (o usa `npx jobdar` sin instalar). Dentro de una CLI de IA como
Claude Code, las mismas acciones están disponibles como el comando de barra `/jobdar scan`,
`/jobdar eval`, etc.

¿Nuevo/a por aquí? La **[guía Empezar](docs/getting-started.es.md)** es la ruta de 5 minutos desde la
instalación hasta tu primer escaneo — `jobdar init` te guía en inglés o español, sin editar YAML.

## Para quién es Jobdar

1. **Recién graduados** — personas con título que buscan su primer puesto profesional, en sus 20.
2. **Personas que se incorporan al mundo laboral** — incluidas las que no tienen título, quienes
   cambian de carrera y quienes buscan empleo por primera vez.

**El nivel inicial es el predeterminado**, pero los niveles son **ajustables**: incluye puestos de
nivel intermedio, o activa senior (que entonces se clasifica con normalidad, sin penalización).

## Por qué Jobdar es diferente

- **Inglés estadounidense + español**, paridad completa (inglés primario) — en la CLI y la app web.
- **Escáner para grandes empresas de EE. UU.** — Workday + iCIMS primero, más Greenhouse/Lever/Ashby.
- **Flujo descubrir → evaluar** — `scan` encuentra y filtra puestos pero **nunca los puntúa**; el modelo (`jobdar eval`) puntúa la compatibilidad **0–5** con tu currículum y registra una banda **Postular / Investigar / Descartar**. `jobdar tui` muestra los puestos descubiertos como *pendiente eval* hasta que el modelo los puntúa.
- **Ajuste de región** — Medio Oeste por defecto; cambia a Noreste/Sureste/Suroeste/Oeste/todo el
  país y las semillas, los filtros de ubicación y la búsqueda se adaptan.
- **Ajuste de nivel** — inicial por defecto; intermedio de primera clase; senior opcional (se
  clasifica con normalidad cuando se elige).
- **Una vía dedicada sin título** — resalta puestos basados en habilidades, de aprendizaje y con
  "o experiencia equivalente".
- **Privado por diseño** — datos en local + modelo en el dispositivo por defecto; nunca alojamos
  tu currículum.
- **Fácil para cualquiera** — un asistente de configuración guiado y bilingüe para la CLI hoy; una
  app web amigable para personas no técnicas después.

## Próximos pasos

La línea de corte del MVP del roadmap (CLI): cimientos y marca → núcleo en inglés estadounidense →
proveedor Workday → el ajuste de nivel (inicial por defecto) + afinado sin título → el ajuste de
región (Medio Oeste sembrado primero) → el asistente de configuración. El backend de modelo local
intercambiable y la app web llegan después de la 1.0.
