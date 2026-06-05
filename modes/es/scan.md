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
- Proveedores: **Greenhouse** (referencia incluida). **Workday** (Fase 2) e **iCIMS** (Fase 3)
  son los ATS empresariales destacados; Lever/Ashby después.
- `jobdar scan --dry-run` resuelve un proveedor por portal e imprime un resumen **sin llamadas de
  red** — úsalo para revisar la configuración.

## Tu papel como agente
- Ayuda a la persona a añadir empleadores reales a `config/portals.yml` (el asistente de región
  llega en la Fase 5).
- Tras un escaneo, pasa los puestos prometedores al modo **eval** para puntuarlos.
- El filtrado por título/ubicación según nivel y región es determinista y se amplía en las
  Fases 4–5.
