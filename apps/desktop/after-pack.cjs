// electron-builder afterPack hook (0.4.0): SEAL the macOS bundle with a proper ad-hoc signature.
// With `identity: null` electron-builder skips signing entirely, which left Electron's linker-signed main
// binary claiming resources the bundle never sealed — `codesign --verify` failed ("code has no resources
// but signature indicates they must be present") and Apple's syspolicy_check rated it Fatal, so a
// downloaded copy hits macOS's "is damaged and can't be opened" wall instead of the recoverable
// "Apple could not verify…" → Privacy & Security → Open Anyway path. Deep ad-hoc signing seals every
// nested binary (Electron helpers + the bundled winc) under one consistent signature. Notarization with a
// Developer ID is the real fix and needs Sam's Apple account (RELEASING.md).
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return
  const appPath = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • ad-hoc sealed ${path.basename(appPath)} (${ctx.arch === 1 ? 'x64' : ctx.arch === 3 ? 'arm64' : ctx.arch})`)
}
