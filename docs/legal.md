# Legal & responsible use

## Disclaimer

Jobfaro is provided "as is", without warranty of any kind (see the Apache-2.0 `LICENSE`). You are
responsible for how you use it, including compliance with each site's Terms of Service.

## Privacy

- Your résumé and application history stay **local** — on your machine (or, for the future web app, in
  your browser). Jobfaro hosts no personal data.
- The scanner reads only **public** job listings — the same pages a career site serves to a browser. It
  never uploads your résumé.
- The default backend is on-device (winc.cpp) — no key, nothing leaves your machine. If you opt into a
  cloud inference API (the `api` backend, bring-your-own-key), only the minimal job description
  + relevant CV excerpt is sent, with zero-retention settings.

## Responsible use

- **Respect Terms of Service & robots.** Jobfaro fetches public, browser-accessible job endpoints with
  polite pacing and per-request timeouts. Don't repurpose it to hammer a site or bypass access controls.
- **Human-in-the-loop.** Jobfaro drafts and recommends; it **never auto-applies** or submits anything on
  your behalf. You review and apply.
- **Public endpoints only.** Jobfaro uses unauthenticated public job data. The optional iCIMS Job Portal
  API path requires your own employer/vendor OAuth2 credentials.

## Third-party code

Jobfaro is an independent implementation. Its one runtime dependency (`js-yaml`, MIT) retains its own
license. Any future reused open-source code is credited here and in `NOTICE`.

> A Spanish translation of this page is planned; the privacy summary also appears in `README.es.md`.
