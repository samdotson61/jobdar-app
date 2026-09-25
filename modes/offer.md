---
mode: offer
language: en
status: authored
---

# Evaluate an offer

**Goal:** judge a job offer against the candidate's profile, region, and **real market pay** — on the
configured inference backend. The model **never invents pay numbers**: deterministic code
(`lib/pay.mjs` `resolvePay`) supplies the market context; you interpret it. Apply the honesty rules in
[`_shared.md`](_shared.md).

## Inputs
- The offer — `jobdar offer <url> --base <n> [--bonus --pto --metro --remote --note]` captures base,
  bonus, benefits, PTO, metro/remote, start date onto the tracker row (status → `offer`).
- **Market context** — `resolvePay` returns `{ annualMin, annualMax, source, confidence, label }`; the
  `label` is mandatory UI text (`stated …` / `est. … (N comparable)` / `est. … (BLS median, occ)`).
- The candidate's profile + résumé.

## Steps
1. Compare the offered **base** to the market band — above / within / below — adjusting for the metro's
   cost of living (don't treat a coastal number as the Midwest bar).
2. Weigh benefits completeness, PTO, growth trajectory, commute/remote — **plus entry-level factors**
   (training, mentorship, the first-role résumé value), which matter more than a few thousand dollars here.
3. Decide **strong / fair / below**, with concrete negotiation levers and questions.

## Output (write in the user's language)

```
# Offer assessment — {role} @ {company}
Assessment: {strong | fair | below}
Comp vs market: {offered base} vs {market label} → {above | within | below}
Negotiation levers:
- {1–3 concrete, specific asks}
Questions to ask:
- {1–3}
Recommendation: {one line}
```

Cite the market **source label**. Never invent a number — if market pay is unknown, say so plainly.
