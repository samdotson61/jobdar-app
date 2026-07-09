# Troubleshooting

Run `node bin/jobdar doctor` first — it checks Node, config, and providers, and tells you what's
optional.

| Symptom | Fix |
|---|---|
| `command not found: jobdar` | Use `node bin/jobdar <cmd>`, or run `npm link` to put `jobdar` on your PATH. |
| `doctor` warns about Playwright / PDF | Optional — only some JS-rendered iCIMS sites need Playwright (`npm i playwright`); `jobdar pdf` always writes HTML, and Playwright adds the automatic PDF. You can still scan, eval, and track. |
| `eval` says the model/backend is down or missing | `node bin/jobdar backend --install` sets up the free private on-device model (no account, no key); `node bin/jobdar backend --check` verifies it end to end. In the app: Settings → download the model. Or run inside an AI CLI (`/jobdar eval`) — no setup. |
| `jobdar scan` shows 0 portals | Run `jobdar init`, or `jobdar seed --region <region> --write` to add employers. |
| Scan returns few or no roles | Your level/region filters may be narrow. Try `jobdar scan --levels entry,mid,senior` or `--regions nationwide`. |
| One employer returns nothing | iCIMS is best-effort; some sites are JS-rendered — try `jobdar scan --playwright` (needs Playwright). Workday may need the right `site:` in the portal. |
| Résumé upload/import says "couldn't read that file" (PDF) | PDF text extraction needs `pdftotext` from **poppler**: `brew install poppler` (macOS) or `apt-get install poppler-utils` (Debian/Ubuntu). `.docx` only needs `unzip`. A **scanned/image-only PDF** has no embedded text — export a text PDF, or upload `.docx`/`.txt`. |
| App opens blank after I'd set things up | Expected on a true first boot / new browser / cleared storage — the app starts blank and persists your state (profile, résumé, selections) **per device**: browser storage on web, the on-device file store on the phone. Connected to a Mac serve, identity/résumé also write through to the CLI's `config/profile.yml` / `data/cv.md`. A different device/browser starts fresh — re-upload your résumé or set the chips. |
| Output is in the wrong language | Set `language: en` or `es` in `config/profile.yml`, or pass `--lang es` per run. |

Still stuck? Open an issue and include your `jobdar doctor` output.
