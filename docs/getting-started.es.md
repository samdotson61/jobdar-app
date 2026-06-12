# Empezar con Jobdar

[🇺🇸 English](getting-started.md) · [🇲🇽 Español](getting-started.es.md)

Jobdar encuentra empleos de nivel inicial en EE. UU. que encajan contigo, mantiene tus datos en tu
máquina y funciona en inglés o español. Esta es la ruta de 5 minutos de cero a tu primer escaneo.

## 1. Instalar (un comando)

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/getjobdar/jobdar/main/install.sh | bash
```
**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/getjobdar/jobdar/main/install.ps1 | iex
```
¿Sin instalador? Solo necesitas [Node.js 20+](https://nodejs.org), luego:
```bash
git clone https://github.com/getjobdar/jobdar && cd jobdar && npm install && node bin/jobdar init
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
Verás puestos nuevos de los empleadores de tu región, filtrados a tu nivel y zona. Agrega o cambia
empleadores cuando quieras con `jobdar seed --region <región> --write`.

## 4. Prefiltrar (sáltate los puestos que no puedes conseguir)

```bash
node bin/jobdar prescreen
```
Sin tokens y rápido: los puestos con un requisito duro que no puedes superar (años exigidos, una
autorización de seguridad activa, un título que excluiste) se descartan **citando la línea de la
descripción como razón** — nunca en silencio — y el resto se ordena por coincidencia de
habilidades + frescura para que evalúes primero el puesto más ganable.

## 5. Evaluar un puesto

```bash
node bin/jobdar eval <url-del-puesto>    # o: eval --next para el mejor puesto pendiente
```
Dentro de una CLI de IA (como Claude Code), las mismas acciones son comandos de barra: `/jobdar scan`,
`/jobdar eval` y un onboarding guiado `/jobdar`.

## 6. Contacta (un contacto cálido vale más que una solicitud fría)

```bash
node bin/jobdar outreach <url-del-puesto>
```
Obtienes enlaces de búsqueda en LinkedIn de reclutadores y posibles gerentes de contratación — tú
navegas y eliges a la persona; Jobdar nunca extrae datos ni envía nada. Registra lo que envíes
(`--log`), y `--due` te dice cuándo madura el único seguimiento cortés (5+ días hábiles; después el
hilo se cierra).

## 7. Crea un currículum adaptado

```bash
node bin/jobdar pdf Enova    # adapta tu currículum a ese puesto → output/*.html
```
Primero agrega tu currículum con `jobdar init --resume <archivo>`. Obtienes un currículum HTML
compatible con ATS en `output/`; instala Playwright (`npm i playwright`) para un PDF automático, o
abre el HTML e Imprime → Guardar como PDF.

## Tus datos se quedan en local

Tu currículum y tu historial viven en tu máquina. El escáner de Jobdar solo lee ofertas de empleo
**públicas** — nunca sube tu currículum. Consulta el [README](../README.es.md) para el diseño completo
de privacidad.

## ¿Atascado/a?

Consulta [solución de problemas](troubleshooting.md), o ejecuta `node bin/jobdar doctor` para revisar
tu configuración.
