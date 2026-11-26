Unicode true
Name "NoxFlash Magnetar"
BrandingText "NoxFlash"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\NoxFlash-Magnetar"
InstallDirRegKey HKCU "Software\NoxFlash\Magnetar" "InstallDir"
RequestExecutionLevel user
SetCompressor zlib
!include "MUI2.nsh"
!include "FileFunc.nsh"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Function .onInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  IfErrors done
  IfFileExists "$INSTDIR\resources\app.asar" done
  SetErrorLevel 2
  Abort
done:
FunctionEnd

Section
  ; Give the desktop app and its own backend time to exit before writing anything.
  StrCpy $2 120
retry:
  IfFileExists "$INSTDIR\NoxFlash.exe" 0 backend
  System::Call 'kernel32::CreateFileW(t "$INSTDIR\NoxFlash.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) p .r0'
  IntCmp $0 -1 waiting
  System::Call 'kernel32::CloseHandle(p r0)'
backend:
  IfFileExists "$INSTDIR\resources\backend\NoxFlash.exe" 0 install
  System::Call 'kernel32::CreateFileW(t "$INSTDIR\resources\backend\NoxFlash.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) p .r0'
  IntCmp $0 -1 waiting
  System::Call 'kernel32::CloseHandle(p r0)'
  Goto install
waiting:
  Sleep 500
  IntOp $2 $2 - 1
  IntCmp $2 0 locked retry retry
locked:
  MessageBox MB_OK|MB_ICONSTOP "NoxFlash 仍在运行或安装目录不可写。请保存画布并退出使用同一安装目录的窗口后再试。"
  SetErrorLevel 2
  Abort
install:
  SetOutPath "$INSTDIR"
  SetOverwrite on
  ClearErrors
  File /r "${STAGE}\*.*"
  IfErrors failed
  WriteRegStr HKCU "Software\NoxFlash\Magnetar" "InstallDir" "$INSTDIR"
  CreateShortCut "$SMPROGRAMS\NoxFlash Magnetar.lnk" "$INSTDIR\NoxFlash.exe"
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  IfErrors done
  Exec '"$INSTDIR\NoxFlash.exe"'
done:
  Goto end
failed:
  MessageBox MB_OK|MB_ICONSTOP "程序文件写入失败。请关闭 NoxFlash 后重新运行同一个安装包。"
  SetErrorLevel 3
  Abort
end:
SectionEnd
