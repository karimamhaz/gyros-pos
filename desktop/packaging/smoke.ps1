# Starts the packaged backend and checks that it is 32-bit and answers.
param([string]$exe)
$ErrorActionPreference = "Stop"
$bytes = [IO.File]::ReadAllBytes((Resolve-Path $exe))
$machine = [BitConverter]::ToUInt16($bytes, [BitConverter]::ToInt32($bytes, 0x3C) + 4)
if ($machine -ne 0x14C) { throw "not a 32-bit executable" }

$dir = Join-Path $env:RUNNER_TEMP "pos"
$start = [Diagnostics.ProcessStartInfo]::new((Resolve-Path $exe))
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.UseShellExecute = $false
$start.Environment["POS_DATA_DIR"] = "$dir\Data"
$start.Environment["POS_BACKUP_DIR"] = "$dir\Backups"
$start.Environment["POS_LAUNCH_SECRET"] = "smoke"
$clock = [Diagnostics.Stopwatch]::StartNew()
$process = [Diagnostics.Process]::Start($start)
$port = $process.StandardOutput.ReadLine().Split("=")[1].Trim()
$health = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -Headers @{ "X-Launch-Secret" = "smoke" }
if ($health.status -ne "ok") { throw "unhealthy" }
$process.Refresh()
"CI figures, not the POS computer: ready in $($clock.ElapsedMilliseconds) ms, $([math]::Round($process.WorkingSet64 / 1MB)) MB"
$process.StandardInput.Close()
if (-not $process.WaitForExit(10000)) { throw "did not stop with its parent" }
