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

> **Estado:** Fases 0–7, 5.5, 7.7, 7.8, 8b, 8a, 8c, 8e + 8f **completas**, **Fase 10 L0–L5 entregada** —
> **Jobdar CLI `1.48.0`** + **app `1.17.0`**: núcleo bilingüe; **seis escáneres
> verificados en vivo** (Workday, iCIMS, Greenhouse, Lever, Ashby + un lector JSON-LD opcional) más un
> agregador federal **USAJobs** opcional (con tu propia clave gratuita); selectores
> de nivel y región y el asistente `jobdar init`; la tubería completa **descubrir → prefiltrar → evaluar →
> registrar → construir** — `scan` encuentra y filtra puestos (nunca los puntúa), `jobdar prescreen`
> **filtra y ordena la cola sin gastar tokens** (los requisitos duros descartan con una razón citada, nunca
> en silencio), el modelo (`jobdar eval`) puntúa la compatibilidad (0–5 → Postular / Investigar / Descartar)
> y la registra — un puesto o **lotes con `--next N`** (5/10/15… tope de 50) con una **barra de progreso
> de radar**, y cada evaluación termina indicando **dónde está tu informe de empleos** — tú avanzas el
> estado (`a` en la TUI o `jobdar tracker --set`), `jobdar outreach` encuentra
> el **contacto cálido** y mantiene los seguimientos corteses por construcción, y `jobdar pdf` construye el
> currículum ATS adaptado; una TUI desplazable con cursor + un panel web con analíticas; frescura
> (`posted` / `first_seen`, `scan --prune`). Y la **app de iPhone ya ejecuta toda la tubería
> completamente en el teléfono** — escaneo nativo, evaluación/adaptación/contacto en el dispositivo vía
> llama.rn, un gestor de modelos integrado — **sin Mac, sin servidor; el siguiente paso es una beta por
> TestFlight**. Pendiente para el 1.0 de la CLI: publicar en npm + marketplace, y luego una beta cerrada.
> Consulta **[ROADMAP.md](ROADMAP.md)** para el plan completo y
> **[CHANGELOG.md](CHANGELOG.md)** para lo ya entregado.

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

**Tu perfil nunca llega a un repositorio.** `config/profile.yml` (nombre, área metropolitana, salario
objetivo — creado por `jobdar init` a partir de tus respuestas o tu currículum) y `config/portals.yml`
(las empresas que sigues) están **en .gitignore y excluidos del paquete de npm**; el repositorio solo
incluye plantillas `*.example.yml` sin datos personales. Tu currículum (`data/cv.md`), tu clave de API y
tu flujo viven en el directorio `data/`, también ignorado por git.

**Portátil entre dispositivos.** Todos tus datos viven en un único *directorio de datos del usuario*:
las instalaciones nuevas (incluido el instalador de un comando) usan `~/.jobdar` — separado del código,
así las actualizaciones nunca lo borran — mientras que un clon que ya tiene `config/profile.yml` guarda
todo dentro de esa carpeta (una unidad autónoma y móvil), y **`JOBDAR_HOME`** lo reubica donde quieras.
Cambiar de equipo = copiar una carpeta; `jobdar doctor` muestra el directorio activo. Las tablas de
idioma y el catálogo de empleadores viajan con el código, así que funcionan desde cualquier ubicación.

## Tres superficies, un mismo motor

- **CLI (disponible hoy — la columna vertebral)** — local primero. Escanear, prefiltrar y registrar no
  necesitan modelo; `jobdar backend --install` agrega el modelo local privado y gratuito para
  evaluar/adaptar, o usa tu propia CLI/API de IA.
- **App de iPhone (beta pronto — la forma más fácil de probar Jobdar)** — toda la tubería corre **en el
  teléfono**: escanear → prefiltrar → evaluar → adaptar → contactar, con el modelo descargado dentro de
  la app. Sin Mac, sin servidor, sin cuenta; tu currículum nunca sale del dispositivo. El siguiente paso
  es una **beta por TestFlight**
  ([Fase 10](ROADMAP.md#phase-10--fully-local-iphone-active-direction-locked-2026-07-08)); Android llega
  después con la misma base.
- **Aplicación web (después — [Fase 9](ROADMAP.md#phase-9--web-and-mobile-apps-future--post-10),
  jobdar.ai)** — una app alojada, multiplataforma y bilingüe para personas no técnicas: sube un currículum
  y recibe orientación hacia empleos que encajan, con poco esfuerzo. La evaluación se queda **de tu lado**
  por defecto, así que el currículum nunca sale de tu dispositivo. Objetivos: **facilidad de uso** y
  **precisión**.

## Uso de la CLI

`jobdar` es un solo comando con subcomandos sencillos:

```bash
jobdar init           # asistente de configuración bilingüe (región, nivel, perfil)
jobdar scan           # escanea portales en busca de nuevos puestos (sin modelo)
jobdar seed --region midwest --write   # agrega empleadores reales de tu región
jobdar prescreen      # filtra y ordena los puestos pendientes por probabilidad (sin modelo)
jobdar eval <url>     # evalúa un puesto frente a tu currículum
jobdar eval --next 10 # puntúa automáticamente los 10 mejores pendientes (5, 10, 15 … hasta 50) — con barra de radar
jobdar pipeline       # escanear -> evaluar -> registrar, de principio a fin
jobdar tailor [empresa] # IA: resumen de CV + carta para el puesto (fundamentado, modelo local)
jobdar pdf [empresa]  # currículum adaptado para ATS → output/ (HTML, +PDF con Playwright)
jobdar outreach <url> # encuentra personas a quienes contactar; seguimientos corteses, aplicados
jobdar tracker        # consulta tus postulaciones
jobdar dashboard      # panel web local de tu flujo
jobdar tui            # panel interactivo en la terminal
jobdar doctor         # revisa tu configuración
```

**Instalación (funciona hoy):**

```bash
curl -fsSL https://raw.githubusercontent.com/samdotson61/jobdar-app/main/install.sh | bash
```

Windows (PowerShell): `irm https://raw.githubusercontent.com/samdotson61/jobdar-app/main/install.ps1 | iex`.
¿Sin instalador? `git clone https://github.com/samdotson61/jobdar-app && cd jobdar-app && npm install &&
node bin/jobdar init`. (`npm i -g jobdar` / `npx jobdar` llegan con la publicación 1.0 en npm — consulta
[RELEASING.md](RELEASING.md).) Dentro de una CLI de IA como Claude Code, las mismas acciones están
disponibles como el comando de barra `/jobdar scan`, `/jobdar eval`, etc.

¿Nuevo/a por aquí? La **[guía Empezar](docs/getting-started.es.md)** es la ruta de 5 minutos desde la
instalación hasta tu primer escaneo — `jobdar init` te guía en inglés o español, sin editar YAML.

## Para quién es Jobdar

1. **Recién graduados** — personas con título que buscan su primer puesto profesional, en sus 20.
2. **Personas que se incorporan al mundo laboral** — incluidas las que no tienen título, quienes
   cambian de carrera y quienes buscan empleo por primera vez.

**El nivel inicial es el predeterminado**, pero los niveles son **ajustables**: incluye puestos de
nivel intermedio, o activa senior (que entonces se clasifica con normalidad, sin penalización).

## Por qué Jobdar es diferente

- **Inglés estadounidense + español**, paridad completa (inglés primario) — en la CLI y las apps.
- **Escáner para grandes empresas de EE. UU.** — Workday + iCIMS primero, más Greenhouse/Lever/Ashby.
- **Flujo descubrir → prefiltrar → evaluar** — `scan` encuentra y filtra puestos pero **nunca los puntúa**; `jobdar prescreen` descarta requisitos duros (años exigidos, autorización de seguridad activa, título obligatorio) **con una razón citada — nunca en silencio** — y ordena el resto por coincidencia de habilidades + frescura; el modelo (`jobdar eval`) puntúa la compatibilidad **0–5** con tu currículum y registra una banda **Postular / Investigar / Descartar**. `jobdar tui` muestra los puestos descubiertos como *pendiente eval* hasta que el modelo los puntúa.
- **Un contacto cálido vale más que una solicitud fría** — `jobdar outreach` construye enlaces de búsqueda de personas en LinkedIn (tú navegas y eliges; Jobdar nunca extrae datos ni envía nada), los borradores los envías tú, y la cadencia cortés — 2 personas por puesto, UN seguimiento tras 5+ días hábiles, y se acabó — la aplica el código.
- **Ajuste de región** — Medio Oeste por defecto; cambia a Noreste/Sureste/Suroeste/Oeste/todo el
  país y las semillas, los filtros de ubicación y la búsqueda se adaptan.
- **Ajuste de nivel** — inicial por defecto; intermedio de primera clase; senior opcional (se
  clasifica con normalidad cuando se elige).
- **Una vía dedicada sin título** — resalta puestos basados en habilidades, de aprendizaje y con
  "o experiencia equivalente".
- **Interruptor de habilidades transferibles** — para quienes cambian de carrera y recién egresan:
  acredita habilidades adyacentes reales frente a los requisitos del puesto y trata un requisito de
  "X+ años en [campo]" como algo que se puede cubrir, no un muro — sin bajar el listón
  (`transferable_skills` / `eval --transferable`).
- **Privado por diseño** — datos en local + modelo en el dispositivo por defecto; nunca alojamos
  tu currículum.
- **Divertido, nunca falso** — el barrido de radar 📡 anima cada paso largo (escanear, prefiltrar,
  evaluar, adaptar, borradores de contacto, calibrar, render de PDF): recuentos honestos que crecen al
  llegar los resultados, ETA medidos y tiempo transcurrido real — nunca un porcentaje inventado. El
  mismo lenguaje de radar llegará a la app.
- **Fácil para cualquiera** — un asistente de configuración guiado y bilingüe para la CLI hoy; la app de
  iPhone totalmente en el dispositivo (beta por TestFlight pronto), y después una app web amigable, para
  personas no técnicas.

## Próximos pasos

La línea de corte del MVP ya está entregada (mira el estado de arriba). Lo que queda, en orden: la **beta
por TestFlight** de la app de iPhone ([Fase 10 L6](ROADMAP.md#phase-10--fully-local-iphone-active-direction-locked-2026-07-08)
— pasos de cuenta), la **publicación en npm + marketplace** y una **beta cerrada** de la CLI (las
decisiones de nombre / organización / licencia están en [RELEASING.md](RELEASING.md)), la recalibración
del evaluador con 👍/👎 reales (`jobdar calibrate --feedback`, al acumular N≥50–100 etiquetas), y luego la
**app web (jobdar.ai)** y **Android** con la misma base.
