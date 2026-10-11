# Updates ProjectFlow_Financial_2026.xlsx from .tools/payment-reconciliation-2026.json
# Opens workbook in Microsoft Excel (requires Excel installed).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$xlsx = Join-Path $root 'ProjectFlow_Financial_2026.xlsx'
$jsonPath = Join-Path $root '.tools/payment-reconciliation-2026.json'

if (-not (Test-Path $xlsx)) { throw "Missing $xlsx" }
if (-not (Test-Path $jsonPath)) { throw "Run .tools/payment-reconciliation-report.mjs first" }

$data = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $wb = $excel.Workbooks.Open($xlsx)
  $sheetName = 'Payment_Reconciliation_2026'
  foreach ($s in @($wb.Worksheets)) {
    if ($s.Name -eq $sheetName) { $s.Delete() }
  }
  $ws = $wb.Worksheets.Add()
  $ws.Name = $sheetName
  $ws.DisplayRightToLeft = $true

  $row = 1
  $ws.Cells.Item($row, 1).Value2 = 'Payment reconciliation org 8ef9 (2026 installments)'
  $row = 3
  @('Month', 'NET recognized', 'GROSS paid verified', 'GROSS date unknown') | ForEach-Object -Begin { $col = 1 } -Process {
    $ws.Cells.Item($row, $col).Value2 = $_
    $col++
  }
  $row++
  foreach ($m in @('2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10')) {
    $mo = $data.monthly.$m
    $ws.Cells.Item($row, 1).Value2 = $m
    $ws.Cells.Item($row, 2).Value2 = [double]$mo.netRecognized
    $ws.Cells.Item($row, 3).Value2 = [double]$mo.grossPaidVerified
    $ws.Cells.Item($row, 4).Value2 = [double]$mo.dateUnknownGross
    $row++
  }

  $row += 2
  $ws.Cells.Item($row, 1).Value2 = 'Installment transactions'
  $row++
  @('Supplier', 'Status', 'Paid/Total inst', 'GROSS paid', 'GROSS verified', 'GROSS unknown date', 'Open GROSS', 'Audit count') | ForEach-Object -Begin { $col = 1 } -Process {
    $ws.Cells.Item($row, $col).Value2 = $_
    $col++
  }
  $row++
  foreach ($t in $data.transactions) {
    $ws.Cells.Item($row, 1).Value2 = $t.supplier
    $ws.Cells.Item($row, 2).Value2 = $t.status
    $ws.Cells.Item($row, 3).Value2 = "$($t.paidCount)/$($t.installments)"
    $ws.Cells.Item($row, 4).Value2 = [double]$t.paidGross
    $ws.Cells.Item($row, 5).Value2 = [double]$t.verifiedGross
    $ws.Cells.Item($row, 6).Value2 = [double]$t.dateUnknownGross
    $ws.Cells.Item($row, 7).Value2 = [double]$t.openGross
    $ws.Cells.Item($row, 8).Value2 = [int]$t.auditCount
    $row++
  }

  $ws.Columns.AutoFit() | Out-Null
  $wb.Save()
  $excel.Visible = $true
  Write-Host "Saved $xlsx sheet $sheetName and opened Excel."
}
catch {
  if ($excel) { $excel.Quit() | Out-Null }
  throw
}
