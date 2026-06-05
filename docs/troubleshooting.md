# Troubleshooting

Run `node bin/jobdar doctor` first — it checks Node, config, and providers, and tells you what's
optional.

| Symptom | Fix |
|---|---|
| `command not found: jobdar` | Use `node bin/jobdar <cmd>`, or run `npm link` to put `jobdar` on your PATH. |
| `doctor` warns about Playwright / PDF | Optional — only some JS-rendered iCIMS sites need Playwright (`npm i playwright`); PDF export comes later. You can still scan, eval, and track. |
| `jobdar scan` shows 0 portals | Run `jobdar init`, or `jobdar seed --region <region> --write` to add employers. |
| Scan returns few or no roles | Your level/region filters may be narrow. Try `jobdar scan --levels entry,mid,senior` or `--regions nationwide`. |
| One employer returns nothing | iCIMS is best-effort; some sites are JS-rendered — try `jobdar scan --playwright` (needs Playwright). Workday may need the right `site:` in the portal. |
| Output is in the wrong language | Set `language: en` or `es` in `config/profile.yml`, or pass `--lang es` per run. |

Still stuck? Open an issue and include your `jobdar doctor` output.
