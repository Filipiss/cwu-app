; backend/build/installer.nsh
; Personalização do instalador (NSIS) do CWU App, incluída pelo electron-builder.
; O instalador assistido já tem as páginas de "para quem instalar" e de pasta de instalação.
; Aqui entra a página de atalhos e inicialização. As escolhas ficam guardadas no registro
; para que as atualizações (que rodam em silêncio, sem páginas) respeitem o que o usuário escolheu.
;
; Fixar na barra de tarefas não é oferecido: desde o Windows 10 (1809) e no Windows 11 a Microsoft
; não deixa programas se fixarem sozinhos. A página explica como o usuário faz isso.

!include nsDialogs.nsh
!include LogicLib.nsh

!define CWU_CHOICES_KEY "Software\CWU-App\Installer"
!define CWU_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define CWU_RUN_VALUE "CWU App"

!macro customPageAfterChangeDir
  Var cwuDesktop
  Var cwuStartMenu
  Var cwuAutostart
  Var cwuDesktopBox
  Var cwuStartMenuBox
  Var cwuAutostartBox

  Page custom cwuOptionsShow cwuOptionsLeave

  Function cwuOptionsShow
    ; Atualização: mantém o que foi escolhido na instalação
    ${if} ${isUpdated}
      Abort
    ${endif}
    !insertmacro MUI_HEADER_TEXT "Atalhos e inicialização" "Escolha onde o CWU App vai aparecer."
    nsDialogs::Create 1018
    Pop $0
    ${if} $0 == error
      Abort
    ${endif}

    ${NSD_CreateCheckbox} 0 0u 100% 12u "Criar atalho na área de trabalho"
    Pop $cwuDesktopBox
    ${if} $cwuDesktop == "1"
      ${NSD_Check} $cwuDesktopBox
    ${endif}

    ${NSD_CreateCheckbox} 0 18u 100% 12u "Criar atalho no menu Iniciar"
    Pop $cwuStartMenuBox
    ${if} $cwuStartMenu == "1"
      ${NSD_Check} $cwuStartMenuBox
    ${endif}

    ${NSD_CreateCheckbox} 0 36u 100% 12u "Iniciar o CWU App com o Windows (abre nos ícones ocultos da barra de tarefas)"
    Pop $cwuAutostartBox
    ${if} $cwuAutostart == "1"
      ${NSD_Check} $cwuAutostartBox
    ${endif}

    ${NSD_CreateLabel} 0 64u 100% 40u "Fixar na barra de tarefas: o Windows não deixa programas se fixarem sozinhos. Depois de abrir o CWU App, clique com o botão direito no ícone dele na barra de tarefas e escolha $\"Fixar na barra de tarefas$\"."
    Pop $0

    nsDialogs::Show
  FunctionEnd

  Function cwuOptionsLeave
    ${NSD_GetState} $cwuDesktopBox $cwuDesktop
    ${NSD_GetState} $cwuStartMenuBox $cwuStartMenu
    ${NSD_GetState} $cwuAutostartBox $cwuAutostart
  FunctionEnd
!macroend

; Valores iniciais: o que foi escolhido antes ou, na primeira instalação, atalhos sim e iniciar com o Windows não
; (o mesmo comportamento das versões anteriores, que criavam os dois atalhos)
!macro customInit
  ReadRegStr $cwuDesktop HKCU "${CWU_CHOICES_KEY}" "Desktop"
  ${if} $cwuDesktop == ""
    StrCpy $cwuDesktop "1"
  ${endif}
  ReadRegStr $cwuStartMenu HKCU "${CWU_CHOICES_KEY}" "StartMenu"
  ${if} $cwuStartMenu == ""
    StrCpy $cwuStartMenu "1"
  ${endif}
  ReadRegStr $cwuAutostart HKCU "${CWU_CHOICES_KEY}" "Autostart"
  ${if} $cwuAutostart == ""
    StrCpy $cwuAutostart "0"
  ${endif}
!macroend

; O electron-builder já criou os dois atalhos: aqui tiramos os que o usuário não quis
!macro customInstall
  WriteRegStr HKCU "${CWU_CHOICES_KEY}" "Desktop" "$cwuDesktop"
  WriteRegStr HKCU "${CWU_CHOICES_KEY}" "StartMenu" "$cwuStartMenu"
  WriteRegStr HKCU "${CWU_CHOICES_KEY}" "Autostart" "$cwuAutostart"
  ; Para quem foi instalado ("all" = todos os usuários, "CurrentUser" = só este usuário) e onde.
  ; O app usa isso para não oferecer voltar a versões cujo instalador só sabe instalar por usuário.
  WriteRegStr HKCU "${CWU_CHOICES_KEY}" "InstallMode" "$installMode"
  WriteRegStr HKCU "${CWU_CHOICES_KEY}" "InstallDir" "$INSTDIR"

  ${if} $cwuDesktop != "1"
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
  ${endif}

  ${if} $cwuStartMenu != "1"
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"
    ; "Executar o CWU App" ao terminar passa a abrir o .exe direto
    StrCpy $launchLink "$appExe"
  ${endif}

  ${if} $cwuAutostart == "1"
    WriteRegStr HKCU "${CWU_RUN_KEY}" "${CWU_RUN_VALUE}" '"$appExe" --hidden'
  ${else}
    DeleteRegValue HKCU "${CWU_RUN_KEY}" "${CWU_RUN_VALUE}"
  ${endif}
!macroend

; Desinstalação de verdade (não atualização): tira o início com o Windows e as escolhas guardadas
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "${CWU_RUN_KEY}" "${CWU_RUN_VALUE}"
    DeleteRegKey HKCU "${CWU_CHOICES_KEY}"
  ${endif}
!macroend
