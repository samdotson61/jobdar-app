# Empezar con Jobdar

[🇺🇸 English](getting-started.md) · [🇲🇽 Español](getting-started.es.md)

Jobdar encuentra empleos de nivel inicial en EE. UU. que encajan contigo, mantiene tus datos en tu
máquina y funciona en inglés o español. Esta es la ruta de 5 minutos de cero a tu primer escaneo.

> **¿Prefieres una app? ¿No usas la terminal?** Usa la **[app de escritorio](desktop-beta.md)** para Mac y
> Windows en lugar de esta guía — descárgala, ábrela y un clic configura la IA privada; sin terminal en
> ningún paso (pasos en el [README](../README.es.md#la-forma-más-fácil-de-empezar-la-app-de-escritorio-mac--windows-beta)).
> La app de iPhone está construida pero **todavía no está en TestFlight**. El resto de esta página es la CLI.

## 1. Instalar (un comando)

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/samdotson61/jobdar-app/main/install.sh | bash
```

Cuando `npm link` haya puesto `jobdar` en tu PATH, también funciona su alias corto `jd` (`jd scan` ≡ `jobdar scan`); mientras tanto, `node bin/jobdar <comando>` desde la carpeta hace lo mismo.

**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/samdotson61/jobdar-app/main/install.ps1 | iex
```
¿Sin instalador? Solo necesitas [Node.js 20+](https://nodejs.org), luego:
```bash
git clone https://github.com/samdotson61/jobdar-app && cd jobdar-app && npm install && node bin/jobdar init
```

## 2. Configurar (el asistente)

```bash
node bin/jobdar init      # o: jobdar init
```
Hace unas preguntas — idioma, tu área metropolitana, región (Medio Oeste por defecto), nivel (inicial
por defecto) y cómo quieres que se evalúen los puestos — y luego escribe tu configuración y siembra
empleadores reales de tu región. **Sin editar archivos.** Pulsa Enter para aceptar un valor por defecto.

## 3. Escanear

```bash
node bin/jobdar scan
```
Mira el barrido de radar 📡 mientras los portales van respondiendo — el recuento suma los puestos que
de verdad aterrizan. Verás puestos nuevos de los empleadores de tu región, filtrados a tu nivel y
zona. Agrega o cambia empleadores cuando quieras con `jobdar seed --region <región> --write`.

Un escaneo completo lee todas las páginas de cada portal, así que tarda unos minutos (unos cuatro para
la lista del Medio Oeste). Para agregar un empleador por tu cuenta, pon su dirección de empleos en
`config/portals.yml` — los portales de Workday, iCIMS, Greenhouse, Lever, Ashby y UKG se reconocen solo
por la dirección. Dos tipos de sitio viven en la dirección web propia del empleador y necesitan una
línea más que diga qué son:

```yaml
- company: Medpace
  careers_url: https://careers.medpace.com/jobs
  provider: jibe        # o: jsonld
```

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
node bin/jobdar prescreen
```
Sin tokens y rápido: los puestos con un requisito duro que no puedes superar (años exigidos, una
autorización de seguridad activa, un título que excluiste, o — si pones `needs_sponsorship: true`
en tu perfil o activas "Necesito patrocinio de visa" en la app — una oferta que rechaza
explícitamente el patrocinio de visa) se descartan **citando la línea de la
descripción como razón** — nunca en silencio — y el resto se ordena por coincidencia de
habilidades + frescura para que evalúes primero el puesto más ganable. Los puestos que *ofrecen*
patrocinio explícitamente reciben una nota de "patrocina visa"; las ofertas que no lo mencionan se
dejan tal cual (la mayoría — Jobdar nunca afirma una postura que la empresa no declaró). También lee el **salario
declarado** de la oferta y lo clasifica frente a tu `target_salary` (por encima / dentro / cerca /
por debajo), mostrado junto a cada puesto; un puesto que paga algo por debajo del objetivo es una
coincidencia "cerca", penalizada levemente, nunca descartada.

## 5. Evaluar un puesto

```bash
node bin/jobdar eval <url-del-puesto>    # o: eval --next para el mejor puesto pendiente
node bin/jobdar eval --next 10           # puntúa los siguientes 10 (5, 10, 15 … hasta 50) — con barra de radar
```

Cada evaluación — individual o por lote — termina indicándote **dónde está tu informe de empleos**
(`data/pipeline.tsv` en tu directorio de jobdar) y cómo verlo: `jobdar tracker` (tabla), `jobdar tui`
(interactivo), `jobdar dashboard` (web) — más la línea de alcance honesto: las puntuaciones comparan
el **texto del anuncio** con tu currículum; el empleador en sí no se verifica.

Dos comandos mantienen los veredictos honestos con el tiempo:

```bash
node bin/jobdar recheck                      # verifica que los puestos puntuados sigan publicados (sin modelo)
node bin/jobdar feedback "<puesto>" --good   # califica un veredicto 👍 (--bad para 👎) — construye tu
                                              # conjunto local de etiquetas; `jobdar calibrate --feedback` lo lee
```

**¿De dónde sale el modelo?** `eval`, `tailor` y los borradores de contacto necesitan uno — todo lo
anterior funciona sin ninguno. Dos caminos fáciles:

- **Modelo local privado (el predeterminado):** `node bin/jobdar backend --install` te guía por la
  instalación local gratuita (winc.cpp — sin cuenta, sin clave de API, nada sale de tu máquina), y
  `node bin/jobdar backend --check` la verifica de principio a fin. `node bin/jobdar backend` muestra el
  estado en cualquier momento.
- **Tu CLI de IA:** dentro de Claude Code (o similar), las mismas acciones son comandos de barra —
  `/jobdar scan`, `/jobdar eval` y un onboarding guiado `/jobdar` — usando el modelo de esa CLI, sin
  configuración extra.

**¿Cambias de campo o recién te gradúas?** Activa la coincidencia por habilidades transferibles —
`jobdar init` te la ofrece (activada por defecto para perfiles de cambio de carrera / sin título), o
agrega `--transferable` a cualquier `eval`. Acredita las habilidades adyacentes reales de tu currículum
frente a los requisitos del puesto, y trata un requisito de "X+ años en [campo]" como algo que tu
experiencia adyacente puede cubrir en vez de un muro infranqueable — sin bajar el listón: encajes muy
enfocados, no una avalancha.

## 6. Contacta (un contacto cálido vale más que una solicitud fría)

```bash
node bin/jobdar outreach <url-del-puesto>
node bin/jobdar outreach --draft <url-del-puesto> --person "Alex Kim" --instruct "que sea informal"
```
Obtienes enlaces de búsqueda en LinkedIn de reclutadores y posibles gerentes de contratación — tú
navegas y eliges a la persona; Jobdar nunca extrae datos ni envía nada. **`--draft`** escribe una nota
inicial fundamentada para esa persona (una razón real de tu currículum + una petición), ajustable con
`--instruct` y verificada contra las reglas de longitud/marcadores/nombre de LinkedIn — revísala y **tú**
la envías. Registra lo que envíes (`--log`), y `--due` te dice cuándo madura el único seguimiento cortés
(5+ días hábiles; después el hilo se cierra).

## 7. Adapta y crea tu currículum

```bash
node bin/jobdar tailor Enova  # IA: resumen de CV + carta para el puesto (fundamentado en tu currículum)
node bin/jobdar tailor Enova --instruct "tono más cálido, un párrafo más corto"  # guíalo; reejecuta para afinar
node bin/jobdar pdf Enova     # renderiza un currículum compatible con ATS → output/*.html
```
`jobdar tailor` usa tu modelo local para escribir un resumen y una carta específicos del puesto en
`output/` — reordena y destaca tu experiencia **real** y nunca inventa nada. Primero agrega tu currículum
con `jobdar init --resume <archivo>`.

**Guíalo (`--instruct`).** Pasa una directiva — `"tono más cálido"`, `"empieza con mi trabajo de datos"`,
`"un párrafo más corto"` — para moldear el tono, el énfasis y la extensión (nunca los hechos). Las
directivas se **acumulan** por puesto y se ejecutan a baja temperatura, así que reejecutar con la misma
directiva reproduce la misma carta, y una directiva nueva escribe la siguiente variante (`…-cv-v2.md`).
`--list` muestra tus directivas guardadas, `--reset` las borra. Luego `jobdar pdf` renderiza el HTML
compatible con ATS; instala Playwright (`npm i playwright`) para un PDF automático, o abre el HTML e
Imprime → Guardar como PDF.

## Tus datos se quedan en local

Tu currículum y tu historial viven en tu máquina. El escáner de Jobdar solo lee ofertas de empleo
**públicas** — nunca sube tu currículum. Consulta el [README](../README.es.md) para el diseño completo
de privacidad.

## ¿Atascado/a?

Consulta [solución de problemas](troubleshooting.md), o ejecuta `node bin/jobdar doctor` para revisar
tu configuración.
