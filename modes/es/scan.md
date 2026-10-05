---
mode: scan
language: es
status: authored
---

# Escanear

El escaneo es **determinista y sin modelo** — `scan.mjs` impulsa los complementos de proveedor en
`providers/`. Tú no descargas páginas de empleo; ejecutas `jobdar scan` (o `node scan.mjs`) y
razonas sobre los resultados normalizados.

## Cómo funciona
- Los portales viven en `config/portals.yml`: `company`, `careers_url`, opcionalmente `provider`
  / `site`.
- Cada proveedor exporta `{ id, detect, fetch }`. `detect()` no usa red; `fetch()` devuelve
  `{ title, url, company, location, postedOn }` normalizado por HTTPS con una lista blanca de
  hosts.
- Proveedores: **Greenhouse** (referencia), **Workday**, **iCIMS**, **Lever**, **Ashby** y
  **UKG/UltiPro** se detectan por la URL de empleos; **JSON-LD** y **Jibe** leen sitios en el
  dominio propio del empleador y requieren `provider: jsonld` / `provider: jibe` explícito;
  **USAJobs** es opcional con una clave gratuita. Workday: `site:` opcional. iCIMS analiza el HTML
  público de las páginas de empleo (JSON-LD primero); añade `--playwright` para sitios con mucho JS.
- Un portal grande se lee página por página (Workday hasta 2,000 publicaciones). Un portal que no se
  leyó hasta el final queda fuera de la verificación de «ya no está publicado» — que un puesto falte
  en una lista incompleta no prueba nada.
- `jobdar scan --dry-run` resuelve un proveedor por portal e imprime un resumen **sin llamadas de
  red** — úsalo para revisar la configuración.

## Tu papel como agente
- Ayuda a la persona a añadir empleadores — `jobdar seed --region <r> --write` los materializa
  desde `data/seed/employers.yml` en `config/portals.yml`, o puede editarlo a mano.
- Tras un escaneo, pasa los puestos prometedores al modo **eval** para puntuarlos.
- Indica a la persona el panel para una vista rápida — `jobdar tui` (terminal) o
  `jobdar dashboard` (web · http://localhost:4319).
- El filtrado por **nivel** (`lib/levels.mjs`) y **región/ubicación** (`lib/regions.mjs`) es
  determinista: los puestos fuera de `target_levels` o `target_regions` se pre-filtran (remoto en
  EE. UU. siempre se permite); los títulos/ubicaciones ambiguos pasan a la rúbrica.
