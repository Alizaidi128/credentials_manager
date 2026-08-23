; Custom NSIS hooks for Vaultier installer
; Included automatically via electron-builder.yml → nsis.include

!macro customInstall
  ; Kill any running Vaultier instance before files are written.
  ; This prevents "Error opening file for writing" on reinstall.
  DetailPrint "Closing Vaultier if it is running..."
  nsExec::ExecToLog 'taskkill /F /IM "Vaultier.exe" /T'
  Sleep 2000
!macroend
