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
$xlThin = 2
$xlContinuous = 1
$colorNavy = 6299648
$colorBlue = 15189684
$colorLightBlue = 16448250
$colorGreen = 13561798
$colorGreenText = 32768
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

function Last-Case-Col($sheet) {
  $lastCol = $sheet.UsedRange.Column + $sheet.UsedRange.Columns.Count - 1
  for ($c = $lastCol; $c -ge 6; $c--) {
    if ([string]$sheet.Cells.Item(9, $c).Text -match '^UTCID\d+') {
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

  try {
    $existing = $workbook.Worksheets.Item('Readable Cases')
    $existing.Delete()
  } catch {}

  $after = $workbook.Worksheets.Item('Statistics')
  $sheet = $workbook.Worksheets.Add([System.Type]::Missing, $after)
  $sheet.Name = 'Readable Cases'
  $sheet.Tab.Color = $colorNavy

  $sheet.Range('A1:I1').Merge() | Out-Null
  $sheet.Range('A1').Value2 = 'READABLE UNIT TEST CASE LIST'
  $sheet.Range('A1:I1').Interior.Color = $colorNavy
  $sheet.Range('A1:I1').Font.Color = $colorWhite
  $sheet.Range('A1:I1').Font.Bold = $true
  $sheet.Range('A1:I1').Font.Size = 16
  $sheet.Range('A1:I1').HorizontalAlignment = $xlCenter
  $sheet.Rows.Item(1).RowHeight = 32

  $headers = @('No.', 'Module', 'Function Code', 'Unit / Class', 'UTCID', 'Test Case Description', 'Type', 'Result', 'Source Sheet')
  for ($i = 0; $i -lt $headers.Count; $i++) {
    $sheet.Cells.Item(3, $i + 1).Value2 = $headers[$i]
  }

  $row = 4
  $no = 1
  foreach ($ws in $workbook.Worksheets) {
    if ($ws.Name -notlike 'FN-*') {
      continue
    }
    $lastCaseCol = Last-Case-Col $ws
    if ($lastCaseCol -lt 6) {
      continue
    }

    $functionCode = [string]$ws.Cells.Item(2, 3).Text
    $unit = [string]$ws.Cells.Item(2, 12).Text
    $module = ''
    $spec = [string]$ws.Cells.Item(5, 3).Text
    if ($spec -match 'src/modules/([^/]+)/') {
      $module = $matches[1]
    } elseif ($spec -match 'src/common/') {
      $module = 'common'
    } else {
      $module = 'backend'
    }

    for ($c = 6; $c -le $lastCaseCol; $c++) {
      $utcid = [string]$ws.Cells.Item(9, $c).Text
      if (-not $utcid) {
        continue
      }
      $sheet.Cells.Item($row, 1).Value2 = [string]$no
      $sheet.Cells.Item($row, 2).Value2 = $module
      $sheet.Cells.Item($row, 3).Value2 = $functionCode
      $sheet.Cells.Item($row, 4).Value2 = $unit
      $sheet.Cells.Item($row, 5).Value2 = $utcid
      $sheet.Cells.Item($row, 6).Value2 = [string]$ws.Cells.Item(14, $c).Text
      $sheet.Cells.Item($row, 7).Value2 = [string]$ws.Cells.Item(45, $c).Text
      $sheet.Cells.Item($row, 8).Value2 = [string]$ws.Cells.Item(46, $c).Text
      $sheet.Cells.Item($row, 9).Value2 = $ws.Name
      if (($row % 2) -eq 0) {
        $sheet.Range("A${row}:I${row}").Interior.Color = $colorLightBlue
      }
      $row++
      $no++
    }
  }

  $lastRow = $row - 1
  $used = $sheet.Range("A1:I$lastRow")
  $used.Font.Name = 'Tahoma'
  $used.Font.Size = 9
  $used.WrapText = $true
  $used.VerticalAlignment = $xlTop
  Set-Borders $used

  $header = $sheet.Range('A3:I3')
  $header.Interior.Color = $colorNavy
  $header.Font.Color = $colorWhite
  $header.Font.Bold = $true
  $header.HorizontalAlignment = $xlCenter
  $header.VerticalAlignment = $xlCenter
  $sheet.Rows.Item(3).RowHeight = 28

  $sheet.Columns.Item(1).ColumnWidth = 7
  $sheet.Columns.Item(2).ColumnWidth = 18
  $sheet.Columns.Item(3).ColumnWidth = 14
  $sheet.Columns.Item(4).ColumnWidth = 28
  $sheet.Columns.Item(5).ColumnWidth = 10
  $sheet.Columns.Item(6).ColumnWidth = 68
  $sheet.Columns.Item(7).ColumnWidth = 8
  $sheet.Columns.Item(8).ColumnWidth = 9
  $sheet.Columns.Item(9).ColumnWidth = 32
  if ($lastRow -ge 4) {
    $sheet.Range("A4:E$lastRow").HorizontalAlignment = $xlCenter
    $sheet.Range("G4:I$lastRow").HorizontalAlignment = $xlCenter
    $sheet.Range("H4:H$lastRow").Interior.Color = $colorGreen
    $sheet.Range("H4:H$lastRow").Font.Color = $colorGreenText
    $sheet.Range("H4:H$lastRow").Font.Bold = $true
    $sheet.Range("F4:F$lastRow").HorizontalAlignment = $xlLeft
    $sheet.Rows.Item("4:$lastRow").RowHeight = 30
    $sheet.Range("A3:I$lastRow").AutoFilter() | Out-Null
  }

  $sheet.Activate() | Out-Null
  $sheet.Range('A4').Select() | Out-Null
  $excel.ActiveWindow.FreezePanes = $true
  $excel.ActiveWindow.Zoom = 90

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
