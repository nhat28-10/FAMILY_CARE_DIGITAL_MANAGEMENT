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
$colorGray = 15921906
$colorWhite = 16777215
$colorBorder = 12632256

function Set-Borders($range) {
  foreach ($idx in @(7, 8, 9, 10, 11, 12)) {
    $border = $range.Borders.Item($idx)
    $border.LineStyle = $xlContinuous
    $border.Weight = $xlThin
    $border.Color = $colorBorder
  }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

try {
  $workbook = $excel.Workbooks.Open($WorkbookPath)
  $ws = $workbook.Worksheets.Item('Statistics')

  $subtotalCell = $ws.Range('B:B').Find('Sub total')
  $subtotalRow = if ($subtotalCell -ne $null) { $subtotalCell.Row } else { 60 }
  $lastRow = [Math]::Max($subtotalRow + 5, $ws.UsedRange.Row + $ws.UsedRange.Rows.Count - 1)

  $ws.Tab.Color = $colorGreenText
  $ws.PageSetup.Orientation = $xlLandscape
  $ws.PageSetup.Zoom = $false
  $ws.PageSetup.FitToPagesWide = 1
  $ws.PageSetup.FitToPagesTall = $false
  $ws.PageSetup.CenterHorizontally = $true

  $ws.Range("A1:I$lastRow").Font.Name = 'Tahoma'
  $ws.Range("A1:I$lastRow").Font.Size = 10
  $ws.Range("A1:I$lastRow").WrapText = $true
  $ws.Range("A1:I$lastRow").VerticalAlignment = $xlCenter
  Set-Borders $ws.Range("A11:I$lastRow")

  $ws.Columns.Item(1).ColumnWidth = 7
  $ws.Columns.Item(2).ColumnWidth = 18
  $ws.Columns.Item(3).ColumnWidth = 13
  $ws.Columns.Item(4).ColumnWidth = 13
  $ws.Columns.Item(5).ColumnWidth = 14
  $ws.Columns.Item(6).ColumnWidth = 12
  $ws.Columns.Item(7).ColumnWidth = 12
  $ws.Columns.Item(8).ColumnWidth = 12
  $ws.Columns.Item(9).ColumnWidth = 16

  $title = $ws.Range('A2:I2')
  $title.Merge() | Out-Null
  $title.Value2 = 'UNIT TEST REPORT'
  $title.Interior.Color = $colorNavy
  $title.Font.Color = $colorWhite
  $title.Font.Bold = $true
  $title.Font.Size = 18
  $title.HorizontalAlignment = $xlCenter
  $title.VerticalAlignment = $xlCenter
  $ws.Rows.Item(2).RowHeight = 36

  $ws.Range('A4:I7').Interior.Color = $colorLightBlue
  $ws.Range('A4:I7').Font.Size = 10
  $ws.Rows.Item('4:7').RowHeight = 28

  $header = $ws.Range('A11:I11')
  $header.Interior.Color = $colorNavy
  $header.Font.Color = $colorWhite
  $header.Font.Bold = $true
  $header.HorizontalAlignment = $xlCenter
  $header.VerticalAlignment = $xlCenter
  $ws.Rows.Item(11).RowHeight = 42

  if ($subtotalRow -gt 12) {
    for ($r = 12; $r -lt $subtotalRow; $r++) {
      $ws.Rows.Item($r).RowHeight = 30
      $ws.Range("A${r}:I${r}").HorizontalAlignment = $xlCenter
      if (($r % 2) -eq 0) {
        $ws.Range("A${r}:I${r}").Interior.Color = $colorLightBlue
      } else {
        $ws.Range("A${r}:I${r}").Interior.Color = $colorWhite
      }
    }
  }

  $subtotal = $ws.Range("A${subtotalRow}:I${subtotalRow}")
  $subtotal.Interior.Color = $colorGray
  $subtotal.Font.Bold = $true
  $subtotal.HorizontalAlignment = $xlCenter
  $ws.Rows.Item($subtotalRow).RowHeight = 32

  $summaryStart = $subtotalRow + 2
  $summaryEnd = $subtotalRow + 5
  $ws.Range("B${summaryStart}:E${summaryEnd}").Interior.Color = $colorGreen
  $ws.Range("B${summaryStart}:E${summaryEnd}").Font.Bold = $true
  $ws.Range("B${summaryStart}:E${summaryEnd}").HorizontalAlignment = $xlCenter
  $ws.Rows.Item("${summaryStart}:${summaryEnd}").RowHeight = 30
  Set-Borders $ws.Range("B${summaryStart}:E${summaryEnd}")

  $ws.Range("A11:I$lastRow").AutoFilter() | Out-Null
  $ws.Activate() | Out-Null
  $excel.ActiveWindow.FreezePanes = $false
  $ws.Range('A12').Select() | Out-Null
  $excel.ActiveWindow.FreezePanes = $true
  $excel.ActiveWindow.Zoom = 90

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
