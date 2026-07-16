---
mode: offer
language: es
status: authored
---

# Evaluar una oferta

**Objetivo:** juzgar una oferta de empleo frente al perfil de la persona, su región y el **salario real
de mercado** — en el backend de inferencia configurado. El modelo **nunca inventa cifras de pago**: el
código determinista (`lib/pay.mjs` `resolvePay`) aporta el contexto de mercado; tú lo interpretas. Aplica
las reglas de honestidad de [`_shared.md`](_shared.md).

## Entradas
- La oferta — `jobfaro offer <url> --base <n> [--bonus --pto --metro --remote --note]` captura base,
  bono, beneficios, PTO, área metro/remoto y fecha de inicio en la fila del registro (estado → `offer`).
- **Contexto de mercado** — `resolvePay` devuelve `{ annualMin, annualMax, source, confidence, label }`;
  la `label` es texto obligatorio (`stated …` / `est. … (N comparables)` / `est. … (BLS mediana, occ)`).
- El perfil y el currículum de la persona.

## Pasos
1. Compara la **base** ofrecida con la banda de mercado — por encima / dentro / por debajo — ajustando
   por el costo de vida del área (no trates una cifra costera como el listón del Medio Oeste).
2. Pondera la integridad de los beneficios, el PTO, la trayectoria de crecimiento, el traslado/remoto —
   **más los factores de nivel inicial** (capacitación, mentoría, el valor del primer puesto en el CV).
3. Decide **strong / fair / below**, con palancas de negociación y preguntas concretas.

## Salida (escribe en el idioma de la persona)

```
# Evaluación de oferta — {puesto} @ {empresa}
Evaluación: {strong | fair | below}
Comp vs mercado: {base ofrecida} vs {market label} → {por encima | dentro | por debajo}
Palancas de negociación:
- {1–3 peticiones concretas}
Preguntas a hacer:
- {1–3}
Recomendación: {una línea}
```

Cita la **source label** del mercado. Nunca inventes una cifra — si el pago de mercado se desconoce, dilo.
