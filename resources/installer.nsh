; Custom NSIS hooks for Vaultier installer
; Included automatically via electron-builder.yml → nsis.include

!macro customInit
  ; Kill any running Vaultier instance before files are written.
  ; customInit runs before file extraction, preventing "cannot be closed" errors.
  DetailPrint "Closing Vaultier if it is running..."
  nsExec::ExecToLog 'taskkill /F /IM "Vaultier.exe" /T'
  Sleep 2000
!macroend
