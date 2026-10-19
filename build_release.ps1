param (
    [switch]$CleanOnly
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  写梨眼 Tauri 2 自动构建与清理脚本 (v2.0.1)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. 清除旧版构建残留..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item "dist" -Recurse -Force
    Write-Host "  [OK] 已删除 dist 前端构建产物" -ForegroundColor Green
}

if (Test-Path "src-tauri\target\release") {
    Remove-Item "src-tauri\target\release" -Recurse -Force
    Write-Host "  [OK] 已删除 src-tauri\target\release 后端构建产物" -ForegroundColor Green
}

if ($CleanOnly) {
    Write-Host "清理完毕。退出构建。" -ForegroundColor Green
    exit 0
}

Write-Host "`n2. 开始执行前端类型检查与资源打包..." -ForegroundColor Yellow
npm run build:frontend
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] 前端构建失败，终止打包进程！" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "  [OK] 前端打包完成" -ForegroundColor Green

Write-Host "`n3. 开始执行 Tauri 后端打包编译 (可能需要几分钟)..." -ForegroundColor Yellow
# npm run build 执行 tauri build
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Tauri 后端构建失败，终止打包进程！" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "  恭喜！全新修复版本 (v2.0.1) 打包成功！" -ForegroundColor Green
Write-Host "  安装包位置: src-tauri/target/release/bundle/" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
