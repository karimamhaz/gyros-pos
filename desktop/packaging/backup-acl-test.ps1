# Run on Windows 10 as the ordinary (not administrator) user that runs the POS.
# Every line must say PASS before backup protection may be claimed.
$folder = Join-Path $env:ProgramData "GyrosPOS\Backups"
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (([Security.Principal.WindowsPrincipal]$id).IsInRole("Administrators")) { throw "run as a standard user" }
$file = Join-Path $folder ("acl-test-" + [guid]::NewGuid() + ".db.gz")
$failed = 0
function Check($name, $shouldWork, [scriptblock]$action) {
  try { & $action | Out-Null; $worked = $true } catch { $worked = $false }
  if ($worked -eq $shouldWork) { "PASS $name" } else { "FAIL $name"; $script:failed++ }
}
Check "create and write" $true {
  $s = [IO.File]::Open($file, "CreateNew", "Write"); $s.Write([byte[]](1, 2, 3), 0, 3); $s.Flush($true); $s.Close()
  if ((Get-Item $file -ErrorAction Stop).Length -ne 3) { throw "short" }
}
Check "read" $true { [IO.File]::ReadAllBytes($file) }
$targets = @($file) + @(Get-ChildItem $folder -Filter "pos_*" | Select-Object -First 1 -ExpandProperty FullName)
foreach ($t in $targets) {
  Check "overwrite $t" $false { [IO.File]::WriteAllBytes($t, [byte[]](9)) }
  Check "append $t" $false { $s = [IO.File]::Open($t, "Append", "Write"); $s.Close() }
  Check "rename $t" $false { Rename-Item $t "renamed.gz" -ErrorAction Stop }
  Check "move $t" $false { Move-Item $t $env:TEMP -ErrorAction Stop }
  Check "delete $t" $false { Remove-Item $t -Force -ErrorAction Stop }
  Check "attributes $t" $false { Set-ItemProperty $t IsReadOnly $true -ErrorAction Stop }
  Check "permissions $t" $false {
    icacls $t /grant "$($id.Name):F" 2>$null; if ($LASTEXITCODE -ne 0) { throw "denied" }
  }
  Check "ownership $t" $false { takeown /f $t 2>$null; if ($LASTEXITCODE -ne 0) { throw "denied" } }
}
Check "delete the folder" $false { Remove-Item $folder -Recurse -Force -ErrorAction Stop }
if ($failed) { "$failed FAILED"; exit 1 } else { "ALL PASSED (an administrator may now remove $file)" }
