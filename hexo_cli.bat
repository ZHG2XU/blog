@echo off
chcp 65001 >nul
title Hexo Command Line

:: 参数判断
if "%1"=="d" goto :d
if "%1"=="deploy" goto :d

if "%1"=="g" goto :g
if "%1"=="generate" goto :g

if "%1"=="s" goto :s
if "%1"=="server" goto :s

if "%1"=="c" goto :c
if "%1"=="clean" goto :c

if "%1"=="h" goto :h
if "%1"=="help" goto :h

echo Invalid command. Use "hexo h" for help.
goto :end

:h
echo Usage: hexo [command]
echo.
echo Commands:
echo   d / deploy      Deploy the site
echo   g / generate    Generate static files
echo   s / server      Start the server
echo   c / clean       Clean generated files
echo   h / help        Show this help message
goto :end

:d
echo ===== 部署上线 =====
call hexo clean
call hexo generate
call hexo deploy
goto :end

:g
echo ===== 生成静态文件 =====
call hexo clean
call hexo generate
goto :end

:s
echo ===== 启动服务器 =====
call hexo generate
call hexo server
goto :end

:c
echo ===== 清理生成文件 =====
call hexo clean
goto :end

:end
echo ===== 完成 =====