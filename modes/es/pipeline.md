---
mode: pipeline
language: es
status: authored
---

# Flujo — escanear → evaluar → registrar

**Objetivo:** ejecutar todo el ciclo de principio a fin e informarlo en el idioma de la persona.
El comando totalmente automático `jobfaro pipeline` llega en la **Fase 6**; este modo define el
flujo y la estructura del informe ya, para que el agente pueda ejecutarlo hoy.

## Flujo
1. **Escanear** — `jobfaro scan` para nuevos puestos públicos (determinista, sin modelo).
2. **Evaluar** — puntúa cada puesto nuevo con el modo **eval** frente al currículum de la persona.
3. **Registrar** — anota los resultados con IDs de estado canónicos (ver `templates/states.yml`);
   el registro acepta alias de estado en español y muestra etiquetas localizadas.

## Informe (escribe en el idioma de la persona; conserva estas secciones)

```
# Ejecución del flujo — {fecha}

## Escaneados
{N puestos nuevos en M portales}

## Evaluados
{lista ordenada: puesto @ empresa — puntuación (banda) — recomendación de una línea}

## Registrados
{qué pasó a qué estado}

## Próximas acciones
{las una a tres acciones de mayor valor ahora}
```

Los pasos deterministas no necesitan modelo; solo la evaluación. Deja que el ser humano controle
a qué se postula.
