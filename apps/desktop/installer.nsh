; Jobdar Desktop — NSIS additions (desktop 0.5.1), wired in through build.nsis.include.
;
; Installing over a previous version first runs THAT version's uninstaller. When it fails — the first
; 0.5.0 Windows upload was built on a Mac, and its uninstaller fails NSIS's own check ("Installer
; integrity check has failed") — stock electron-builder stops with "Failed to uninstall old application
; files ...: 2", even under /S, stranding the user on a version they can neither remove nor upgrade.
; These hooks replace that abort: the installer logs the failure and installs over the old files in place,
; which also writes a fresh, working uninstaller and uninstall entry. Safe: everything a user owns lives in
; ~/.jobdar, never in the install folder.
!macro customUnInstallCheck
  ${if} $R0 != 0
    DetailPrint "The previous version's uninstaller failed (code $R0) - installing over it in place."
  ${endIf}
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend
