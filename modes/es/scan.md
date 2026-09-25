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
- Proveedores: **Greenhouse** (referencia), **Workday** e **iCIMS** (todos incluidos). Workday:
  usa `provider: workday` y opcionalmente `site:`. iCIMS analiza el HTML público de las páginas
  de empleo (JSON-LD primero); añade `--playwright` para sitios con mucho JS. Lever/Ashby después.
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
