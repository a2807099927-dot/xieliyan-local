@echo off
chcp 65001 > nul
echo =========================================
echo   写梨眼 Tauri 2 自动构建与清理脚本 (v2.0.1)
echo =========================================
echo.

echo 1. 清除旧版构建残留...
if exist "dist\" (
    rd /s /q "dist"
    echo   [OK] 已删除 dist 前端构建产物
)
if exist "src-tauri\target\release\" (
    rd /s /q "src-tauri\target\release"
    echo   [OK] 已删除 src-tauri\target\release 后端构建产物
)

if "%1"=="--clean-only" (
    echo 清理完毕。退出构建。
    exit /b 0
)

echo.
echo 2. 开始执行前端类型检查与资源打包...
call npm run build:frontend
if %ERRORLEVEL% neq 0 (
    echo   [ERROR] 前端构建失败，终止打包进程！
    exit /b %ERRORLEVEL%
)
echo   [OK] 前端打包完成

echo.
echo 3. 开始执行 Tauri 后端打包编译 (可能需要几分钟)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo   [ERROR] Tauri 后端构建失败，终止打包进程！
    exit /b %ERRORLEVEL%
)

echo.
echo =========================================
echo   恭喜！全新修复版本 (v2.0.1) 打包成功！
echo   安装包位置: src-tauri\target\release\bundle\
echo =========================================
