@echo off
title RS Politeknik LP3I - Link Demo Publik untuk Dosen
color 0b
cls
echo ===============================================================================
echo       RS POLITEKNIK LP3I JAKARTA - SMART PATIENT REGISTRATION
echo                MEMBUAT LINK DEMO PUBLIK UNTUK DOSEN
echo ===============================================================================
echo.
echo [1/2] Memeriksa status server aplikasi (Port 3000)...
netstat -ano | findstr :3000 | findstr LISTENING >nul
if errorlevel 1 (
    echo [INFO] Menyalakan server Node.js di latar belakang...
    start /b "" node src/server.js
    timeout /t 2 >nul
) else (
    echo [INFO] Server aplikasi sudah aktif pada port 3000.
)
echo.
echo [2/2] Membuka Cloudflare Tunnel (100%% Gratis, HTTPS Resmi & Cepat)...
echo.
echo ===============================================================================
echo   LINK DEMO ANDA AKAN MUNCUL DI BAWAH INI (Berakhiran: trycloudflare.com):
echo   Contoh: https://xyz-sample.trycloudflare.com
echo.
echo   Tinggal klik atau copy link tersebut lalu kirimkan ke Dosen Anda!
echo ===============================================================================
echo.
npx.cmd --yes cloudflared tunnel --url http://localhost:3000
pause
