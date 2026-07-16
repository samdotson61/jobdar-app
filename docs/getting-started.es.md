# Empezar con Jobfaro

[🇺🇸 English](getting-started.md) · [🇲🇽 Español](getting-started.es.md)

Jobfaro encuentra empleos de nivel inicial en EE. UU. que encajan contigo, mantiene tus datos en tu
máquina y funciona en inglés o español. Esta es la ruta de 5 minutos de cero a tu primer escaneo.

> **¿Prefieres una app?** La app de iPhone — toda la tubería corriendo de forma privada en tu teléfono —
> llegará **pronto en beta por TestFlight**, y será la forma más fácil de probar Jobfaro. Hoy, la CLI de
> abajo es el camino.

## 1. Instalar (un comando)

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/samdotson61/jobfaro-app/main/install.sh | bash
```

Cada comando de abajo también funciona con el alias corto `jf` (p. ej. `jf scan` ≡ `jobfaro scan`).
**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/samdotson61/jobfaro-app/main/install.ps1 | iex
```
¿Sin instalador? Solo necesitas [Node.js 20+](https://nodejs.org), luego:
```bash
git clone https://github.com/samdotson61/jobfaro-app && cd jobfaro-app && npm install && node bin/jobfaro init
```

## 2. Configurar (el asistente)

```bash
node bin/jobfaro init      # o: jobfaro init
```
Hace unas preguntas — idioma, tu área metropolitana, región (Medio Oeste por defecto), nivel (inicial
por defecto) y cómo quieres que se evalúen los puestos — y luego escribe tu configuración y siembra
empleadores reales de tu región. **Sin editar archivos.** Pulsa Enter para aceptar un valor por defecto.

## 3. Escanear

```bash
node bin/jobfaro scan
```
Mira el barrido de radar 📡 mientras los portales van respondiendo — el recuento suma los puestos que
de verdad aterrizan. Verás puestos nuevos de los empleadores de tu región, filtrados a tu nivel y
zona. Agrega o cambia empleadores cuando quieras con `jobfaro seed --region <región> --write`.

### Opcional: agregar USAJobs (empleos federales)

USAJobs es el sitio oficial de empleos del gobierno de EE. UU. — una fuente grande, pública y accesible
para quien empieza (muchos puestos abiertos al público con bandas de grado/salario claras). Es **opcional**
y requiere una clave de API **gratuita**:

1. Solicita una clave en <https://developer.usajobs.gov/apirequest/> (instantánea, gratis).
2. Pon la clave y el correo con el que la registraste en `data/credentials.env` (ignorado por git, nunca
   se sube, nunca se envía a otro lugar que no sea `data.usajobs.gov`):
   ```
   USAJOBS_API_KEY=tu-clave-aquí
   USAJOBS_EMAIL=tu@correo.com
   ```
3. Agrega una búsqueda guardada a `config/portals.yml` — la cadena de consulta *es* la búsqueda:
   ```yaml
   - company: USAJobs
     provider: usajobs
     careers_url: https://data.usajobs.gov/api/search?Keyword=analista+de+datos&LocationName=Ohio
   ```

Sin clave, el proveedor queda inactivo, así que los escaneos siguen funcionando para los demás.

## 4. Prefiltrar (sáltate los puestos que no puedes conseguir)

```bash
node bin/jobfaro prescreen
```
Sin tokens y rápido: los puestos con un requisito duro que no puedes superar (años exigidos, una
autorización de seguridad activa, un título que excluiste, o — si pones `needs_sponsorship: true`
en tu perfil o activas "Necesito patrocinio de visa" en la app — una oferta que rechaza
explícitamente el patrocinio de visa) se descartan **citando la línea de la
descripción como razón** — nunca en silencio — y el resto se ordena por coincidencia de
habilidades + frescura para que evalúes primero el puesto más ganable. Los puestos que *ofrecen*
patrocinio explícitamente reciben una nota de "patrocina visa"; las ofertas que no lo mencionan se
dejan tal cual (la mayoría — Jobfaro nunca afirma una postura que la empresa no declaró). También lee el **salario
declarado** de la oferta y lo clasifica frente a tu `target_salary` (por encima / dentro / cerca /
por debajo), mostrado junto a cada puesto; un puesto que paga algo por debajo del objetivo es una
coincidencia "cerca", penalizada levemente, nunca descartada.

## 5. Evaluar un puesto

```bash
node bin/jobfaro eval <url-del-puesto>    # o: eval --next para el mejor puesto pendiente
node bin/jobfaro eval --next 10           # puntúa los siguientes 10 (5, 10, 15 … hasta 50) — con barra de radar
```

Cada evaluación — individual o por lote — termina indicándote **dónde está tu informe de empleos**
(`data/pipeline.tsv` en tu directorio de jobfaro) y cómo verlo: `jobfaro tracker` (tabla), `jobfaro tui`
(interactivo), `jobfaro dashboard` (web).

**¿De dónde sale el modelo?** `eval`, `tailor` y los borradores de contacto necesitan uno — todo lo
anterior funciona sin ninguno. Dos caminos fáciles:

- **Modelo local privado (el predeterminado):** `node bin/jobfaro backend --install` te guía por la
  instalación local gratuita (winc.cpp — sin cuenta, sin clave de API, nada sale de tu máquina), y
  `node bin/jobfaro backend --check` la verifica de principio a fin. `node bin/jobfaro backend` muestra el
  estado en cualquier momento.
- **Tu CLI de IA:** dentro de Claude Code (o similar), las mismas acciones son comandos de barra —
  `/jobfaro scan`, `/jobfaro eval` y un onboarding guiado `/jobfaro` — usando el modelo de esa CLI, sin
  configuración extra.

**¿Cambias de campo o recién te gradúas?** Activa la coincidencia por habilidades transferibles —
`jobfaro init` te la ofrece (activada por defecto para perfiles de cambio de carrera / sin título), o
agrega `--transferable` a cualquier `eval`. Acredita las habilidades adyacentes reales de tu currículum
frente a los requisitos del puesto, y trata un requisito de "X+ años en [campo]" como algo que tu
experiencia adyacente puede cubrir en vez de un muro infranqueable — sin bajar el listón: encajes muy
enfocados, no una avalancha.

## 6. Contacta (un contacto cálido vale más que una solicitud fría)

```bash
node bin/jobfaro outreach <url-del-puesto>
node bin/jobfaro outreach --draft <url-del-puesto> --person "Alex Kim" --instruct "que sea informal"
```
Obtienes enlaces de búsqueda en LinkedIn de reclutadores y posibles gerentes de contratación — tú
navegas y eliges a la persona; Jobfaro nunca extrae datos ni envía nada. **`--draft`** escribe una nota
inicial fundamentada para esa persona (una razón real de tu currículum + una petición), ajustable con
`--instruct` y verificada contra las reglas de longitud/marcadores/nombre de LinkedIn — revísala y **tú**
la envías. Registra lo que envíes (`--log`), y `--due` te dice cuándo madura el único seguimiento cortés
(5+ días hábiles; después el hilo se cierra).

## 7. Adapta y crea tu currículum

```bash
node bin/jobfaro tailor Enova  # IA: resumen de CV + carta para el puesto (fundamentado en tu currículum)
node bin/jobfaro tailor Enova --instruct "tono más cálido, un párrafo más corto"  # guíalo; reejecuta para afinar
node bin/jobfaro pdf Enova     # renderiza un currículum compatible con ATS → output/*.html
```
`jobfaro tailor` usa tu modelo local para escribir un resumen y una carta específicos del puesto en
`output/` — reordena y destaca tu experiencia **real** y nunca inventa nada. Primero agrega tu currículum
con `jobfaro init --resume <archivo>`.

**Guíalo (`--instruct`).** Pasa una directiva — `"tono más cálido"`, `"empieza con mi trabajo de datos"`,
`"un párrafo más corto"` — para moldear el tono, el énfasis y la extensión (nunca los hechos). Las
directivas se **acumulan** por puesto y se ejecutan a baja temperatura, así que reejecutar con la misma
directiva reproduce la misma carta, y una directiva nueva escribe la siguiente variante (`…-cv-v2.md`).
`--list` muestra tus directivas guardadas, `--reset` las borra. Luego `jobfaro pdf` renderiza el HTML
compatible con ATS; instala Playwright (`npm i playwright`) para un PDF automático, o abre el HTML e
Imprime → Guardar como PDF.

## Tus datos se quedan en local

Tu currículum y tu historial viven en tu máquina. El escáner de Jobfaro solo lee ofertas de empleo
**públicas** — nunca sube tu currículum. Consulta el [README](../README.es.md) para el diseño completo
de privacidad.

## ¿Atascado/a?

Consulta [solución de problemas](troubleshooting.md), o ejecuta `node bin/jobfaro doctor` para revisar
tu configuración.
