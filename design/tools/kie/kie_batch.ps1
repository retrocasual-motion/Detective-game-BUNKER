# Пачка генераций Nano Banana Pro через kie.ai: загрузка референсов, параллельный запуск,
# ожидание, скачивание, журнал. Описание и формат файла задания — README.md рядом.
# Windows PowerShell 5.1+. Ключ — переменная KIE_API_KEY (пользователь или процесс); не выводится.
param(
  [Parameter(Mandatory = $true)] [string]$JobFile,
  [switch]$DryRun,          # только проверить задание и показать цену, ничего не тратить
  [int]$Retries = 1,        # сколько раз перезапустить задачу, если kie.ai вернул fail
  [int]$TimeoutMin = 10     # сколько ждать всю пачку
)
$ErrorActionPreference = 'Stop'
$Api = 'https://api.kie.ai/api/v1'
$UploadUrl = 'https://kieai.redpandaai.co/api/file-stream-upload'
$Model = 'nano-banana-pro'
$Price = @{ '1K' = 18; '2K' = 18; '4K' = 24 }   # кредиты за картинку, kie.ai 26.11.2026
$UploadTtlHours = 24                              # сколько доверять ссылке на загруженный референс
$Aspects = '1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9','auto'

function Fail([string]$m) { Write-Output "ОШИБКА: $m"; exit 1 }

# --- ключ ---------------------------------------------------------------------------------
$key = $env:KIE_API_KEY
if ([string]::IsNullOrEmpty($key)) { $key = [Environment]::GetEnvironmentVariable('KIE_API_KEY', 'User') }
if ([string]::IsNullOrEmpty($key)) { Fail 'переменная KIE_API_KEY не задана (см. README.md)' }
$H = @{ Authorization = "Bearer $key" }

# --- задание ------------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $JobFile)) { Fail "нет файла задания: $JobFile" }
$jobDir = Split-Path -Parent (Resolve-Path -LiteralPath $JobFile)
$spec = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $JobFile), [Text.Encoding]::UTF8) | ConvertFrom-Json

function Pick($obj, [string]$name, $default) {
  if ($obj.PSObject.Properties.Name -contains $name -and $null -ne $obj.$name -and "$($obj.$name)" -ne '') { return $obj.$name }
  return $default
}

$outDir = Pick $spec 'outDir' $null
if (-not $outDir) { Fail 'в задании нет outDir' }
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
$defRes = Pick $spec 'resolution' '2K'
$defAsp = Pick $spec 'aspect' '1:1'

$refs = @{}
if ($spec.PSObject.Properties.Name -contains 'refs' -and $spec.refs) {
  foreach ($p in $spec.refs.PSObject.Properties) {
    $path = [string]$p.Value
    if ($path -notmatch '^https?://' -and -not [IO.Path]::IsPathRooted($path)) { $path = Join-Path $jobDir $path }
    $refs[$p.Name] = $path
  }
}

$jobs = @()
$labels = @{}
foreach ($j in @($spec.jobs)) {
  $label = [string](Pick $j 'label' '')
  if (-not $label) { Fail 'у задачи нет label' }
  if ($labels.ContainsKey($label)) { Fail "label повторяется: $label" }
  $labels[$label] = 1
  $prompt = [string](Pick $j 'prompt' '')
  if (-not $prompt) { Fail "$label — пустой prompt" }
  $res = [string](Pick $j 'resolution' $defRes)
  $asp = [string](Pick $j 'aspect' $defAsp)
  if (-not $Price.ContainsKey($res)) { Fail "$label — resolution '$res' (можно 1K, 2K, 4K)" }
  if ($Aspects -notcontains $asp) { Fail "$label — aspect '$asp' (можно $($Aspects -join ', '))" }
  $jr = @(Pick $j 'refs' @())
  if ($jr.Count -gt 8) { Fail "$label — больше 8 референсов" }
  foreach ($r in $jr) {
    if (-not $refs.ContainsKey($r)) { Fail "$label — референс '$r' не описан в refs" }
    $rp = $refs[$r]
    if ($rp -notmatch '^https?://' -and -not (Test-Path -LiteralPath $rp)) { Fail "$label — нет файла референса $r`: $rp" }
  }
  $jobs += [pscustomobject]@{ Label = $label; Prompt = $prompt; Res = $res; Asp = $asp; Refs = $jr
    TaskId = $null; State = 'new'; Tries = 0; Credits = $null; File = $null; Msg = ''; ResultUrl = $null }
}
if ($jobs.Count -eq 0) { Fail 'в задании нет jobs' }

# --- цена и баланс ------------------------------------------------------------------------
$cost = 0; foreach ($j in $jobs) { $cost += $Price[$j.Res] }
$bal = (Invoke-RestMethod -Uri "$Api/chat/credit" -Headers $H).data
Write-Output ("Задач: {0}; цена: {1} кредитов (~`${2:N2}); на счету: {3}" -f $jobs.Count, $cost, ($cost * 0.005), $bal)
if ($DryRun) { Write-Output 'DryRun: ничего не запущено.'; exit 0 }
if ($cost -gt $bal) { Fail 'кредитов не хватает на всю пачку — ничего не запущено' }

# --- референсы: загрузка с кэшем ----------------------------------------------------------
$cacheDir = Join-Path $env:LOCALAPPDATA 'bunker-kie'
$cacheFile = Join-Path $cacheDir 'upload_cache.json'
if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null }
$cache = @{}
if (Test-Path $cacheFile) {
  $c = [IO.File]::ReadAllText($cacheFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($p in $c.PSObject.Properties) { $cache[$p.Name] = $p.Value }
}
$refUrl = @{}
$used = @($jobs | ForEach-Object { $_.Refs } | Select-Object -Unique)
foreach ($r in $used) {
  $rp = $refs[$r]
  if ($rp -match '^https?://') { $refUrl[$r] = $rp; continue }
  $fi = Get-Item -LiteralPath $rp
  $ck = '{0}|{1}|{2}' -f $fi.FullName, $fi.Length, $fi.LastWriteTimeUtc.Ticks
  if ($cache.ContainsKey($ck) -and ((Get-Date).ToUniversalTime() - [datetime]$cache[$ck].at).TotalHours -lt $UploadTtlHours) {
    $refUrl[$r] = $cache[$ck].url; Write-Output "реф $r — из кэша"; continue
  }
  $raw = & curl.exe -sS -X POST $UploadUrl -H "Authorization: Bearer $key" -F "file=@$($fi.FullName)" --form-string 'uploadPath=bunker-refs' --form-string "fileName=$($fi.Name)"
  $u = $raw | ConvertFrom-Json
  if (-not $u.success) { Fail "загрузка референса $r`: code=$($u.code) msg=$($u.msg)" }
  $refUrl[$r] = $u.data.downloadUrl
  $cache[$ck] = [pscustomobject]@{ url = $u.data.downloadUrl; at = (Get-Date).ToUniversalTime().ToString('o') }
  Write-Output ("реф {0} — загружен ({1:N1} МБ)" -f $r, ($fi.Length / 1MB))
}
[IO.File]::WriteAllText($cacheFile, ($cache | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))

# --- запуск -------------------------------------------------------------------------------
function Submit($j) {
  $urls = @($j.Refs | ForEach-Object { $refUrl[$_] })
  $body = @{ model = $Model; input = @{ prompt = $j.Prompt; image_input = $urls; aspect_ratio = $j.Asp; resolution = $j.Res; output_format = 'png' } } | ConvertTo-Json -Depth 5
  $r = Invoke-RestMethod -Method Post -Uri "$Api/jobs/createTask" -Headers $H -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
  $j.Tries++
  if ($r.code -ne 200) { $j.State = 'fail'; $j.Msg = "createTask code=$($r.code) $($r.msg)"; return }
  $j.TaskId = $r.data.taskId; $j.State = 'waiting'
}
foreach ($j in $jobs) { Submit $j }
Write-Output ("Запущено: {0}. Жду…" -f @($jobs | Where-Object { $_.TaskId }).Count)

$t0 = Get-Date
while ($true) {
  $pending = @($jobs | Where-Object { $_.State -in 'waiting', 'queuing', 'generating' })
  if ($pending.Count -eq 0) { break }
  if (((Get-Date) - $t0).TotalMinutes -gt $TimeoutMin) { foreach ($j in $pending) { $j.Msg = "таймаут, последнее состояние $($j.State)"; $j.State = 'timeout' }; break }
  Start-Sleep -Seconds 4
  foreach ($j in $pending) {
    $s = (Invoke-RestMethod -Uri "$Api/jobs/recordInfo?taskId=$($j.TaskId)" -Headers $H).data
    $j.State = $s.state
    if ($s.state -eq 'success') {
      $j.Credits = $s.creditsConsumed
      $j.ResultUrl = @(($s.resultJson | ConvertFrom-Json).resultUrls)[0]
      $safe = ($j.Label -replace '[\\/:*?"<>|\s]', '_')
      $f = Join-Path $outDir "$safe.png"; $n = 2
      while (Test-Path -LiteralPath $f) { $f = Join-Path $outDir ("{0}_{1}.png" -f $safe, $n); $n++ }
      Invoke-WebRequest -Uri $j.ResultUrl -OutFile $f -UseBasicParsing
      $j.File = $f
      Write-Output ("готово {0} ({1:N0} с)" -f $j.Label, ((Get-Date) - $t0).TotalSeconds)
    } elseif ($s.state -eq 'fail') {
      $j.Msg = "failCode=$($s.failCode) $($s.failMsg)"
      if ($j.Tries -le $Retries) { Write-Output "сбой $($j.Label): $($j.Msg) — перезапуск"; Submit $j }
    }
  }
}

# --- журнал и итог ------------------------------------------------------------------------
$log = Join-Path $outDir '_kie_log.jsonl'
$utf8 = New-Object Text.UTF8Encoding $false
foreach ($j in $jobs) {
  $line = [pscustomobject]@{
    at = (Get-Date).ToString('s'); label = $j.Label; state = $j.State; taskId = $j.TaskId; model = $Model
    resolution = $j.Res; aspect = $j.Asp; credits = $j.Credits; file = $j.File; resultUrl = $j.ResultUrl; msg = $j.Msg
    refs = @($j.Refs | ForEach-Object { [pscustomobject]@{ name = $_; local = $refs[$_]; url = $refUrl[$_] } })
    prompt = $j.Prompt; jobFile = (Resolve-Path -LiteralPath $JobFile).Path
  } | ConvertTo-Json -Depth 5 -Compress
  [IO.File]::AppendAllText($log, $line + "`n", $utf8)
}
Write-Output ''
Write-Output 'Итог:'
foreach ($j in $jobs) { Write-Output ("{0} — {1} — {2} — кредитов {3}{4}" -f $j.Label, $j.State, $j.TaskId, $j.Credits, $(if ($j.Msg) { " — $($j.Msg)" } else { '' })) }
$bal2 = (Invoke-RestMethod -Uri "$Api/chat/credit" -Headers $H).data
Write-Output "На счету: $bal2"
foreach ($j in $jobs) { if ($j.File) { Write-Output "FILE: $($j.File)" } }
if (@($jobs | Where-Object { $_.State -ne 'success' }).Count -gt 0) { exit 2 }
