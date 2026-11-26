Unicode true
Name "NoxFlash"
BrandingText "NoxFlash"
!ifndef BUILDER_OUTPUT
!define BUILDER_OUTPUT "uninstaller-builder.exe"
!endif
OutFile "${BUILDER_OUTPUT}"
RequestExecutionLevel user
SetCompressor zlib
VIProductVersion "2.0.7.0"
VIAddVersionKey /LANG=1033 "ProductName" "NoxFlash"
VIAddVersionKey /LANG=1033 "CompanyName" "NoxFlash"
VIAddVersionKey /LANG=1033 "FileDescription" "NoxFlash Uninstaller"
VIAddVersionKey /LANG=1033 "FileVersion" "2.0.7"
VIAddVersionKey /LANG=1033 "LegalCopyright" "NoxFlash"
UninstallCaption "卸载 NoxFlash"
UninstallText "仅删除 NoxFlash 程序文件。画布、素材、输出、配置和历史记录会保留在原目录。"
UninstPage uninstConfirm
UninstPage instfiles

Section
  WriteUninstaller "$EXEDIR\Uninstall NoxFlash.exe"
SectionEnd

Function un.onInit
  IfFileExists "$INSTDIR\resources\app.asar" 0 invalid
  IfFileExists "$INSTDIR\resources\backend\main.py" valid invalid
invalid:
  MessageBox MB_OK|MB_ICONSTOP "未找到 NoxFlash 安装目录，已取消卸载。"
  Abort
valid:
FunctionEnd

Function un.CheckClosed
check:
  IfFileExists "$INSTDIR\NoxFlash.exe" 0 backend
  System::Call 'kernel32::CreateFileW(t "$INSTDIR\NoxFlash.exe", i 0x80000000, i 0, p 0, i 3, i 0, p 0) p .r0'
  IntCmp $0 -1 locked
  System::Call 'kernel32::CloseHandle(p r0)'
backend:
  IfFileExists "$INSTDIR\resources\backend\NoxFlash.exe" 0 done
  System::Call 'kernel32::CreateFileW(t "$INSTDIR\resources\backend\NoxFlash.exe", i 0x80000000, i 0, p 0, i 3, i 0, p 0) p .r0'
  IntCmp $0 -1 locked
  System::Call 'kernel32::CloseHandle(p r0)'
  Goto done
locked:
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "NoxFlash 或后端仍在运行。请保存画布并退出软件，再重试。" IDRETRY check
  Abort
done:
FunctionEnd

Section "Uninstall"
  Call un.CheckClosed
  SetOutPath "$TEMP"
  ; The generated include lists program files individually. It contains no recursive removal.
  !include "${__FILEDIR__}\owned-files.nsh"
  Delete "$INSTDIR\Uninstall NoxFlash.exe"
  RMDir "$INSTDIR"
SectionEnd

