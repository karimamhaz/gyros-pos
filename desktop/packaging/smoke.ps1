# Starts the packaged backend and checks that it is 32-bit and answers.
param([string]$exe)
$ErrorActionPreference = "Stop"
$exe = (Resolve-Path $exe).Path
$bytes = [IO.File]::ReadAllBytes($exe)
$machine = [BitConverter]::ToUInt16($bytes, [BitConverter]::ToInt32($bytes, 0x3C) + 4)
"machine type: 0x{0:X}" -f $machine
if ($machine -ne 0x14C) { throw "not a 32-bit executable" }

$dir = Join-Path $env:RUNNER_TEMP "pos"
$start = [Diagnostics.ProcessStartInfo]::new($exe)
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.UseShellExecute = $false
$start.Environment["POS_DATA_DIR"] = "$dir\Data"
$start.Environment["POS_BACKUP_DIR"] = "$dir\Backups"
$start.Environment["POS_LAUNCH_SECRET"] = "smoke"
$clock = [Diagnostics.Stopwatch]::StartNew()
$process = [Diagnostics.Process]::Start($start)
$error_task = $process.StandardError.ReadToEndAsync()
$line_task = $process.StandardOutput.ReadLineAsync()
try {
  if (-not $line_task.Wait(60000)) { throw "no PORT line within 60 seconds" }
  $line = $line_task.Result
  "first line: $line"
  if ($line -notmatch "^PORT=(\d+)") { throw "unexpected first line" }
  $port = $Matches[1]
  $health = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -Headers @{ "X-Launch-Secret" = "smoke" }
  if ($health.status -ne "ok") { throw "unhealthy: $($health.status)" }
  $process.Refresh()
  "CI figures, not the POS computer: ready in $($clock.ElapsedMilliseconds) ms, $([math]::Round($process.WorkingSet64 / 1MB)) MB"
  $process.StandardInput.Close()
  if (-not $process.WaitForExit(10000)) { throw "did not stop with its parent" }
} catch {
  "FAILED: $_"
  if (-not $process.HasExited) { $process.Kill() }
  $process.WaitForExit(5000) | Out-Null
  "--- backend error output ---"
  if ($error_task.Wait(5000)) { $error_task.Result }
  throw
}
