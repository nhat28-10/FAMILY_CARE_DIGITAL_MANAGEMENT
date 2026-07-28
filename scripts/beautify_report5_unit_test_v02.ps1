param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath
)

$ErrorActionPreference = 'Stop'
trap {
  Write-Error ($_.InvocationInfo.PositionMessage + ' ' + $_.Exception.Message)
  exit 1
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "Workbook not found: $WorkbookPath"
}

$xlCenter = -4108
$xlLeft = -4131
$xlTop = -4160
$xlLandscape = 2
$xlThin = 2
$xlContinuous = 1

$colorNavy = 6299648
$colorBlue = 15189684
$colorLightBlue = 16448250
$colorGreen = 13561798
$colorGreenText = 32768
$colorAmber = 10092543
$colorGray = 15921906
$colorBorder = 12632256
$colorWhite = 16777215

function Set-Borders($range, [int]$color = 12632256) {
  foreach ($idx in @(7, 8, 9, 10, 11, 12)) {
    $border = $range.Borders.Item($idx)
    $border.LineStyle = $xlContinuous
    $border.Weight = $xlThin
    $border.Color = $color
  }
}

function Style-BlockHeader($range, [int]$fillColor = 15189684) {
  $range.Interior.Color = $fillColor
  $range.Font.Bold = $true
  $range.HorizontalAlignment = $xlCenter
  $range.VerticalAlignment = $xlCenter
  Set-Borders $range
}

function Merge-And-Set($sheet, [string]$address, [string]$text, [int]$fillColor) {
  $range = $sheet.Range($address)
  $range.Merge() | Out-Null
  $range.Value2 = $text
  $range.Interior.Color = $fillColor
  $range.Font.Bold = $true
  $range.Font.Color = $colorWhite
  $range.Font.Size = 12
  $range.HorizontalAlignment = $xlCenter
  $range.VerticalAlignment = $xlCenter
  Set-Borders $range
}

function Get-LastCaseCol($sheet) {
  $lastCol = $sheet.UsedRange.Column + $sheet.UsedRange.Columns.Count - 1
  for ($c = $lastCol; $c -ge 6; $c--) {
    $val = [string]$sheet.Cells.Item(9, $c).Text
    if ($val -match '^UTCID\d+') {
      return $c
    }
  }
  return 5
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$workbook = $null
try {
  $workbook = $excel.Workbooks.Open($WorkbookPath)

  foreach ($ws in $workbook.Worksheets) {
    $used = $ws.UsedRange
    $lastRow = $used.Row + $used.Rows.Count - 1
    $lastCol = $used.Column + $used.Columns.Count - 1

    $used.Font.Name = 'Tahoma'
    $used.Font.Size = 9
    $used.WrapText = $true
    $used.VerticalAlignment = $xlCenter
    Set-Borders $used

    $ws.PageSetup.Orientation = $xlLandscape
    $ws.PageSetup.Zoom = $false
    $ws.PageSetup.FitToPagesWide = 1
    $ws.PageSetup.FitToPagesTall = $false
    $ws.PageSetup.CenterHorizontally = $true

    if ($ws.Name -eq 'Cover') {
      $ws.Tab.Color = $colorNavy
      $ws.Range('B2:H2').Interior.Color = $colorNavy
      $ws.Range('B2:H2').Font.Color = $colorWhite
      $ws.Range('B2:H2').Font.Bold = $true
      $ws.Range('B2:H2').Font.Size = 18
      $ws.Columns.Item('A:H').ColumnWidth = 18
      $ws.Rows.Item(2).RowHeight = 34
      $ws.Rows.Item('4:7').RowHeight = 26
    }
    elseif ($ws.Name -eq 'Functions') {
      $ws.Tab.Color = $colorAmber
      $ws.Columns.Item(1).ColumnWidth = 6
      $ws.Columns.Item(2).ColumnWidth = 18
      $ws.Columns.Item(3).ColumnWidth = 28
      $ws.Columns.Item(4).ColumnWidth = 28
      $ws.Columns.Item(5).ColumnWidth = 13
      $ws.Columns.Item(6).ColumnWidth = 27
      $ws.Columns.Item(7).ColumnWidth = 42
      $ws.Columns.Item(8).ColumnWidth = 38
      Style-BlockHeader $ws.Range('A10:H10') $colorNavy
      $ws.Range('A10:H10').Font.Color = $colorWhite
      $ws.Rows.Item(10).RowHeight = 34
      if ($lastRow -gt 10) {
        $ws.Range("A11:H$lastRow").VerticalAlignment = $xlTop
        $ws.Range("A11:H$lastRow").Interior.Color = $colorWhite
        for ($r = 11; $r -le $lastRow; $r++) {
          if (($r % 2) -eq 0) {
            $ws.Range("A${r}:H${r}").Interior.Color = $colorLightBlue
          }
          $ws.Rows.Item($r).RowHeight = 38
        }
      }
      $ws.Activate() | Out-Null
      $ws.Range('A11').Select() | Out-Null
      $excel.ActiveWindow.FreezePanes = $true
    }
    elseif ($ws.Name -eq 'Statistics') {
      $ws.Tab.Color = $colorGreenText
      $ws.Columns.Item(1).ColumnWidth = 6
      $ws.Columns.Item(2).ColumnWidth = 14
      for ($c = 3; $c -le 9; $c++) {
        $ws.Columns.Item($c).ColumnWidth = 11
      }
      Style-BlockHeader $ws.Range('A11:I11') $colorNavy
      $ws.Range('A11:I11').Font.Color = $colorWhite
      $ws.Rows.Item(11).RowHeight = 34
      if ($lastRow -gt 11) {
        $ws.Range("A12:I$lastRow").HorizontalAlignment = $xlCenter
        for ($r = 12; $r -le $lastRow; $r++) {
          if (($r % 2) -eq 0) {
            $ws.Range("A${r}:I${r}").Interior.Color = $colorLightBlue
          }
        }
      }
      $ws.Activate() | Out-Null
      $ws.Range('A12').Select() | Out-Null
      $excel.ActiveWindow.FreezePanes = $true
    }
    elseif ($ws.Name -like 'FN-*') {
      $ws.Tab.Color = $colorBlue
      $caseStartCol = 6
      $lastCaseCol = Get-LastCaseCol $ws
      if ($lastCaseCol -lt $caseStartCol) {
        continue
      }

      $ws.Columns.Item(1).ColumnWidth = 10
      $ws.Columns.Item(2).ColumnWidth = 18
      $ws.Columns.Item(3).ColumnWidth = 12
      $ws.Columns.Item(4).ColumnWidth = 26
      $ws.Columns.Item(5).ColumnWidth = 2
      for ($c = $caseStartCol; $c -le $lastCaseCol; $c++) {
        $ws.Columns.Item($c).ColumnWidth = 6.5
      }

      $titleRange = $ws.Range($ws.Cells.Item(2, 1), $ws.Cells.Item(7, [Math]::Min(15, $lastCaseCol)))
      Set-Borders $titleRange
      $ws.Range('A2:O7').Interior.Color = $colorWhite
      $ws.Range('A2:O2').Interior.Color = $colorNavy
      $ws.Range('A2:O2').Font.Color = $colorWhite
      $ws.Range('A2:O2').Font.Bold = $true
      $ws.Range('A6:O7').Interior.Color = $colorLightBlue
      $ws.Range('A6:O7').Font.Bold = $true

      $ws.Rows.Item(2).RowHeight = 26
      $ws.Rows.Item(3).RowHeight = 24
      $ws.Rows.Item(4).RowHeight = 24
      $ws.Rows.Item(5).RowHeight = 46
      $ws.Rows.Item(6).RowHeight = 24
      $ws.Rows.Item(7).RowHeight = 24
      $ws.Rows.Item(9).RowHeight = 34
      $ws.Rows.Item(10).RowHeight = 24
      $ws.Rows.Item(11).RowHeight = 34
      $ws.Rows.Item(14).RowHeight = 165
      $ws.Rows.Item(31).RowHeight = 28
      $ws.Rows.Item(35).RowHeight = 52
      $ws.Rows.Item(43).RowHeight = 34
      $ws.Rows.Item(45).RowHeight = 34
      $ws.Rows.Item(46).RowHeight = 28
      $ws.Rows.Item(47).RowHeight = 28
      $ws.Rows.Item(48).RowHeight = 28

      Style-BlockHeader $ws.Range($ws.Cells.Item(9, $caseStartCol), $ws.Cells.Item(9, $lastCaseCol)) $colorNavy
      $ws.Range($ws.Cells.Item(9, $caseStartCol), $ws.Cells.Item(9, $lastCaseCol)).Font.Color = $colorWhite
      Style-BlockHeader $ws.Range($ws.Cells.Item(45, 2), $ws.Cells.Item(48, 2)) $colorGray
      $ws.Range($ws.Cells.Item(9, $caseStartCol), $ws.Cells.Item(48, $lastCaseCol)).HorizontalAlignment = $xlCenter
      $ws.Range($ws.Cells.Item(9, $caseStartCol), $ws.Cells.Item(48, $lastCaseCol)).VerticalAlignment = $xlCenter

      $ws.Range($ws.Cells.Item(14, $caseStartCol), $ws.Cells.Item(14, $lastCaseCol)).Orientation = 90
      $ws.Range($ws.Cells.Item(14, $caseStartCol), $ws.Cells.Item(14, $lastCaseCol)).Font.Size = 8
      $ws.Range($ws.Cells.Item(35, $caseStartCol), $ws.Cells.Item(35, $lastCaseCol)).Orientation = 90
      $ws.Range($ws.Cells.Item(35, $caseStartCol), $ws.Cells.Item(35, $lastCaseCol)).Font.Size = 8
      $ws.Range($ws.Cells.Item(45, $caseStartCol), $ws.Cells.Item(45, $lastCaseCol)).Interior.Color = 13434879
      $ws.Range($ws.Cells.Item(46, $caseStartCol), $ws.Cells.Item(46, $lastCaseCol)).Interior.Color = $colorGreen
      $ws.Range($ws.Cells.Item(46, $caseStartCol), $ws.Cells.Item(46, $lastCaseCol)).Font.Color = $colorGreenText
      $ws.Range($ws.Cells.Item(46, $caseStartCol), $ws.Cells.Item(46, $lastCaseCol)).Font.Bold = $true

      $caseListStart = 52
      $caseListEnd = [Math]::Max($ws.UsedRange.Row + $ws.UsedRange.Rows.Count - 1, $caseListStart + 1)
      $ws.Range("A${caseListStart}:H${caseListEnd}").Clear() | Out-Null
      Merge-And-Set $ws "A${caseListStart}:H${caseListStart}" 'Readable Test Case List' $colorNavy
      $headerRow = $caseListStart + 1
      $headers = @('UTCID', 'Description', 'Type', 'Result', 'Executed Date', 'Expected Result', 'Defect ID', 'Source')
      for ($i = 0; $i -lt $headers.Count; $i++) {
        $ws.Cells.Item($headerRow, $i + 1).Value2 = $headers[$i]
      }
      Style-BlockHeader $ws.Range("A${headerRow}:H${headerRow}") $colorBlue

      $source = [string]$ws.Cells.Item(5, 3).Text
      for ($c = $caseStartCol; $c -le $lastCaseCol; $c++) {
        $row = $headerRow + ($c - $caseStartCol) + 1
        $ws.Cells.Item($row, 1).Value2 = [string]$ws.Cells.Item(9, $c).Text
        $ws.Cells.Item($row, 2).Value2 = [string]$ws.Cells.Item(14, $c).Text
        $ws.Cells.Item($row, 3).Value2 = [string]$ws.Cells.Item(45, $c).Text
        $ws.Cells.Item($row, 4).Value2 = [string]$ws.Cells.Item(46, $c).Text
        $ws.Cells.Item($row, 5).Value2 = [string]$ws.Cells.Item(47, $c).Text
        $ws.Cells.Item($row, 6).Value2 = 'All assertions pass and the unit returns/throws the expected result.'
        $ws.Cells.Item($row, 7).Value2 = [string]$ws.Cells.Item(48, $c).Text
        $ws.Cells.Item($row, 8).Value2 = $source
        if (($row % 2) -eq 0) {
          $ws.Range("A${row}:H${row}").Interior.Color = $colorLightBlue
        }
        $ws.Rows.Item($row).RowHeight = 36
      }

      $listLastRow = $headerRow + ($lastCaseCol - $caseStartCol) + 1
      $listRange = $ws.Range("A${caseListStart}:H${listLastRow}")
      $listRange.Font.Name = 'Tahoma'
      $listRange.Font.Size = 9
      $listRange.WrapText = $true
      $listRange.VerticalAlignment = $xlTop
      Set-Borders $listRange
      $ws.Columns.Item(1).ColumnWidth = 10
      $ws.Columns.Item(2).ColumnWidth = 48
      $ws.Columns.Item(3).ColumnWidth = 8
      $ws.Columns.Item(4).ColumnWidth = 8
      $ws.Columns.Item(5).ColumnWidth = 12
      $ws.Columns.Item(6).ColumnWidth = 42
      $ws.Columns.Item(7).ColumnWidth = 10
      $ws.Columns.Item(8).ColumnWidth = 45

      $ws.Activate() | Out-Null
      $excel.ActiveWindow.FreezePanes = $false
      $ws.Range('F9').Select() | Out-Null
      $excel.ActiveWindow.FreezePanes = $true
      $excel.ActiveWindow.Zoom = 85
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
  $excel.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Output $WorkbookPath
