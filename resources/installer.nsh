; Custom NSIS hooks for Vaultier installer
; Included automatically via electron-builder.yml → nsis.include

!macro preInit
  ; Kill any running Vaultier instance before the installer does anything.
  ; Runs in .onInit — earliest possible point, before file extraction.
  nsExec::ExecToLog 'taskkill /F /IM "Vaultier.exe" /T'
  Sleep 3000
!macroend
