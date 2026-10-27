# SMART PATIENT REGISTRATION - RS POLITEKNIK LP3I JAKARTA
### Ujian Tengah Semester (UTS) Praktikum - Sistem Informasi Manajemen
**Semester 5 / 4 SKS - Manajemen Informatika Politeknik LP3I Jakarta**
**Dosen Penguji / Kaprodi:** Nasril, S.Kom., M.M.

---

## 🌟 Ringkasan Proyek
Aplikasi Pintar Pendaftaran Pasien (*Smart Patient Registration*) dirancang menggunakan metodologi **SDLC - Waterfall Model** untuk mengatasi masalah antrean panjang di loket pendaftaran RS Politeknik LP3I Jakarta, mencegah duplikasi data rekam medis pasien, serta memberikan kemudahan reservasi online untuk pasien UMUM maupun BPJS Kesehatan.

---

## 📁 Struktur Direktori & Dokumen Luaran
```
Sistem_rumahsakit_politeknik_lp3ijkt/
├── LAPORAN_TUGAS_AKHIR_LP3I_SMART_PATIENT_REGISTRATION.docx # File Dokumen Microsoft Word Resmi (Sesuai Pedoman LP3I 2026)
├── LAPORAN_PROYEK_SMART_PATIENT_REGISTRATION.html          # Dokumen Laporan Siap Cetak / Save as PDF (Ctrl + P)
├── LAPORAN_PROYEK_SMART_PATIENT_REGISTRATION.md           # Laporan Proposal Proyek Format Markdown
├── package.json                                           # Konfigurasi dependensi & npm scripts
├── database.sqlite                                       # Basis data relasional SQLite ACID-compliant
├── src/
│   ├── db.js                                             # Inisialisasi skema tabel & data awal (seed)
│   ├── server.js                                         # Server Express.js (REST API & Web UI)
│   ├── routes/
│   │   └── api.js                                        # Endpoint API (kuota, pendaftaran, rekam medis)
│   └── services/
│       └── registrationService.js                        # Algoritma ketersediaan kuota & transaksi pendaftaran
├── public/
│   ├── index.html                                        # Antarmuka Web Pasien, Admisi, dan Dokter
│   └── lp3i_logo.png                                     # Logo Resmi Politeknik LP3I Jakarta
└── test/
    └── registration.test.js                              # Automated Test Suite (100% PASS)
```

---

## 🚀 Cara Menjalankan Aplikasi

### 1. Menjalankan Server Web & API
Buka terminal / Command Prompt di folder ini, lalu jalankan:
```bash
npm start
```
Buka browser dan akses:
👉 **http://localhost:3000**

Aplikasi web menyediakan 3 portal terpadu:
1. **Portal Pasien:** Pendaftaran Pasien Baru, Pendaftaran Pasien Kontrol (Lama), Cek Kuota Live, Cetak E-Tiket Digital & Barcode.
2. **Portal Admisi:** Meja Petugas Loket untuk pemantauan antrean real-time, validasi berkas identitas & check-in kedatangan.
3. **Portal Dokter / Poliklinik:** Pemanggilan antrean (dengan audio speech synthesis), pemeriksaan tanda vital, input diagnosa ICD-10, dan histori rekam medis pasien.

---

### 2. Menjalankan Pengujian Otomatis (*Automated Testing*)
Sistem dilengkapi dengan test suite lengkap untuk memverifikasi algoritma kuota, validasi input, transaksi basis data, dan integritas alur:
```bash
npm test
```
*Hasil: 8 dari 8 pengujian lolos 100% (Pass).*

---

### 3. Membuka & Mencetak Laporan Proyek ke PDF
- Buka file `LAPORAN_PROYEK_SMART_PATIENT_REGISTRATION.html` di browser (Google Chrome, Microsoft Edge, dll).
- Tekan tombol **"Cetak / Simpan PDF"** atau tekan shortcut keyboard **`Ctrl + P`**.
- Pada opsi printer, pilih **"Save as PDF"** / **"Simpan sebagai PDF"**.
- Dokumen siap dikumpulkan kepada dosen penguji.
