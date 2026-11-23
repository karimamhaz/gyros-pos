; Run by the elevated installer. Checks first, then prepares the data and backup folders.
!include "WinVer.nsh"
!include "FileFunc.nsh"

!macro customInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Gyros POS needs Windows 10 or newer. Nothing was changed.$\r$\nيحتاج البرنامج إلى Windows 10 أو أحدث. لم يتغير شيء." /SD IDOK
    Abort
  ${EndIf}
  ${GetRoot} "$WINDIR" $0
  ${DriveSpace} "$0\" "/D=F /S=M" $1
  ${If} $1 < 1500
    MessageBox MB_ICONSTOP "At least 1.5 GB of free disk space is needed. Nothing was changed.$\r$\nيلزم 1.5 غيغابايت على الأقل من مساحة القرص. لم يتغير شيء." /SD IDOK
    Abort
  ${EndIf}
!macroend

!macro runOrAbort COMMAND
  nsExec::ExecToLog '${COMMAND}'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Folder permissions could not be set. Setup stops.$\r$\nتعذر ضبط صلاحيات المجلدات. توقف التثبيت." /SD IDOK
    Abort
  ${EndIf}
!macroend

!macro customInstall
  ReadEnvStr $1 ProgramData
  CreateDirectory "$1\GyrosPOS\Data"
  CreateDirectory "$1\GyrosPOS\Backups"
  ; Data: the app may change its own database.
  !insertmacro runOrAbort 'icacls "$1\GyrosPOS\Data" /grant *S-1-5-32-545:(OI)(CI)M'
  ; Backups: users may list, read and create. Nobody but Administrators and SYSTEM may change or
  ; delete, and OWNER RIGHTS (S-1-3-4) stops a file's creator from changing it later.
  !insertmacro runOrAbort 'icacls "$1\GyrosPOS\Backups" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-32-545:(RX,WD) *S-1-3-4:(OI)(CI)(IO)R'
  !insertmacro runOrAbort 'icacls "$1\GyrosPOS\Backups" /grant *S-1-5-32-545:(OI)(IO)R'
!macroend
