$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir '..')

Write-Host '=== Rust source ==='
$rs = Get-ChildItem (Join-Path $root 'src-tauri/src') -Recurse -File -Filter '*.rs'
$rsTotal = 0
foreach ($f in $rs) {
    $rsTotal += (Get-Content $f.FullName -Encoding UTF8 | Measure-Object -Line).Lines
}
Write-Host ("  files={0}  lines={1}" -f $rs.Count, $rsTotal)

Write-Host ''
Write-Host '=== TypeScript / TSX (Tauri side, excluding node_modules / dist) ==='
$ts = Get-ChildItem (Join-Path $root 'src') -Recurse -File -Include *.ts,*.tsx
$tsTotal = 0
foreach ($f in $ts) {
    $tsTotal += (Get-Content $f.FullName -Encoding UTF8 | Measure-Object -Line).Lines
}
Write-Host ("  files={0}  lines={1}" -f $ts.Count, $tsTotal)

Write-Host ''
Write-Host '=== CSS ==='
$css = Get-ChildItem (Join-Path $root 'src') -Recurse -File -Filter '*.css'
$cssTotal = 0
foreach ($f in $css) {
    $cssTotal += (Get-Content $f.FullName -Encoding UTF8 | Measure-Object -Line).Lines
}
Write-Host ("  files={0}  lines={1}" -f $css.Count, $cssTotal)

Write-Host ''
Write-Host '=== Top 15 largest Rust files ==='
$rs | ForEach-Object {
    $lines = (Get-Content $_.FullName -Encoding UTF8 | Measure-Object -Line).Lines
    [PSCustomObject]@{ Lines = $lines; Path = $_.FullName.Substring($root.Path.Length + 1) }
} | Sort-Object Lines -Descending | Select-Object -First 15 | Format-Table -AutoSize

Write-Host '=== Top 15 largest TS / TSX files ==='
$ts | ForEach-Object {
    $lines = (Get-Content $_.FullName -Encoding UTF8 | Measure-Object -Line).Lines
    [PSCustomObject]@{ Lines = $lines; Path = $_.FullName.Substring($root.Path.Length + 1) }
} | Sort-Object Lines -Descending | Select-Object -First 15 | Format-Table -AutoSize
