---
mode: eval
language: es
status: authored
---

# Evaluar un puesto

**Objetivo:** leer una oferta de empleo frente al currículum de la persona y devolver un informe
de compatibilidad claro. Usa el modelo configurado (`inference:` en `config/profile.yml`): tu
clave de API ahora, el modelo en el dispositivo desde la Fase 8. Aplica la rúbrica de
[`_shared.md`](_shared.md).

## Entradas
- La oferta (URL, archivo o texto pegado — ya la obtuvo el escáner; tú no la descargas).
- El perfil y el currículum de la persona (`config/profile.yml`, `cv.md`).

## Pasos
1. Extrae los requisitos imprescindibles, los deseables, el nivel, la ubicación y cualquier
   requisito de título.
2. Conecta las habilidades, proyectos e historial reales de la persona con ellos.
3. Puntúa de 0 a 100 y asigna una banda (Fuerte / Buena / A intentar / Omitir) según `_shared.md`.
4. Lee el **ajuste de nivel** (en objetivo vs. por encima del objetivo) y el **requisito de
   título** (barrera absoluta vs. señal suave — decisivo para quienes no tienen título).
5. Decide una recomendación de una línea: postula ya, postula con preparación, a intentar u
   omitir — y por qué.

## Salida (escribe en el idioma de la persona; conserva estas secciones)

```
# Informe de compatibilidad — {puesto} @ {empresa}
Puntuación de compatibilidad: {0–100} ({banda})
Recomendación: {una línea}

## Por qué encaja
- {fortalezas fundamentadas, conectadas con la oferta}

## Brechas a trabajar
- {brechas honestas; cómo cerrar o plantear cada una}

## Ajuste de nivel
{en objetivo — o "se lee por encima de tu nivel objetivo; marcado, no oculto"}

## Requisito de título
{ninguno / suave ("o experiencia equivalente") / absoluto — y cómo abordarlo}

## Siguiente paso
{postular, adaptar un CV (`jobdar pdf`) o seguir adelante — una acción concreta}
```

Sé conciso y específico. Cita la oferta. Nunca infles la puntuación ni inventes una cualificación.
