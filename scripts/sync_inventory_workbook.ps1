param(
  [string]$WorkbookPath,
  [string]$ApiUrl = "https://dkuh-pharmacy-sync.drugrestaurant.chatgpt.site/api/app-state",
  [switch]$InitializeFromWorkbook,
  [switch]$Watch,
  [switch]$Install,
  [int]$IntervalSeconds = 2
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$stateReader = Join-Path $scriptRoot "inventory_workbook_state.mjs"
$taskName = "HospitalInventoryWorkbookSync"

if (-not $WorkbookPath) {
  $WorkbookPath = Join-Path $projectRoot "비품약 현황\병동별 비품약·비치마약류 현황_2026-08-18_앱반영.xlsx"
}

function Write-SyncLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date).ToString("s"), $Message
  Write-Host $line
  $logDirectory = Join-Path $projectRoot ".deploy"
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  Add-Content -LiteralPath (Join-Path $logDirectory "inventory-workbook-sync.log") -Value $line -Encoding UTF8
}

function Get-Text($Value) {
  if ($null -eq $Value) { return "" }
  return ([string]$Value).Trim()
}

function Test-WorkbookWritable {
  try {
    $stream = [System.IO.File]::Open($WorkbookPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $stream.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-WorkbookFingerprint {
  return (Get-FileHash -LiteralPath $WorkbookPath -Algorithm SHA256).Hash
}

function Get-WorkbookState {
  $output = & node $stateReader --extract $WorkbookPath
  if ($LASTEXITCODE -ne 0) { throw "비치약 엑셀을 읽지 못했습니다." }
  return ($output | ConvertFrom-Json)
}

function Get-RemoteState {
  return Invoke-RestMethod -Uri $ApiUrl -Method Get -Headers @{ Accept = "application/json"; "Cache-Control" = "no-cache" }
}

function Copy-StateObject($State) {
  $copy = [ordered]@{}
  if ($null -ne $State) {
    foreach ($property in $State.PSObject.Properties) {
      $copy[$property.Name] = $property.Value
    }
  }
  return $copy
}

function Merge-WorkbookIntoState($RemoteState, $WorkbookState) {
  $state = Copy-StateObject $RemoteState
  $state.stockDrugs = @($WorkbookState.stockDrugs)
  $state.stockRooms = @($WorkbookState.stockRooms)
  $state.stockAllocations = @($WorkbookState.stockAllocations)
  $state.narcoticDrugs = @($WorkbookState.narcoticDrugs)
  $state.narcoticRooms = @($WorkbookState.narcoticRooms)
  $state.narcoticAllocations = @($WorkbookState.narcoticAllocations)

  $categories = [ordered]@{}
  if ($null -ne $RemoteState.narcoticDrugCategories) {
    foreach ($property in $RemoteState.narcoticDrugCategories.PSObject.Properties) {
      $categories[$property.Name] = $property.Value
    }
  }
  if ($null -ne $WorkbookState.narcoticDrugCategories) {
    foreach ($property in $WorkbookState.narcoticDrugCategories.PSObject.Properties) {
      $categories[$property.Name] = $property.Value
    }
  }
  $state.narcoticDrugCategories = $categories
  return $state
}

function Send-RemoteState($Remote, $State, [switch]$Force) {
  $envelope = [ordered]@{
    version = 1
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    clientId = "inventory-workbook-sync"
    state = $State
  }
  $body = [ordered]@{ envelope = $envelope; baseSha = $Remote.sha }
  if ($Force) { $body.force = $true }
  return Invoke-RestMethod -Uri $ApiUrl -Method Put -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 100 -Compress)
}

function Import-WorkbookToServer([switch]$Force) {
  if (-not (Test-WorkbookWritable)) {
    throw "엑셀 파일이 열려 있습니다. 저장 후 닫은 다음 다시 실행하세요."
  }
  $workbookState = Get-WorkbookState
  $remote = Get-RemoteState
  $state = Merge-WorkbookIntoState $remote.envelope.state $workbookState
  try {
    return Send-RemoteState $remote $state -Force:$Force
  } catch {
    if ($_.Exception.Message -notmatch "409") { throw }
    $remote = Get-RemoteState
    $state = Merge-WorkbookIntoState $remote.envelope.state $workbookState
    return Send-RemoteState $remote $state -Force
  }
}

function Get-UsedLastRow($Sheet) {
  return $Sheet.UsedRange.Row + $Sheet.UsedRange.Rows.Count - 1
}

function Get-UsedLastColumn($Sheet) {
  return $Sheet.UsedRange.Column + $Sheet.UsedRange.Columns.Count - 1
}

function Find-HeaderColumn($Sheet, [int]$Row, [string]$Header) {
  for ($column = 1; $column -le (Get-UsedLastColumn $Sheet); $column += 1) {
    if ((Get-Text $Sheet.Cells.Item($Row, $column).Value2) -eq $Header) { return $column }
  }
  return -1
}

function Find-Row($Sheet, [int]$Column, [string]$Pattern) {
  for ($row = 1; $row -le (Get-UsedLastRow $Sheet); $row += 1) {
    if ((Get-Text $Sheet.Cells.Item($row, $Column).Value2) -match $Pattern) { return $row }
  }
  return -1
}

function ConvertTo-ColumnName([int]$Column) {
  $name = ""
  while ($Column -gt 0) {
    $Column -= 1
    $name = [char](65 + ($Column % 26)) + $name
    $Column = [math]::Floor($Column / 26)
  }
  return $name
}

function Get-AllocationMap($Allocations) {
  $map = @{}
  foreach ($allocation in @($Allocations)) {
    $quantity = [double]$allocation.requiredQty
    if ($quantity -le 0) { continue }
    $code = Get-Text $allocation.drugCode
    $room = Get-Text $allocation.roomId
    if (-not $map.ContainsKey($code)) { $map[$code] = @{} }
    $map[$code][$room] = $quantity
  }
  return $map
}

function Save-PrewriteBackup {
  $versionDirectory = Join-Path (Split-Path -Parent $WorkbookPath) "버전 보관"
  New-Item -ItemType Directory -Path $versionDirectory -Force | Out-Null
  $stamp = (Get-Date).ToString("yyyy.MM.dd.HHmmss")
  $backupPath = Join-Path $versionDirectory ("병동별 비품약·비치마약류 현황_v{0}_자동반영전.xlsx" -f $stamp)
  Copy-Item -LiteralPath $WorkbookPath -Destination $backupPath -ErrorAction Stop
  return $backupPath
}

function Apply-StockState($Sheet, $Excel, $State) {
  $summaryRow = Find-Row $Sheet 3 "보유비품약\s*품목수"
  if ($summaryRow -lt 0) { throw "비치약 품목수 행을 찾지 못했습니다." }
  $totalColumn = Find-HeaderColumn $Sheet 1 "합계"
  if ($totalColumn -lt 0) { throw "비치약 합계 열을 찾지 못했습니다." }

  $roomColumns = @{}
  for ($column = 7; $column -lt $totalColumn; $column += 1) {
    $name = Get-Text $Sheet.Cells.Item(1, $column).Value2
    if ($name) { $roomColumns[$name] = $column }
  }
  foreach ($room in @($State.stockRooms)) {
    $roomId = Get-Text $room.id
    if (-not $roomId -or $roomColumns.ContainsKey($roomId)) { continue }
    $Sheet.Columns.Item($totalColumn).Insert() | Out-Null
    $header = Get-Text $room.sourceColumn
    if (-not $header) { $header = Get-Text $room.label }
    if (-not $header) { $header = $roomId }
    $Sheet.Cells.Item(1, $totalColumn).Value2 = $header
    $roomColumns[$roomId] = $totalColumn
    $totalColumn += 1
  }

  $rowByCode = @{}
  for ($row = 2; $row -lt $summaryRow; $row += 1) {
    $code = Get-Text $Sheet.Cells.Item($row, 1).Value2
    if ($code) { $rowByCode[$code] = $row }
  }
  $allocationMap = Get-AllocationMap $State.stockAllocations
  foreach ($drug in @($State.stockDrugs)) {
    $code = Get-Text $drug.code
    if (-not $code) { continue }
    $row = $rowByCode[$code]
    if (-not $row) {
      $Sheet.Rows.Item($summaryRow).Insert() | Out-Null
      $Sheet.Rows.Item($summaryRow - 1).Copy()
      $Sheet.Rows.Item($summaryRow).PasteSpecial(-4122)
      $Excel.CutCopyMode = 0
      $row = $summaryRow
      $rowByCode[$code] = $row
      $summaryRow += 1
    }
    $Sheet.Range($Sheet.Cells.Item($row, 1), $Sheet.Cells.Item($row, $totalColumn)).ClearContents()
    $Sheet.Cells.Item($row, 1).Value2 = $code
    $Sheet.Cells.Item($row, 2).Value2 = Get-Text $drug.genericName
    $Sheet.Cells.Item($row, 3).Value2 = Get-Text $drug.productName
    $Sheet.Cells.Item($row, 4).Value2 = Get-Text $drug.spec
    $Sheet.Cells.Item($row, 5).Value2 = Get-Text $drug.storage
    $note = Get-Text $drug.note
    if (-not $note) { $note = Get-Text $drug.warning }
    $Sheet.Cells.Item($row, 6).Value2 = $note
    if ($allocationMap.ContainsKey($code)) {
      foreach ($roomId in $allocationMap[$code].Keys) {
        if ($roomColumns.ContainsKey($roomId)) {
          $Sheet.Cells.Item($row, $roomColumns[$roomId]).Value2 = $allocationMap[$code][$roomId]
        }
      }
    }
    $firstRoom = ConvertTo-ColumnName 7
    $lastRoom = ConvertTo-ColumnName ($totalColumn - 1)
    $Sheet.Cells.Item($row, $totalColumn).Formula = "=IF(COUNT(${firstRoom}${row}:${lastRoom}${row})=0,`"`",SUM(${firstRoom}${row}:${lastRoom}${row}))"
  }
}

function Apply-NarcoticState($Sheet, $Excel, $State) {
  $titleRow = Find-Row $Sheet 1 "병동별\s*비치\s*향정[·ㆍ\s]*마약\s*현황"
  if ($titleRow -lt 0) { throw "비치 향정·마약 현황 표를 찾지 못했습니다." }
  $headerRow = $titleRow + 1
  $totalColumn = Find-HeaderColumn $Sheet $headerRow "합계"
  if ($totalColumn -lt 0) { throw "비치 향정·마약 합계 열을 찾지 못했습니다." }
  $roomColumns = @{}
  for ($column = 7; $column -lt $totalColumn; $column += 1) {
    $name = Get-Text $Sheet.Cells.Item($headerRow, $column).Value2
    if ($name) { $roomColumns[$name] = $column }
  }
  foreach ($room in @($State.narcoticRooms)) {
    $roomId = Get-Text $room.id
    if (-not $roomId -or $roomColumns.ContainsKey($roomId)) { continue }
    $nextTotalColumn = $totalColumn + 1
    if (Get-Text $Sheet.Cells.Item($headerRow, $nextTotalColumn).Value2) {
      throw "비치마약류 표에 보유실 '$roomId'을 추가할 빈 열이 없습니다."
    }
    $Sheet.Cells.Item($headerRow, $nextTotalColumn).Value2 = "합계"
    $Sheet.Cells.Item($headerRow, $totalColumn).Value2 = $roomId
    $roomColumns[$roomId] = $totalColumn
    $totalColumn = $nextTotalColumn
  }

  $rowByCode = @{}
  $insertRow = $headerRow + 1
  while ($insertRow -le (Get-UsedLastRow $Sheet)) {
    $code = Get-Text $Sheet.Cells.Item($insertRow, 3).Value2
    if (-not $code) { break }
    $rowByCode[$code] = $insertRow
    $insertRow += 1
  }
  $allocationMap = Get-AllocationMap $State.narcoticAllocations
  foreach ($drug in @($State.narcoticDrugs)) {
    $code = Get-Text $drug.code
    if (-not $code) { continue }
    $row = $rowByCode[$code]
    if (-not $row) {
      $Sheet.Rows.Item($insertRow).Insert() | Out-Null
      $Sheet.Rows.Item($insertRow - 1).Copy()
      $Sheet.Rows.Item($insertRow).PasteSpecial(-4122)
      $Excel.CutCopyMode = 0
      $row = $insertRow
      $rowByCode[$code] = $row
      $insertRow += 1
    }
    $Sheet.Range($Sheet.Cells.Item($row, 1), $Sheet.Cells.Item($row, $totalColumn)).ClearContents()
    $category = Get-Text $State.narcoticDrugCategories.$code
    if (-not $category) { $category = Get-Text $drug.warning }
    if (-not $category) { $category = "향정" }
    $Sheet.Cells.Item($row, 1).Value2 = $category
    $Sheet.Cells.Item($row, 3).Value2 = $code
    $name = Get-Text $drug.productName
    if (-not $name) { $name = Get-Text $drug.genericName }
    $Sheet.Cells.Item($row, 5).Value2 = $name
    if ($allocationMap.ContainsKey($code)) {
      foreach ($roomId in $allocationMap[$code].Keys) {
        if ($roomColumns.ContainsKey($roomId)) {
          $Sheet.Cells.Item($row, $roomColumns[$roomId]).Value2 = $allocationMap[$code][$roomId]
        }
      }
    }
    $firstRoom = ConvertTo-ColumnName 7
    $lastRoom = ConvertTo-ColumnName ($totalColumn - 1)
    $Sheet.Cells.Item($row, $totalColumn).Formula = "=IF(COUNT(${firstRoom}${row}:${lastRoom}${row})=0,0,SUM(${firstRoom}${row}:${lastRoom}${row}))"
  }
}

function Write-RemoteStateToWorkbook($State) {
  if (-not (Test-WorkbookWritable)) {
    throw "엑셀 파일이 열려 있습니다. 자동 반영을 위해 저장 후 닫아 주세요."
  }
  $backup = Save-PrewriteBackup
  $excel = $null
  $book = $null
  try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $book = $excel.Workbooks.Open($WorkbookPath, 0, $false)
    if ($book.ReadOnly) { throw "엑셀 파일이 읽기 전용으로 열렸습니다." }
    $sheet = $book.Worksheets.Item("비품현황표(전체)")
    Apply-StockState $sheet $excel $State
    Apply-NarcoticState $sheet $excel $State
    $excel.CalculateFull()
    $book.Save()
    Write-SyncLog "공용 서버 변경을 엑셀에 반영했습니다. 원복본: $backup"
  } finally {
    if ($book) { $book.Close($true) }
    if ($excel) { $excel.Quit() }
    if ($sheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
    if ($book) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($book) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
}

if ($Install) {
  $argument = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Watch -WorkbookPath `"$WorkbookPath`""
  $action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME "pwsh.exe") -Argument $argument
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description "비치약·비치마약류 엑셀과 공용 앱 상태를 동기화합니다." -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-SyncLog "자동 동기화 작업을 등록했습니다: $taskName"
  exit 0
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "기준 엑셀 파일을 찾지 못했습니다: $WorkbookPath"
}

if ($InitializeFromWorkbook) {
  $saved = Import-WorkbookToServer -Force
  Write-SyncLog "현재 수기 수정본을 공용 기준으로 등록했습니다. 서버 버전: $($saved.sha)"
}

if (-not $Watch) { exit 0 }

while (-not (Test-WorkbookWritable)) {
  Write-SyncLog "엑셀 파일이 열려 있어 감시 시작을 대기합니다. 저장 후 닫으면 자동으로 시작합니다."
  Start-Sleep -Seconds ([math]::Max(2, $IntervalSeconds))
}

$lastFingerprint = Get-WorkbookFingerprint
$remote = Get-RemoteState
$lastRemoteSha = Get-Text $remote.sha
Write-SyncLog "비치약·비치마약류 엑셀 자동 동기화를 시작했습니다: $WorkbookPath"

while ($true) {
  Start-Sleep -Seconds ([math]::Max(2, $IntervalSeconds))
  try {
    if (-not (Test-WorkbookWritable)) {
      Write-SyncLog "엑셀 파일이 열려 있어 동기화를 잠시 보류합니다."
      continue
    }
    $currentFingerprint = Get-WorkbookFingerprint
    if ($currentFingerprint -ne $lastFingerprint) {
      $saved = Import-WorkbookToServer -Force
      $lastRemoteSha = Get-Text $saved.sha
      $lastFingerprint = Get-WorkbookFingerprint
      Write-SyncLog "수기 엑셀 변경을 공용 서버에 반영했습니다. 서버 버전: $lastRemoteSha"
      continue
    }
    $remote = Get-RemoteState
    if ((Get-Text $remote.sha) -and (Get-Text $remote.sha) -ne $lastRemoteSha) {
      Write-RemoteStateToWorkbook $remote.envelope.state
      $lastRemoteSha = Get-Text $remote.sha
      $lastFingerprint = Get-WorkbookFingerprint
    }
  } catch {
    Write-SyncLog "동기화 실패: $($_.Exception.Message)"
  }
}
