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
  // 0.5.1: Windows installers are built on Windows only. On a Mac electron-builder rebuilds the NSIS
  // uninstaller with a JS reader instead of running it, and the first desktop-v0.5.0 upload's failed NSIS's
  // integrity check on real Windows — Jobdar couldn't be uninstalled or upgraded. Stop the build here,
  // before a broken installer can exist. (dist-native.mjs builds the right targets per machine.)
  if (ctx.electronPlatformName === 'win32' && process.platform !== 'win32') {
    throw new Error('Windows installers must be built on Windows (a Mac-built NSIS uninstaller fails its integrity check) — run `node dist-native.mjs` on the Windows PC')
  }
  if (ctx.electronPlatformName !== 'darwin') return
  const appPath = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • ad-hoc sealed ${path.basename(appPath)} (${ctx.arch === 1 ? 'x64' : ctx.arch === 3 ? 'arm64' : ctx.arch})`)
}
