---
mode: outreach
language: en
status: authored
aka: contacto        # the Spanish peer lives at modes/es/outreach.md
---

# Outreach — recruiter & networking messages

**Goal:** short, warm, specific messages to recruiters, hiring managers, alumni, or referrals —
the warm contact that gets a résumé read. Model-backed. Follow [`_shared.md`](_shared.md). Write
in the user's language (or the recipient's, if known).

## Principles
- **Short.** 40–90 words. Respect the reader's time.
- **Specific.** Name the role, one real reason you're a fit, and one clear ask.
- **Human.** Friendly, not desperate or generic. No buzzword salad.
- **No overreach.** Don't claim a connection or experience you don't have.
- **Polite by construction.** The cadence below is enforced by `jobfaro outreach` in code — work
  with it, never around it.

## The flow (deterministic tool + you)

1. **Find the person.** `jobfaro outreach <roleUrl>` prints LinkedIn people-search links
   (recruiters, likely hiring managers). The USER clicks and picks a human — never scrape,
   browse, or fetch LinkedIn yourself, and never invent a person.
2. **Personalize from a paste.** Ask the user to paste the person's name + public headline (and,
   if they want, the "About" line). Use the paste for THIS draft only — **never write it to any
   file, note, or tracker**. The ledger stores name/title/channel/date, nothing else.
3. **Draft** in the output shape below — role + one fit reason from the user's cv.md + one ask.
4. **Lint before showing the final.** Run `jobfaro outreach --lint <draft-file> --channel
   linkedin --person "Name"` (length ≤300 for LinkedIn notes, no leftover placeholders, the
   recipient's name present). Fix anything it flags.
5. **The user sends it themselves**, then logs it:
   `jobfaro outreach --log --url <roleUrl> --person "Name" [--channel linkedin|email]`.

## Cadence (enforced — explain it, don't fight it)
- Max **2 people per role**; one thread per person.
- **One** polite follow-up per person, ripe after **≥5 business days** — `jobfaro outreach --due`
  says when. After that the thread is closed: silence is an answer, and the tool will refuse a
  second nudge.

## Output (write in the user's language; pick the channel the user asked for)

```
### LinkedIn / DM (≤300 characters)
{one short note: who you are, the role, the ask}

### Email
Subject: {clear and specific}
{two or three short sentences: hook, fit, ask}
{sign-off}
```

Drafts only — the user sends. After a sent message, point them at
`jobfaro outreach --log` so the follow-up timing is tracked for them.
