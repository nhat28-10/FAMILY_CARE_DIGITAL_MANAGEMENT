param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath
)

$ErrorActionPreference = 'Stop'
trap {
  Write-Error ($_.InvocationInfo.PositionMessage + ' ' + $_.Exception.Message)
  exit 1
}

$outputDir = Split-Path -Parent $InputPath
$outputPath = Join-Path $outputDir 'Report5_Unit_Test_FamilyCare_Draft_v0.2.xlsx'

if (-not (Test-Path -LiteralPath $InputPath)) {
  throw "Input workbook not found: $InputPath"
}
if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}
Copy-Item -LiteralPath $InputPath -Destination $outputPath -Force

$xlCenter = -4108
$xlLeft = -4131
$xlTop = -4160
$xlLandscape = 2
$xlThin = 2
$xlContinuous = 1

function Set-Borders($range) {
  foreach ($idx in @(7, 8, 9, 10, 11, 12)) {
    $border = $range.Borders.Item($idx)
    $border.LineStyle = $xlContinuous
    $border.Weight = $xlThin
    $border.Color = 12632256
  }
}

function Style-Header($range) {
  $range.Font.Bold = $true
  $range.Interior.Color = 15189684
  $range.HorizontalAlignment = $xlCenter
  $range.VerticalAlignment = $xlCenter
  Set-Borders $range
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $workbook = $excel.Workbooks.Open($outputPath)
  try {
    foreach ($ws in $workbook.Worksheets) {
      $used = $ws.UsedRange
      $lastRow = $used.Row + $used.Rows.Count - 1
      $lastCol = $used.Column + $used.Columns.Count - 1

      $used.Font.Name = 'Tahoma'
      $used.Font.Size = 9
      $used.VerticalAlignment = $xlCenter
      $used.WrapText = $true
      Set-Borders $used

      $ws.PageSetup.Orientation = $xlLandscape
      $ws.PageSetup.Zoom = $false
      $ws.PageSetup.FitToPagesWide = 1
      $ws.PageSetup.FitToPagesTall = $false

      if ($ws.Name -eq 'Functions') {
        $ws.Columns.Item(1).ColumnWidth = 6
        $ws.Columns.Item(2).ColumnWidth = 20
        $ws.Columns.Item(3).ColumnWidth = 30
        $ws.Columns.Item(4).ColumnWidth = 30
        $ws.Columns.Item(5).ColumnWidth = 13
        $ws.Columns.Item(6).ColumnWidth = 28
        $ws.Columns.Item(7).ColumnWidth = 40
        $ws.Columns.Item(8).ColumnWidth = 38
        Style-Header $ws.Range('A10:H10')
        $ws.Rows.Item(10).RowHeight = 32
        $ws.Rows.Item('11:' + $lastRow).RowHeight = 36
        $ws.Activate() | Out-Null
        $ws.Range('A11').Select() | Out-Null
        $excel.ActiveWindow.FreezePanes = $true
      }
      elseif ($ws.Name -eq 'Statistics') {
        $ws.Columns.Item(1).ColumnWidth = 6
        $ws.Columns.Item(2).ColumnWidth = 14
        for ($c = 3; $c -le 9; $c++) {
          $ws.Columns.Item($c).ColumnWidth = 11
        }
        Style-Header $ws.Range('A11:I11')
        $ws.Rows.Item(11).RowHeight = 32
        $ws.Range('A12:I' + $lastRow).HorizontalAlignment = $xlCenter
        $ws.Activate() | Out-Null
        $ws.Range('A12').Select() | Out-Null
        $excel.ActiveWindow.FreezePanes = $true
      }
      elseif ($ws.Name -like 'FN-*') {
        $caseStartCol = 6
        if ($lastCol -lt $caseStartCol) {
          continue
        }

        $ws.Columns.Item(1).ColumnWidth = 10
        $ws.Columns.Item(2).ColumnWidth = 18
        $ws.Columns.Item(3).ColumnWidth = 12
        $ws.Columns.Item(4).ColumnWidth = 24
        $ws.Columns.Item(5).ColumnWidth = 2

        for ($c = $caseStartCol; $c -le $lastCol; $c++) {
          $ws.Columns.Item($c).ColumnWidth = 6
        }

        $ws.Rows.Item(2).RowHeight = 24
        $ws.Rows.Item(3).RowHeight = 22
        $ws.Rows.Item(4).RowHeight = 22
        $ws.Rows.Item(5).RowHeight = 44
        $ws.Rows.Item(6).RowHeight = 24
        $ws.Rows.Item(7).RowHeight = 22
        $ws.Rows.Item(9).RowHeight = 34
        $ws.Rows.Item(10).RowHeight = 24
        $ws.Rows.Item(11).RowHeight = 34
        $ws.Rows.Item(14).RowHeight = 170
        $ws.Rows.Item(31).RowHeight = 26
        $ws.Rows.Item(35).RowHeight = 52
        $ws.Rows.Item(43).RowHeight = 34
        $ws.Rows.Item(45).RowHeight = 34
        $ws.Rows.Item(46).RowHeight = 26
        $ws.Rows.Item(47).RowHeight = 26
        $ws.Rows.Item(48).RowHeight = 26

        Style-Header $ws.Range($ws.Cells.Item(2, 1), $ws.Cells.Item(7, [Math]::Min($lastCol, 15)))
        Style-Header $ws.Range($ws.Cells.Item(9, $caseStartCol), $ws.Cells.Item(9, $lastCol))
        Style-Header $ws.Range($ws.Cells.Item(45, 2), $ws.Cells.Item(48, 2))

        $caseArea = $ws.Range($ws.Cells.Item(9, $caseStartCol), $ws.Cells.Item(48, $lastCol))
        $caseArea.HorizontalAlignment = $xlCenter
        $caseArea.VerticalAlignment = $xlCenter
        Set-Borders $caseArea

        $descriptionRow = $ws.Range($ws.Cells.Item(14, $caseStartCol), $ws.Cells.Item(14, $lastCol))
        $descriptionRow.Orientation = 90
        $descriptionRow.Font.Size = 8
        $descriptionRow.WrapText = $true

        $expectedRow = $ws.Range($ws.Cells.Item(35, $caseStartCol), $ws.Cells.Item(35, $lastCol))
        $expectedRow.Value2 = 'Assertions pass'
        $expectedRow.Font.Size = 8
        $expectedRow.Orientation = 90
        $expectedRow.WrapText = $true

        $typeRow = $ws.Range($ws.Cells.Item(45, $caseStartCol), $ws.Cells.Item(45, $lastCol))
        $typeRow.Interior.Color = 13434879
        $typeRow.Font.Bold = $true

        $resultRow = $ws.Range($ws.Cells.Item(46, $caseStartCol), $ws.Cells.Item(46, $lastCol))
        $resultRow.Interior.Color = 13561798
        $resultRow.Font.Color = 32768
        $resultRow.Font.Bold = $true

        $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item(48, $lastCol)).Font.Name = 'Tahoma'
        $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item(48, $lastCol)).Font.Size = 9
        $ws.Range($ws.Cells.Item(14, $caseStartCol), $ws.Cells.Item(14, $lastCol)).Font.Size = 8
        $ws.Range($ws.Cells.Item(35, $caseStartCol), $ws.Cells.Item(35, $lastCol)).Font.Size = 8

        $ws.Activate() | Out-Null
        $ws.Range('F9').Select() | Out-Null
        $excel.ActiveWindow.FreezePanes = $true
      }
    }

    $workbook.Worksheets.Item('Cover').Activate() | Out-Null
    $workbook.Save()
    $workbook.Close($true)
    [Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null
    $workbook = $null
  }
  finally {
    if ($null -ne $workbook) {
      try { $workbook.Close($false) } catch {}
    }
  }
}
finally {
  $excel.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Output $outputPath
