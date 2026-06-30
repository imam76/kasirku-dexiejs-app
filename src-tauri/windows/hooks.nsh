; NSIS installer hooks for frayukti.
; Wipes local application data when the user explicitly uninstalls the app so
; that a fresh reinstall starts from a clean state. Updates must preserve this
; state so users do not need to run developer/database setup again.
;
; NOTE: PostgreSQL data is intentionally NOT touched here. It lives on a
; separate database server and must be reset deliberately by an admin, not as
; a side effect of uninstalling a client.

!macro NSIS_HOOK_POSTUNINSTALL
  ; WebView2 user data: IndexedDB (Dexie), localStorage, caches.
  RMDir /r "$LOCALAPPDATA\com.asepimamnawawi-imam76.frayukti-app"
  ; Persisted database_url.txt and other config.
  RMDir /r "$APPDATA\frayukti"
!macroend
