!include "FileFunc.nsh"
!insertmacro GetParent
!insertmacro GetParameters
!insertmacro GetOptions

Var OldDisplayIcon
Var OldInstallDir

!macro NSIS_HOOK_PREINSTALL
  ; ── 只杀主程序，释放文件锁 ──────────────────────────────────────────
  nsExec::Exec 'taskkill /F /IM xie-li-yan.exe'
  nsExec::Exec 'taskkill /F /IM 写梨眼.exe'

  ; ── 读取旧版 Electron 安装路径（用于 POSTINSTALL 清理残留）────────────
  ReadRegStr $OldDisplayIcon HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\b75398d2-618a-54cf-9227-4766cb7cb025" \
    "DisplayIcon"
  ${If} $OldDisplayIcon == ""
    ReadRegStr $OldDisplayIcon HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\086b4c29-3e54-5e5e-91ed-328111a2c76d" \
      "DisplayIcon"
  ${EndIf}
  ${If} $OldDisplayIcon != ""
    ${GetParent} "$OldDisplayIcon" $OldInstallDir
    ${If} $OldInstallDir != ""
      StrCpy $INSTDIR "$OldInstallDir"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 卸载前只杀主程序
  nsExec::Exec 'taskkill /F /IM xie-li-yan.exe'
  nsExec::Exec 'taskkill /F /IM 写梨眼.exe'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; ── 只清理旧 Electron 残留文件（不动 Tauri2 自己的 resources）────────
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\resources\elevate.exe"
  Delete "$INSTDIR\locales\*.pak"
  RMDir "$INSTDIR\locales"

  ; ── 只删旧 Electron 注册表残留（不动 Tauri2 的）──────────────────────
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\086b4c29-3e54-5e5e-91ed-328111a2c76d"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\b75398d2-618a-54cf-9227-4766cb7cb025"

  ; ── 自动重启应用 ──────────────────────────────────────────────────────
  ; 安装结束后，读取调用方传入的 /RELAUNCH=<exe_path> 参数，
  ; 若存在则用 Exec 拉起新版本，让用户立即看到应用重启，避免误以为安装失败。
  Var /GLOBAL RelaunchPath
  ${GetParameters} $R0
  ${GetOptions} $R0 "/RELAUNCH=" $RelaunchPath
  ${If} $RelaunchPath != ""
    Exec '"$RelaunchPath"'
  ${EndIf}
!macroend

