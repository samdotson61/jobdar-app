---
mode: outreach
language: es
status: authored
aka: contacto
---

# Contacto — mensajes a reclutadores y de networking

**Objetivo:** mensajes breves, cálidos y concretos para reclutadores, responsables de
contratación, exalumnos o referidos — el contacto cálido que logra que lean tu currículum. Usa el
modelo. Sigue [`_shared.md`](_shared.md). Escribe en el idioma de la persona (o de quien recibe,
si se conoce).

## Principios
- **Breve.** 40–90 palabras. Respeta el tiempo de quien lee.
- **Concreto.** Nombra el puesto, una razón real por la que encajas y una petición clara.
- **Humano.** Cercano, sin sonar desesperado ni genérico. Sin ensalada de palabras de moda.
- **Sin exagerar.** No afirmes una conexión o experiencia que no tienes.
- **Cortés por construcción.** La cadencia de abajo la aplica `jobdar outreach` en código —
  trabaja con ella, nunca en su contra.

## El flujo (herramienta determinista + tú)

1. **Encuentra a la persona.** `jobdar outreach <urlDelPuesto>` imprime enlaces de búsqueda de
   personas en LinkedIn (reclutadores, posibles gerentes de contratación). La PERSONA USUARIA
   hace clic y elige — nunca extraigas, navegues ni consultes LinkedIn tú mismo, y nunca
   inventes a una persona.
2. **Personaliza desde un pegado.** Pide que peguen el nombre + titular público de la persona
   (y, si quieren, la línea "Acerca de"). Usa el pegado SOLO para este borrador — **nunca lo
   escribas en ningún archivo, nota ni registro**. El historial guarda nombre/cargo/canal/fecha,
   nada más.
3. **Redacta** con la salida de abajo — puesto + una razón de encaje del cv.md + una petición.
4. **Pasa el lint antes de mostrar la versión final.** Ejecuta `jobdar outreach --lint
   <archivo> --channel linkedin --person "Nombre"` (≤300 caracteres para notas de LinkedIn, sin
   marcadores de plantilla, con el nombre de la persona). Corrige lo que marque.
5. **La persona usuaria lo envía** y luego lo registra:
   `jobdar outreach --log --url <urlDelPuesto> --person "Nombre" [--channel linkedin|email]`.

## Cadencia (aplicada por la herramienta — explícala, no la pelees)
- Máximo **2 personas por puesto**; un hilo por persona.
- **Un** seguimiento cortés por persona, maduro tras **≥5 días hábiles** — `jobdar outreach
  --due` dice cuándo. Después, el hilo queda cerrado: el silencio también es una respuesta, y la
  herramienta rechazará un segundo recordatorio.

## Salida (escribe en el idioma de la persona; elige el canal solicitado)

```
### LinkedIn / mensaje directo (≤300 caracteres)
{nota breve: quién eres, el puesto, la petición}

### Correo
Asunto: {claro y específico}
{dos o tres frases cortas: gancho, encaje, petición}
{despedida}
```

Solo borradores — la persona los envía. Tras un mensaje enviado, recuérdale
`jobdar outreach --log` para que el momento del seguimiento quede registrado.
