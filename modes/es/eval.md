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
- La oferta — `jobdar eval <url>` la obtiene por ti vía el proveedor correspondiente
  (greenhouse / workday / icims) y la imprime; tú la lees y la puntúas. (Un archivo o texto pegado también sirve.)
- El perfil y el currículum de la persona (`config/profile.yml`, `cv.md`).
- **La fecha de hoy** — `jobdar eval` la imprime. Úsala: trata cualquier "Presente"/"Actual" del
  currículum como hoy, **nunca como una fecha futura** (un puesto "mar 2025 – Presente" está en curso,
  no es empleo futuro).

## Pasos
1. Extrae los requisitos imprescindibles, los deseables, el nivel, la ubicación y cualquier
   requisito de título.
2. Conecta las habilidades, proyectos e historial reales de la persona con ellos.
3. Puntúa de **0.0 a 5.0** y asigna una banda (**Postular / Investigar / Descartar**) según `_shared.md`.
4. Lee el **ajuste de nivel** (en objetivo vs. por encima del objetivo) y el **requisito de
   título** (barrera absoluta vs. señal suave — decisivo para quienes no tienen título).
5. Decide una recomendación de una línea: postula ya, postula con preparación, a intentar u
   omitir — y por qué.

## Salida (escribe en el idioma de la persona; conserva estas secciones)

```
# Informe de compatibilidad — {puesto} @ {empresa}
Puntuación de compatibilidad: {0.0–5.0} ({banda})
Recomendación: {una línea}

## Por qué encaja
- {fortalezas fundamentadas, conectadas con la oferta}

## Brechas a trabajar
- {brechas honestas; cómo cerrar o plantear cada una}

## Ajuste de nivel
{en objetivo — o "se lee por encima de tu nivel objetivo; marcado, no oculto"}

## Requisito de título
degree_required: {yes | no | unclear}
{si es yes: ¿barrera absoluta o suave ("o experiencia equivalente")? Para quienes no tienen título,
di qué cerraría la brecha. Los puestos con barrera de título siguen visibles (marcados) cuando
include_degree_required_roles está activado.}

## Salario
{cita el rango DECLARADO de la oferta si existe (`jobdar prescreen` lo extrae en la columna `pay`) y
cómo se compara con el objetivo — por encima / dentro / cerca / por debajo. Si no se publica, dilo.
Nunca inventes una cifra.}

## Siguiente paso
{postular, adaptar un CV (`jobdar pdf`) o seguir adelante — una acción concreta}
```

## Regístralo

El escáner solo descubre puestos — nunca los puntúa. **Tú** eres quien puntúa, así que guarda tu
veredicto en el flujo (luego aparece en `jobdar tui` / el panel):

```
jobdar eval --save --url <url> --score <0.0–5.0> --band <apply|research|dont> --company "{empresa}" --role "{puesto}" --note "{recomendación de una línea}"
```

Sé conciso y específico. Cita la oferta. Nunca infles la puntuación ni inventes una cualificación.
