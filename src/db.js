const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new DatabaseSync(dbPath);

function initDatabase() {
  // Aktifkan foreign keys
  db.exec('PRAGMA foreign_keys = ON;');

  // Tabel Poliklinik
  db.exec(`
    CREATE TABLE IF NOT EXISTS poliklinik (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode_poli TEXT UNIQUE NOT NULL,
      nama_poli TEXT NOT NULL,
      lokasi_gedung TEXT NOT NULL,
      biaya_pemeriksaan INTEGER NOT NULL DEFAULT 50000
    );
  `);

  // Tabel Dokter
  db.exec(`
    CREATE TABLE IF NOT EXISTS dokter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode_dokter TEXT UNIQUE NOT NULL,
      nama_dokter TEXT NOT NULL,
      spesialisasi TEXT NOT NULL,
      poli_id INTEGER NOT NULL,
      no_sip TEXT NOT NULL,
      FOREIGN KEY (poli_id) REFERENCES poliklinik(id)
    );
  `);

  // Tabel Jadwal Praktik Dokter
  db.exec(`
    CREATE TABLE IF NOT EXISTS jadwal_praktik (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dokter_id INTEGER NOT NULL,
      hari TEXT NOT NULL,
      jam_mulai TEXT NOT NULL,
      jam_selesai TEXT NOT NULL,
      kuota_maksimal INTEGER NOT NULL DEFAULT 20,
      FOREIGN KEY (dokter_id) REFERENCES dokter(id)
    );
  `);

  // Tabel Pasien
  db.exec(`
    CREATE TABLE IF NOT EXISTS pasien (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nomor_rm TEXT UNIQUE NOT NULL,
      nik TEXT UNIQUE NOT NULL,
      nama_lengkap TEXT NOT NULL,
      jenis_kelamin TEXT NOT NULL,
      tanggal_lahir TEXT NOT NULL,
      alamat TEXT NOT NULL,
      no_hp TEXT NOT NULL,
      golongan_darah TEXT DEFAULT '-',
      jenis_penjamin TEXT NOT NULL, -- 'UMUM' atau 'BPJS'
      nomor_bpjs TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tabel Pendaftaran / Kunjungan
  db.exec(`
    CREATE TABLE IF NOT EXISTS pendaftaran (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode_booking TEXT UNIQUE NOT NULL,
      nomor_antrean TEXT NOT NULL,
      angka_antrean INTEGER NOT NULL,
      pasien_id INTEGER NOT NULL,
      dokter_id INTEGER NOT NULL,
      poli_id INTEGER NOT NULL,
      tanggal_kunjungan TEXT NOT NULL,
      sesi TEXT NOT NULL, -- Pagi / Siang / Sore
      status_pendaftaran TEXT NOT NULL DEFAULT 'MENUNGGU', -- 'MENUNGGU', 'TERKONFIRMASI', 'DIPERIKSA', 'SELESAI', 'BATAL'
      jenis_penjamin TEXT NOT NULL,
      keluhan_awal TEXT,
      waktu_daftar DATETIME DEFAULT CURRENT_TIMESTAMP,
      waktu_checkin DATETIME,
      FOREIGN KEY (pasien_id) REFERENCES pasien(id),
      FOREIGN KEY (dokter_id) REFERENCES dokter(id),
      FOREIGN KEY (poli_id) REFERENCES poliklinik(id)
    );
  `);

  // Tabel Rekam Medis Awal
  db.exec(`
    CREATE TABLE IF NOT EXISTS rekam_medis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pendaftaran_id INTEGER UNIQUE NOT NULL,
      pasien_id INTEGER NOT NULL,
      dokter_id INTEGER NOT NULL,
      tanggal_pemeriksaan DATETIME DEFAULT CURRENT_TIMESTAMP,
      tekanan_darah TEXT,
      suhu_tubuh REAL,
      berat_badan REAL,
      tinggi_badan REAL,
      keluhan_utama TEXT NOT NULL,
      diagnosa_icd10 TEXT NOT NULL,
      rencana_terapi TEXT NOT NULL,
      catatan_dokter TEXT,
      FOREIGN KEY (pendaftaran_id) REFERENCES pendaftaran(id),
      FOREIGN KEY (pasien_id) REFERENCES pasien(id),
      FOREIGN KEY (dokter_id) REFERENCES dokter(id)
    );
  `);

  seedData();
}

function seedData() {
  const poliCount = db.prepare('SELECT COUNT(*) as count FROM poliklinik').get();
  if (poliCount.count > 0) return;

  // Insert Poliklinik
  const insertPoli = db.prepare(`
    INSERT INTO poliklinik (kode_poli, nama_poli, lokasi_gedung, biaya_pemeriksaan)
    VALUES (?, ?, ?, ?)
  `);
  insertPoli.run('POLI-UMUM', 'Poliklinik Umum & Layanan Primer', 'Gedung A Lantai 1', 50000);
  insertPoli.run('POLI-GIGI', 'Poliklinik Gigi & Mulut', 'Gedung A Lantai 2', 75000);
  insertPoli.run('POLI-ANAK', 'Poliklinik Spesialis Anak (Pediatri)', 'Gedung B Lantai 1', 100000);
  insertPoli.run('POLI-INT', 'Poliklinik Penyakit Dalam (Internis)', 'Gedung B Lantai 2', 120000);
  insertPoli.run('POLI-MATA', 'Poliklinik Spesialis Mata', 'Gedung A Lantai 3', 90000);

  // Insert Dokter
  const insertDokter = db.prepare(`
    INSERT INTO dokter (kode_dokter, nama_dokter, spesialisasi, poli_id, no_sip)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertDokter.run('DOK-001', 'dr. Nasril Al-Farabi, M.Kes', 'Dokter Umum', 1, 'SIP-446/DKK/2022/01');
  insertDokter.run('DOK-002', 'drg. Amanda Putri, Sp.KG', 'Spesialis Konservasi Gigi', 2, 'SIP-446/DKK/2021/08');
  insertDokter.run('DOK-003', 'dr. Budi Santoso, Sp.A', 'Spesialis Anak', 3, 'SIP-446/DKK/2020/12');
  insertDokter.run('DOK-004', 'dr. Citra Lestari, Sp.PD', 'Spesialis Penyakit Dalam', 4, 'SIP-446/DKK/2023/04');
  insertDokter.run('DOK-005', 'dr. Eko Prasetyo, Sp.M', 'Spesialis Mata', 5, 'SIP-446/DKK/2022/19');

  // Insert Jadwal Praktik (Setiap Senin s.d Sabtu)
  const insertJadwal = db.prepare(`
    INSERT INTO jadwal_praktik (dokter_id, hari, jam_mulai, jam_selesai, kuota_maksimal)
    VALUES (?, ?, ?, ?, ?)
  `);

  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  for (let docId = 1; docId <= 5; docId++) {
    for (const d of days) {
      insertJadwal.run(docId, d, '08:00', '12:00', 15);
      insertJadwal.run(docId, d, '13:00', '17:00', 15);
    }
  }

  // Insert Pasien Awal (Pasien Lama / Kontrol untuk simulasi)
  const insertPasien = db.prepare(`
    INSERT INTO pasien (nomor_rm, nik, nama_lengkap, jenis_kelamin, tanggal_lahir, alamat, no_hp, golongan_darah, jenis_penjamin, nomor_bpjs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPasien.run('RM-2026-0001', '3171012304950001', 'Ahmad Fadillah', 'Laki-laki', '1995-04-23', 'Jl. Kramat Sentiong No. 12, Senen, Jakarta Pusat', '081234567890', 'O', 'BPJS', '0001234567891');
  insertPasien.run('RM-2026-0002', '3171015607980002', 'Siti Rahmawati', 'Perempuan', '1998-07-16', 'Jl. Salemba Raya No. 45, Jakarta Pusat', '081398765432', 'A', 'UMUM', null);
  insertPasien.run('RM-2026-0003', '3171011211900003', 'Bambang Kusuma', 'Laki-laki', '1990-11-12', 'Jl. Percetakan Negara No. 8, Cempaka Putih', '085712344321', 'B', 'BPJS', '0001234567892');

  // Insert Contoh Pendaftaran Awal Hari Ini
  const today = new Date().toISOString().split('T')[0];
  const insertPendaftaran = db.prepare(`
    INSERT INTO pendaftaran (kode_booking, nomor_antrean, angka_antrean, pasien_id, dokter_id, poli_id, tanggal_kunjungan, sesi, status_pendaftaran, jenis_penjamin, keluhan_awal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPendaftaran.run('REG-20261027-001', 'POLI-UMUM-001', 1, 1, 1, 1, today, '08:00 - 12:00', 'TERKONFIRMASI', 'BPJS', 'Demam tinggi 3 hari dan batuk kering');
  insertPendaftaran.run('REG-20261027-002', 'POLI-GIGI-001', 1, 2, 2, 2, today, '08:00 - 12:00', 'MENUNGGU', 'UMUM', 'Sakit gigi geraham belakang berdenyut');
  
  // Insert Rekam Medis untuk Pasien 1 (riwayat terdahulu)
  const insertRM = db.prepare(`
    INSERT INTO rekam_medis (pendaftaran_id, pasien_id, dokter_id, tekanan_darah, suhu_tubuh, berat_badan, tinggi_badan, keluhan_utama, diagnosa_icd10, rencana_terapi, catatan_dokter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertRM.run(1, 1, 1, '120/80 mmHg', 38.4, 65.5, 170.0, 'Demam sejak 3 hari lalu, nafsu makan menurun', 'A09 - Gastroenteritis dan Kolitis Menular', 'Paracetamol 500mg 3x1, Oralit 1 sachet tiap BAB', 'Istirahat total dan perbanyak minum air putih');
}

// Inisialisasi DB saat modul dimuat
initDatabase();

module.exports = {
  db
};
