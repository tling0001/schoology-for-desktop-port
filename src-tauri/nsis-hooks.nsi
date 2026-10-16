!macro NSIS_HOOK_PREINSTALL
  ; Match electron-builder's default per-user installation directory.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Schoology"
!macroend
