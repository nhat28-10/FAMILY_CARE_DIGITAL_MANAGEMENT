param(
  [Parameter(Mandatory = $true)]
  [string]$TemplatePath
)

$ErrorActionPreference = 'Stop'

$outputDir = Join-Path (Get-Location) 'outputs\report5'
$buildDir = Join-Path $outputDir 'docx_build'
$outputPath = Join-Path $outputDir 'Report5_Test Documentation_Family Care.docx'

if (-not (Test-Path -LiteralPath $TemplatePath)) {
  throw "Template not found: $TemplatePath"
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
if (Test-Path -LiteralPath $buildDir) {
  Remove-Item -LiteralPath $buildDir -Recurse -Force
}
if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}

New-Item -ItemType Directory -Force -Path (Join-Path $buildDir '_rels') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $buildDir 'word\_rels') | Out-Null

function Escape-Xml([string]$text) {
  return [System.Security.SecurityElement]::Escape($text)
}

function Paragraph([string]$text, [string]$style = '', [string]$align = '', [bool]$bullet = $false, [bool]$pageBreakBefore = $false) {
  $props = ''
  if ($style) {
    $props += "<w:pStyle w:val=`"$style`"/>"
  }
  if ($align) {
    $props += "<w:jc w:val=`"$align`"/>"
  }
  if ($bullet) {
    $props += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
  }
  if ($pageBreakBefore) {
    $props += '<w:pageBreakBefore/>'
  }
  $pPr = if ($props) { "<w:pPr>$props</w:pPr>" } else { '' }
  $run = if ($text) { "<w:r><w:t xml:space=`"preserve`">$(Escape-Xml $text)</w:t></w:r>" } else { '<w:r/>' }
  return "<w:p>$pPr$run</w:p>"
}

function CoverParagraph([string]$text, [int]$sizeHalfPoints, [bool]$bold = $false) {
  $b = if ($bold) { '<w:b/>' } else { '' }
  return "<w:p><w:pPr><w:jc w:val=`"center`"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii=`"Times New Roman`" w:hAnsi=`"Times New Roman`"/>$b<w:sz w:val=`"$sizeHalfPoints`"/></w:rPr><w:t xml:space=`"preserve`">$(Escape-Xml $text)</w:t></w:r></w:p>"
}

function BlankParagraph() {
  return '<w:p><w:r/></w:p>'
}

function Table([object[]]$rows) {
  $colCount = $rows[0].Count
  $gridCols = ''
  for ($i = 0; $i -lt $colCount; $i++) {
    $gridCols += '<w:gridCol w:w="1800"/>'
  }

  $xml = @()
  $xml += '<w:tbl>'
  $xml += '<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:left w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:right w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
  $xml += "<w:tblGrid>$gridCols</w:tblGrid>"
  for ($r = 0; $r -lt $rows.Count; $r++) {
    $xml += '<w:tr>'
    foreach ($cell in $rows[$r]) {
      $shade = if ($r -eq 0) { '<w:shd w:fill="D9EAF7"/>' } else { '' }
      $bold = if ($r -eq 0) { '<w:b/>' } else { '' }
      $xml += '<w:tc>'
      $xml += "<w:tcPr><w:tcW w:w=`"1800`" w:type=`"dxa`"/>$shade<w:vAlign w:val=`"center`"/></w:tcPr>"
      $xml += "<w:p><w:r><w:rPr><w:rFonts w:ascii=`"Times New Roman`" w:hAnsi=`"Times New Roman`"/>$bold<w:sz w:val=`"20`"/></w:rPr><w:t xml:space=`"preserve`">$(Escape-Xml ([string]$cell))</w:t></w:r></w:p>"
      $xml += '</w:tc>'
    }
    $xml += '</w:tr>'
  }
  $xml += '</w:tbl>'
  return ($xml -join '')
}

$body = New-Object System.Collections.Generic.List[string]

$body.Add((CoverParagraph 'Capstone Project Report' 36 $true))
1..5 | ForEach-Object { $body.Add((BlankParagraph)) }
$body.Add((CoverParagraph 'Report 5 - Software Test Documentation' 40 $true))
$body.Add((CoverParagraph 'Project: Family Care Digital Management' 28 $false))
1..7 | ForEach-Object { $body.Add((BlankParagraph)) }
$body.Add((CoverParagraph '- Hanoi, July 2026 -' 24 $false))
$body.Add('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

$body.Add((Paragraph 'I. Record of Changes' 'Heading1'))
$body.Add((Paragraph '*A - Added M - Modified D - Deleted'))
$body.Add((Table @(
  @('Date', 'A*M, D', 'In charge', 'Change Description'),
  @('27/07/2026', 'A', 'QA/Test Team', 'Create Software Test Documentation for the Family Care Digital Management backend based on the current NestJS source code, Prisma schema, API controllers, and existing automated test suite.')
)))

$body.Add((Paragraph 'II. Testing Documentation' 'Heading1'))
$body.Add((Paragraph '1. Scope of Testing' 'Heading2'))
$body.Add((Paragraph 'The scope of this test documentation is the backend of Family Care Digital Management. The backend is implemented with NestJS and TypeScript, exposes REST APIs under api/v1, uses Prisma with PostgreSQL, Redis/BullMQ for asynchronous work, Socket.IO for real-time features, and integrates with Firebase, Stripe, Cloudflare R2/Workers AI, OpenAI, mail providers, and a face-ai service.'))
$body.Add((Paragraph 'In-scope functional areas include:'))
@(
  'Authentication and account management: register, login, Firebase login, refresh/logout, email verification, password reset, profile update, JWT guards, role guards, and verified-account protection.',
  'Family workspace management: create family, list my families, view/update family, invite code generation, join request workflow, role updates, member removal, and ownership transfer.',
  'Finance management: monthly finance, shared ledger, finance categories, finance models and jars, budget plans and budget lines, budget alerts, financial goals, contribution plans, support requests, and finance reports.',
  'Task and reward management: task categories, ad-hoc and recurring tasks, assignments, schedules, submissions, proofs, reward settings, settlements, reward allocation, reward disputes, and unavailability handling.',
  'Safety and location: SOS settings, emergency contacts, SOS alerts, live/batch location updates, SOS responses, wearable device pairing, sensor events, and daily location sharing.',
  'Communication and productivity: notifications, device tokens, chat conversations, messages, file uploads, reactions, pinned messages, family calendar events, participant responses, and reminders.',
  'Album and media management: media upload/list/update/delete/restore/permanent delete, tags, moderation status, moderation retries, face profiles, face scan jobs, and face tag suggestions.',
  'Subscription, billing, and administration: subscription plans, family subscription checkout, Stripe webhook handling, admin users/families/members/payments/revenue/dashboard/system/infrastructure/audit-log/provisioning/backup-restore APIs.',
  'AI chatbot: family-scoped AI conversations, message history, tool-backed actions, action confirmation/rejection, and unavailable-provider behavior when OpenAI credentials are absent.'
) | ForEach-Object { $body.Add((Paragraph $_ '' '' $true)) }
$body.Add((Paragraph 'In-scope non-functional concerns include API validation, standardized response envelopes, exception handling, authorization boundaries between families and roles, pagination/query filters, idempotent lifecycle transitions, database constraints, webhook signature handling, background job retry behavior, file-storage cleanup behavior, and basic API performance smoke checks.'))
$body.Add((Paragraph 'Out-of-scope items for this backend test document are native mobile UI rendering, browser visual testing, production penetration testing, real payment settlement, real email deliverability, real Firebase push delivery, and full load testing beyond smoke/threshold checks. External providers are tested through test mode, local substitutes, or mocked clients unless valid non-production credentials are available.'))

$body.Add((Paragraph '2. Test Strategy' 'Heading2'))
$body.Add((Paragraph 'The strategy combines automated unit testing, service-level integration testing, API/system testing, security and authorization checks, regression testing, and acceptance testing. The repository currently contains 47 spec/e2e files across common utilities, auth, admin, families, finance, SOS, notifications, albums, AI chatbot, devices, locations, tasks, and related services. API coverage is planned around 52 controllers and approximately 284 REST endpoints.'))
$body.Add((Paragraph '2.1 Testing Types' 'Heading3'))
$body.Add((Paragraph 'The selected testing types and their target levels are summarized below.'))
$body.Add((Table @(
  @('Type of Tests', 'Unit', 'Integration', 'System', 'Acceptance'),
  @('Unit testing', 'X', '', '', ''),
  @('Service integration testing', '', 'X', '', ''),
  @('REST API/system testing', '', 'X', 'X', ''),
  @('Authorization and security testing', 'X', 'X', 'X', 'X'),
  @('Validation and error-handling testing', 'X', 'X', 'X', ''),
  @('Regression testing', 'X', 'X', 'X', ''),
  @('User acceptance testing', '', '', 'X', 'X')
)))
$body.Add((Paragraph 'Unit testing validates isolated services, guards, DTO validators, policies, dispatchers, and utilities. Completion criteria: expected success and failure branches are covered, mocks verify important interactions, and no unit test fails in npm run test.'))
$body.Add((Paragraph 'Integration testing validates service behavior with Prisma patterns, transactional workflows, queue dispatchers, storage/payment/provider adapters, and controller-service contracts. Completion criteria: cross-module business rules are verified and external-provider failure cases are handled consistently.'))
$body.Add((Paragraph 'System/API testing validates authenticated API flows through the NestJS application boundary: request validation, guards, response format, lifecycle transitions, pagination, and error responses. Completion criteria: critical user journeys are executable on a local test environment and no blocking API defects remain.'))
$body.Add((Paragraph 'Acceptance testing validates that key backend flows satisfy the expected Family Care use cases: family onboarding, finance planning, task assignment/reward settlement, SOS alert handling, notifications, album management, subscription control, and admin monitoring.'))

$body.Add((Paragraph '2.2 Test Levels' 'Heading3'))
$body.Add((Paragraph 'Unit level tests are executed by developers for individual services and utilities using Jest with mocked dependencies. Inputs include DTO samples, mock Prisma clients, mock provider clients, and representative domain states.'))
$body.Add((Paragraph 'Integration level tests are executed by the backend team for service and controller contracts where behavior depends on multiple modules, database constraints, authorization context, or asynchronous dispatching.'))
$body.Add((Paragraph 'System level tests are executed by QA/backend testers against the running API using Swagger, HTTP collections, and seeded PostgreSQL data. The focus is complete workflow validation from authentication to domain action and response verification.'))
$body.Add((Paragraph 'Acceptance level tests are executed by the project team using business scenarios from the Family Care Digital Management requirements. Acceptance criteria focus on role correctness, data isolation between families, predictable lifecycle status changes, and clear user-facing error behavior.'))

$body.Add((Paragraph '2.3 Supporting Tools' 'Heading3'))
$body.Add((Table @(
  @('Purpose', 'Tool', 'Vendor/In-house', 'Version'),
  @('Backend framework and API runtime', 'NestJS, TypeScript, Node.js', 'Open source', 'NestJS 11, Node.js 22.12.0'),
  @('Unit and service testing', 'Jest, ts-jest', 'Open source', 'Jest 30'),
  @('HTTP/e2e API testing', 'Supertest, Swagger UI, HTTP client collections', 'Open source / In-house', 'Supertest 7, Swagger via @nestjs/swagger 11'),
  @('Database access and schema validation', 'Prisma ORM, PostgreSQL', 'Open source', 'Prisma 6.19.3, PostgreSQL 16'),
  @('Queue and background jobs', 'BullMQ, Redis', 'Open source', 'BullMQ 5, Redis 7'),
  @('Authentication and external services', 'JWT, Firebase Admin, Stripe test mode, S3-compatible R2, OpenAI, Cloudflare Workers AI', 'Vendor / In-house adapters', 'Configured by environment'),
  @('Static analysis and formatting', 'ESLint, Prettier, TypeScript compiler', 'Open source', 'ESLint 9, Prettier 3, TypeScript 5.7')
)))

$body.Add((Paragraph '3. Test Plan' 'Heading2'))
$body.Add((Paragraph '3.1 Human Resources' 'Heading3'))
$body.Add((Table @(
  @('Worker/Doer', 'Role', 'Specific Responsibilities/Comments'),
  @('Backend Developer', 'Unit and integration test owner', 'Write and maintain Jest tests for services, guards, validators, providers, and utility logic. Fix defects found during test execution.'),
  @('QA/Test Engineer', 'System and regression tester', 'Prepare API scenarios, execute endpoint workflows, verify validation/error responses, record defects, and confirm regression fixes.'),
  @('Team Leader/Reviewer', 'Approver and test coordinator', 'Review test scope, prioritize critical flows, approve test evidence, and ensure Report 5 artifacts are consistent.'),
  @('Database/DevOps Support', 'Environment support', 'Prepare PostgreSQL/Redis/Docker environment, run migrations/seeding, and support deployment or infrastructure-related test issues.')
)))

$body.Add((Paragraph '3.2 Test Environment' 'Heading3'))
$body.Add((Table @(
  @('Purpose', 'Tool', 'Provider', 'Version'),
  @('Backend runtime', 'Node.js and npm', 'Open source', 'Node.js 22.12.0'),
  @('Application framework', 'NestJS API server', 'Open source', 'NestJS 11'),
  @('Database', 'PostgreSQL in Docker', 'Open source', 'PostgreSQL 16-alpine'),
  @('ORM and migration/client generation', 'Prisma', 'Open source', '6.19.3'),
  @('Cache/queue', 'Redis and BullMQ', 'Open source', 'Redis 7-alpine, BullMQ 5'),
  @('API documentation and manual execution', 'Swagger UI / HTTP client', 'Open source / In-house', 'api/v1 prefix'),
  @('Object/file storage', 'Cloudflare R2 or S3-compatible storage', 'Vendor', 'Configured by env'),
  @('Payment testing', 'Stripe test mode and webhook endpoint', 'Vendor', 'Configured by env'),
  @('AI and media moderation', 'OpenAI, Cloudflare Workers AI, face-ai-service, FFmpeg/FFprobe', 'Vendor / In-house service', 'Configured by env')
)))

$body.Add((Paragraph '3.3 Test Milestones' 'Heading3'))
$body.Add((Table @(
  @('Milestone Task', 'Start Date', 'End Date'),
  @('Review backend source code, controllers, Prisma schema, and existing automated tests', '22/07/2026', '24/07/2026'),
  @('Prepare Software Test Documentation and define test scope/strategy/environment', '25/07/2026', '27/07/2026'),
  @('Prepare Unit Test workbook for key services, guards, validators, and utilities', '28/07/2026', '31/07/2026'),
  @('Prepare API/system test cases and execute critical backend workflows', '01/08/2026', '06/08/2026'),
  @('Fix defects, rerun regression tests, and update evidence', '07/08/2026', '10/08/2026'),
  @('Finalize Test Report, statistics, and test analysis', '11/08/2026', '13/08/2026')
)))

$body.Add((Paragraph '4. Test Cases' 'Heading2'))
$body.Add((Paragraph 'Detailed test cases will be maintained in the provided spreadsheet templates. Unit test cases are documented in Report5_Unit Test.xls and should be grouped by backend function/service. System, integration, and acceptance test cases are documented in Report5_Test Report.xlsx and should be grouped by feature area.'))
$body.Add((Paragraph 'Unit Test Cases: Report5_Unit Test.xls' '' '' $true))
$body.Add((Paragraph 'Other Test Cases (Integration, System, Acceptance): Report5_Test Report.xlsx' '' '' $true))
$body.Add((Paragraph 'Priority should be given to authentication, family membership and role boundaries, finance workflows, task/reward lifecycle, SOS alert flow, notification dispatch, album/media moderation, subscription/billing webhook handling, and admin operations.'))

$body.Add((Paragraph '5. Test Reports' 'Heading2'))
$body.Add((Paragraph 'Test execution results, statistics, defect status, and analysis will be consolidated in Report5_Test Report.xlsx. The final report should summarize planned versus executed test cases, pass/fail/pending counts by feature, unresolved risks, and acceptance status for the Family Care Digital Management backend.'))

$sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1416" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
$documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + ($body -join '') + $sectPr + '</w:body></w:document>'

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>
'@

$rootRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@

$docRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>
'@

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>
'@

$numberingXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>
'@

Set-Content -LiteralPath (Join-Path $buildDir '[Content_Types].xml') -Value $contentTypes -Encoding UTF8
Set-Content -LiteralPath (Join-Path $buildDir '_rels\.rels') -Value $rootRels -Encoding UTF8
Set-Content -LiteralPath (Join-Path $buildDir 'word\document.xml') -Value $documentXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $buildDir 'word\_rels\document.xml.rels') -Value $docRels -Encoding UTF8
Set-Content -LiteralPath (Join-Path $buildDir 'word\styles.xml') -Value $stylesXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $buildDir 'word\numbering.xml') -Value $numberingXml -Encoding UTF8

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $buildDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($buildDir.Length + 1).Replace('\', '/')
    $entry = $zip.CreateEntry($relativePath)
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($_.FullName)
    try {
      $fileStream.CopyTo($entryStream)
    }
    finally {
      $fileStream.Dispose()
      $entryStream.Dispose()
    }
  }
}
finally {
  $zip.Dispose()
  $stream.Dispose()
}

Write-Output $outputPath
