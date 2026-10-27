@echo off
title Upload Proyek RS Politeknik LP3I ke GitHub
color 0b
cls
echo ===============================================================================
echo       RS POLITEKNIK LP3I JAKARTA - SMART PATIENT REGISTRATION
echo                 UPLOAD PROYEK KE GITHUB REPOSITORY
echo ===============================================================================
echo.
echo Pastikan Anda sudah membuat repository baru di https://github.com/new
echo.
set /p REPO_URL="Masukkan Link Repository GitHub Anda (contoh: https://github.com/username/repo.git): "
if "%REPO_URL%"=="" (
    echo Error: Link repository tidak boleh kosong!
    pause
    exit /b
)
echo.
echo [1/3] Menyiapkan remote origin...
git remote remove origin 2>nul
git remote add origin %REPO_URL%
echo.
echo [2/3] Mengatur branch utama ke 'main'...
git branch -M main
echo.
echo [3/3] Mengunggah (push) seluruh kode sistem ke GitHub...
echo Jendela browser login GitHub mungkin akan muncul sekali, silakan klik 'Authorize'.
echo.
git push -u origin main
echo.
if %errorlevel% equ 0 (
    echo ===============================================================================
    echo   BERHASIL! Seluruh kode proyek Anda sudah terupload ke GitHub!
    echo   Silakan cek repository GitHub Anda di browser.
    echo ===============================================================================
) else (
    echo ===============================================================================
    echo   Gagal mengunggah. Pastikan link repository benar dan Anda mengizinkan login.
    echo ===============================================================================
)
pause
