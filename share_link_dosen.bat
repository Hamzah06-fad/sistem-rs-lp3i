@echo off
title RS Politeknik LP3I - Link Demo Publik untuk Dosen
cls
echo ===============================================================================
echo       RS POLITEKNIK LP3I JAKARTA - SMART PATIENT REGISTRATION
echo                MEMBUAT LINK DEMO PUBLIK UNTUK DOSEN
echo ===============================================================================
echo.
echo [1/2] Menjalankan Server Sistem RS (Port 3000)...
start /b "" node src/server.js
timeout /t 2 >nul
echo.
echo [2/2] Menghubungkan ke Cloudflare Tunnel (100%% Gratis, Aman HTTPS Tanpa Password)...
echo.
echo ===============================================================================
echo   LINK DEMO PUBLIK ANDA AKAN MUNCUL DI BAWAH:
echo   (Salin link berakhiran .trycloudflare.com dan kirimkan ke Dosen Anda)
echo ===============================================================================
echo.
npx --yes cloudflared tunnel --url http://localhost:3000
pause
