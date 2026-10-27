const { db } = require('../db');

/**
 * Service Modul Pendaftaran Rumah Sakit Politeknik LP3I Jakarta
 * Memenuhi spesifikasi rekayasa perangkat lunak SDLC Waterfall.
 */

// Helper: Ubah tanggal string YYYY-MM-DD menjadi nama hari dalam Bahasa Indonesia
function getHariIndonesia(dateString) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const d = new Date(dateString + 'T00:00:00');
  return days[d.getDay()];
}

// Helper: Generate Nomor Rekam Medis Baru yang Unik secara Sekuensial
function generateNomorRM() {
  const currentYear = new Date().getFullYear();
  const row = db.prepare(`
    SELECT nomor_rm FROM pasien 
    WHERE nomor_rm LIKE ? 
    ORDER BY id DESC LIMIT 1
  `).get(`RM-${currentYear}-%`);

  let nextSequence = 1;
  if (row && row.nomor_rm) {
    const parts = row.nomor_rm.split('-');
    if (parts.length === 3) {
      nextSequence = parseInt(parts[2], 10) + 1;
    }
  }

  const paddedSequence = String(nextSequence).padStart(4, '0');
  return `RM-${currentYear}-${paddedSequence}`;
}

/**
 * 1. ALGORITMA PENGECEKAN KETERSEDIAAN KUOTA DOKTER
 * Sesuai Tugas Bab III.b.1
 * Memeriksa kuota maksimal dokter dari jadwal praktik dan membandingkannya
 * dengan total pendaftaran aktif pada tanggal tersebut.
 */
function checkDoctorQuota(dokterId, tanggalKunjungan) {
  // Validasi parameter
  if (!dokterId || !tanggalKunjungan) {
    throw new Error('Dokter ID dan tanggal kunjungan wajib disertakan.');
  }

  // 1. Dapatkan hari pelaksanaan dari tanggal kunjungan
  const namaHari = getHariIndonesia(tanggalKunjungan);
  if (namaHari === 'Minggu') {
    return {
      available: false,
      reason: 'Rumah sakit tidak melayani poliklinik reguler pada hari Minggu.',
      kuotaMaksimal: 0,
      kuotaTerisi: 0,
      sisaKuota: 0
    };
  }

  // 2. Query jadwal praktik dokter untuk hari terkait
  const jadwal = db.prepare(`
    SELECT j.*, d.nama_dokter, d.spesialisasi, p.nama_poli, p.kode_poli
    FROM jadwal_praktik j
    JOIN dokter d ON j.dokter_id = d.id
    JOIN poliklinik p ON d.poli_id = p.id
    WHERE j.dokter_id = ? AND j.hari = ?
    LIMIT 1
  `).get(dokterId, namaHari);

  if (!jadwal) {
    return {
      available: false,
      reason: `Dokter tidak memiliki jadwal praktik pada hari ${namaHari}.`,
      kuotaMaksimal: 0,
      kuotaTerisi: 0,
      sisaKuota: 0
    };
  }

  // 3. Hitung jumlah pendaftaran aktif yang sudah terdaftar pada tanggal dan dokter tersebut
  const countRow = db.prepare(`
    SELECT COUNT(*) as total_terdaftar
    FROM pendaftaran
    WHERE dokter_id = ? 
      AND tanggal_kunjungan = ? 
      AND status_pendaftaran != 'BATAL'
  `).get(dokterId, tanggalKunjungan);

  const kuotaMaksimal = jadwal.kuota_maksimal;
  const kuotaTerisi = countRow ? countRow.total_terdaftar : 0;
  const sisaKuota = Math.max(0, kuotaMaksimal - kuotaTerisi);
  const isAvailable = sisaKuota > 0;

  return {
    available: isAvailable,
    dokterId: Number(dokterId),
    namaDokter: jadwal.nama_dokter,
    spesialisasi: jadwal.spesialisasi,
    poli: jadwal.nama_poli,
    kodePoli: jadwal.kode_poli,
    hari: namaHari,
    jamMulai: jadwal.jam_mulai,
    jamSelesai: jadwal.jam_selesai,
    kuotaMaksimal,
    kuotaTerisi,
    sisaKuota,
    message: isAvailable 
      ? `Kuota tersedia. Sisa slot: ${sisaKuota} dari total ${kuotaMaksimal}.`
      : `Mohon maaf, kuota dokter untuk tanggal ${tanggalKunjungan} sudah penuh (${kuotaMaksimal}/${kuotaMaksimal}).`
  };
}

/**
 * 2. ENDPOINT & LOGIKA PROSES PENDAFTARAN PASIEN BARU
 * Sesuai Tugas Bab III.b.2
 * Melakukan validasi input, pencatatan master pasien, pengecekan kuota, 
 * dan pembuatan nomor antrean secara transaksional.
 */
function registerNewPatient(data) {
  const {
    nik,
    namaLengkap,
    jenisKelamin,
    tanggalLahir,
    alamat,
    noHp,
    golonganDarah = '-',
    jenisPenjamin, // 'UMUM' atau 'BPJS'
    nomorBpjs = null,
    dokterId,
    poliId,
    tanggalKunjungan,
    sesi = 'Pagi (08:00 - 12:00)',
    keluhanAwal = ''
  } = data;

  // Validasi Input Wajib
  if (!nik || !namaLengkap || !jenisKelamin || !tanggalLahir || !alamat || !noHp || !jenisPenjamin || !dokterId || !poliId || !tanggalKunjungan) {
    const error = new Error('Semua data wajib (NIK, Nama, Jenis Kelamin, Tanggal Lahir, Alamat, No HP, Penjamin, Poli, Dokter, Tanggal) harus diisi.');
    error.statusCode = 400;
    throw error;
  }

  // Validasi Format NIK (harus 16 digit angka)
  if (!/^\d{16}$/.test(nik)) {
    const error = new Error('NIK tidak valid. NIK harus terdiri dari tepat 16 digit angka.');
    error.statusCode = 400;
    throw error;
  }

  // Validasi Nomor BPJS jika penjamin adalah BPJS
  if (jenisPenjamin.toUpperCase() === 'BPJS' && (!nomorBpjs || nomorBpjs.trim().length < 10)) {
    const error = new Error('Nomor Kartu BPJS Kesehatan wajib diisi dengan benar untuk penjamin BPJS.');
    error.statusCode = 400;
    throw error;
  }

  // Pengecekan apakah NIK sudah pernah terdaftar sebagai pasien
  const existingPatient = db.prepare('SELECT * FROM pasien WHERE nik = ?').get(nik);
  if (existingPatient) {
    const error = new Error(`Pasien dengan NIK ${nik} sudah terdaftar dengan Nomor RM: ${existingPatient.nomor_rm}. Silakan gunakan menu Pendaftaran Pasien Lama/Kontrol.`);
    error.statusCode = 409;
    throw error;
  }

  // Eksekusi Pendaftaran dalam blok Transaksi untuk menjaga integritas data & konkurensi kuota
  db.exec('BEGIN TRANSACTION;');
  try {
    // A. Periksa kuota dokter secara live di dalam transaksi
    const quotaCheck = checkDoctorQuota(dokterId, tanggalKunjungan);
    if (!quotaCheck.available) {
      const error = new Error(quotaCheck.message || 'Kuota dokter telah penuh untuk tanggal yang dipilih.');
      error.statusCode = 409;
      throw error;
    }

    // B. Buat Nomor Rekam Medis Baru
    const nomorRM = generateNomorRM();

    // C. Simpan data pasien baru ke tabel pasien
    const insertPasien = db.prepare(`
      INSERT INTO pasien (
        nomor_rm, nik, nama_lengkap, jenis_kelamin, tanggal_lahir, 
        alamat, no_hp, golongan_darah, jenis_penjamin, nomor_bpjs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const pasienResult = insertPasien.run(
      nomorRM,
      nik.trim(),
      namaLengkap.trim(),
      jenisKelamin,
      tanggalLahir,
      alamat.trim(),
      noHp.trim(),
      golonganDarah,
      jenisPenjamin.toUpperCase(),
      nomorBpjs ? nomorBpjs.trim() : null
    );
    const newPasienId = Number(pasienResult.lastInsertRowid);

    // D. Dapatkan nomor antrean berikutnya untuk poliklinik dan tanggal terkait
    const antreanRow = db.prepare(`
      SELECT COUNT(*) as total FROM pendaftaran 
      WHERE poli_id = ? AND tanggal_kunjungan = ?
    `).get(poliId, tanggalKunjungan);

    const angkaAntrean = (antreanRow ? antreanRow.total : 0) + 1;
    const kodePoli = quotaCheck.kodePoli || 'POLI';
    const nomorAntrean = `${kodePoli}-${String(angkaAntrean).padStart(3, '0')}`;
    const kodeBooking = `REG-${tanggalKunjungan.replace(/-/g, '')}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    // E. Simpan data reservasi ke tabel pendaftaran
    const insertPendaftaran = db.prepare(`
      INSERT INTO pendaftaran (
        kode_booking, nomor_antrean, angka_antrean, pasien_id, dokter_id, 
        poli_id, tanggal_kunjungan, sesi, status_pendaftaran, jenis_penjamin, keluhan_awal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const pendaftaranResult = insertPendaftaran.run(
      kodeBooking,
      nomorAntrean,
      angkaAntrean,
      newPasienId,
      dokterId,
      poliId,
      tanggalKunjungan,
      sesi,
      'MENUNGGU',
      jenisPenjamin.toUpperCase(),
      keluhanAwal.trim()
    );

    db.exec('COMMIT;');

    return {
      success: true,
      message: 'Pendaftaran pasien baru dan reservasi dokter berhasil dibuat.',
      data: {
        pendaftaranId: Number(pendaftaranResult.lastInsertRowid),
        kodeBooking,
        nomorAntrean,
        angkaAntrean,
        nomorRM,
        namaPasien: namaLengkap,
        nik,
        namaPoli: quotaCheck.poli,
        namaDokter: quotaCheck.namaDokter,
        tanggalKunjungan,
        sesi,
        jenisPenjamin: jenisPenjamin.toUpperCase(),
        statusPendaftaran: 'MENUNGGU'
      }
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * 3. PENDAFTARAN PASIEN LAMA (PASIEN KONTROL)
 * Pasien yang sudah memiliki Nomor RM cukup menginput No. RM atau NIK
 */
function registerExistingPatient(data) {
  const {
    identifier, // nomor_rm ATAU nik
    dokterId,
    poliId,
    tanggalKunjungan,
    sesi = 'Pagi (08:00 - 12:00)',
    keluhanAwal = ''
  } = data;

  if (!identifier || !dokterId || !poliId || !tanggalKunjungan) {
    const error = new Error('Nomor RM / NIK, Dokter, Poliklinik, dan Tanggal Kunjungan wajib diisi.');
    error.statusCode = 400;
    throw error;
  }

  // Cari pasien berdasarkan Nomor RM atau NIK
  const pasien = db.prepare(`
    SELECT * FROM pasien WHERE nomor_rm = ? OR nik = ? LIMIT 1
  `).get(identifier.trim(), identifier.trim());

  if (!pasien) {
    const error = new Error(`Data pasien dengan No. RM / NIK "${identifier}" tidak ditemukan. Silakan lakukan pendaftaran pasien baru terlebih dahulu.`);
    error.statusCode = 404;
    throw error;
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    // Periksa kuota dokter
    const quotaCheck = checkDoctorQuota(dokterId, tanggalKunjungan);
    if (!quotaCheck.available) {
      const error = new Error(quotaCheck.message || 'Kuota dokter telah penuh untuk tanggal yang dipilih.');
      error.statusCode = 409;
      throw error;
    }

    // Nomor Antrean berikutnya
    const antreanRow = db.prepare(`
      SELECT COUNT(*) as total FROM pendaftaran 
      WHERE poli_id = ? AND tanggal_kunjungan = ?
    `).get(poliId, tanggalKunjungan);

    const angkaAntrean = (antreanRow ? antreanRow.total : 0) + 1;
    const kodePoli = quotaCheck.kodePoli || 'POLI';
    const nomorAntrean = `${kodePoli}-${String(angkaAntrean).padStart(3, '0')}`;
    const kodeBooking = `REG-${tanggalKunjungan.replace(/-/g, '')}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const insertPendaftaran = db.prepare(`
      INSERT INTO pendaftaran (
        kode_booking, nomor_antrean, angka_antrean, pasien_id, dokter_id, 
        poli_id, tanggal_kunjungan, sesi, status_pendaftaran, jenis_penjamin, keluhan_awal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const pendaftaranResult = insertPendaftaran.run(
      kodeBooking,
      nomorAntrean,
      angkaAntrean,
      pasien.id,
      dokterId,
      poliId,
      tanggalKunjungan,
      sesi,
      'MENUNGGU',
      pasien.jenis_penjamin,
      keluhanAwal.trim()
    );

    db.exec('COMMIT;');

    return {
      success: true,
      message: 'Reservasi kontrol pasien lama berhasil dibuat.',
      data: {
        pendaftaranId: Number(pendaftaranResult.lastInsertRowid),
        kodeBooking,
        nomorAntrean,
        angkaAntrean,
        nomorRM: pasien.nomor_rm,
        namaPasien: pasien.nama_lengkap,
        nik: pasien.nik,
        namaPoli: quotaCheck.poli,
        namaDokter: quotaCheck.namaDokter,
        tanggalKunjungan,
        sesi,
        jenisPenjamin: pasien.jenis_penjamin,
        statusPendaftaran: 'MENUNGGU'
      }
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * 4. PENGAMBILAN DATA MASTER & TRANSAKSI
 */
function getAllPoliklinik() {
  return db.prepare('SELECT * FROM poliklinik ORDER BY id ASC').all();
}

function getDokterByPoli(poliId) {
  return db.prepare(`
    SELECT d.*, p.nama_poli 
    FROM dokter d 
    JOIN poliklinik p ON d.poli_id = p.id 
    WHERE d.poli_id = ?
    ORDER BY d.id ASC
  `).all(poliId);
}

function getPendaftaranList(filters = {}) {
  let query = `
    SELECT 
      p.id as pendaftaran_id,
      p.kode_booking,
      p.nomor_antrean,
      p.angka_antrean,
      p.tanggal_kunjungan,
      p.sesi,
      p.status_pendaftaran,
      p.jenis_penjamin,
      p.keluhan_awal,
      p.waktu_daftar,
      p.waktu_checkin,
      pas.nomor_rm,
      pas.nama_lengkap as nama_pasien,
      pas.nik,
      pas.no_hp,
      pas.jenis_kelamin,
      dok.nama_dokter,
      dok.spesialisasi,
      pol.nama_poli,
      pol.kode_poli
    FROM pendaftaran p
    JOIN pasien pas ON p.pasien_id = pas.id
    JOIN dokter dok ON p.dokter_id = dok.id
    JOIN poliklinik pol ON p.poli_id = pol.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.tanggal) {
    query += ` AND p.tanggal_kunjungan = ?`;
    params.push(filters.tanggal);
  }
  if (filters.poli_id) {
    query += ` AND p.poli_id = ?`;
    params.push(filters.poli_id);
  }
  if (filters.dokter_id) {
    query += ` AND p.dokter_id = ?`;
    params.push(filters.dokter_id);
  }
  if (filters.status) {
    query += ` AND p.status_pendaftaran = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY p.tanggal_kunjungan DESC, p.angka_antrean ASC`;
  return db.prepare(query).all(...params);
}

function updateStatusPendaftaran(pendaftaranId, status) {
  const allowed = ['MENUNGGU', 'TERKONFIRMASI', 'DIPERIKSA', 'SELESAI', 'BATAL'];
  if (!allowed.includes(status)) {
    throw new Error('Status pendaftaran tidak valid.');
  }

  let stmt;
  if (status === 'TERKONFIRMASI') {
    stmt = db.prepare(`
      UPDATE pendaftaran 
      SET status_pendaftaran = ?, waktu_checkin = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
  } else {
    stmt = db.prepare(`
      UPDATE pendaftaran 
      SET status_pendaftaran = ? 
      WHERE id = ?
    `);
  }

  const result = stmt.run(status, pendaftaranId);
  return result.changes > 0;
}

function simpanRekamMedis(data) {
  const {
    pendaftaranId,
    tekananDarah = '-',
    suhuTubuh = 36.5,
    beratBadan = 0,
    tinggiBadan = 0,
    keluhanUtama,
    diagnosaIcd10,
    rencanaTerapi,
    catatanDokter = ''
  } = data;

  if (!pendaftaranId || !keluhanUtama || !diagnosaIcd10 || !rencanaTerapi) {
    throw new Error('Pendaftaran ID, Keluhan Utama, Diagnosa ICD-10, dan Rencana Terapi wajib diisi.');
  }

  const pendaftaran = db.prepare('SELECT * FROM pendaftaran WHERE id = ?').get(pendaftaranId);
  if (!pendaftaran) {
    throw new Error('Data pendaftaran tidak ditemukan.');
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const insertRM = db.prepare(`
      INSERT INTO rekam_medis (
        pendaftaran_id, pasien_id, dokter_id, tekanan_darah, suhu_tubuh, 
        berat_badan, tinggi_badan, keluhan_utama, diagnosa_icd10, rencana_terapi, catatan_dokter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertRM.run(
      pendaftaranId,
      pendaftaran.pasien_id,
      pendaftaran.dokter_id,
      tekananDarah,
      suhuTubuh,
      beratBadan,
      tinggiBadan,
      keluhanUtama,
      diagnosaIcd10,
      rencanaTerapi,
      catatanDokter
    );

    // Update status pendaftaran menjadi SELESAI
    db.prepare(`UPDATE pendaftaran SET status_pendaftaran = 'SELESAI' WHERE id = ?`).run(pendaftaranId);

    db.exec('COMMIT;');
    return { success: true, message: 'Pemeriksaan rekam medis berhasil disimpan.' };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * 5. AMBIL ANTREAN CEPAT MESIN KIOSK LOBI (1-KLIK)
 * Memungkinkan pasien onsite di lobi RS mengambil nomor antrean fisik seketika
 */
function registerKioskWalkIn(poliId, jenisPenjamin = 'UMUM') {
  if (!poliId) {
    throw new Error('Poliklinik tujuan wajib dipilih.');
  }

  const today = new Date().toISOString().split('T')[0];
  const namaHari = getHariIndonesia(today);

  // 1. Dapatkan dokter yang bertugas di poli ini hari ini
  const dokter = db.prepare(`
    SELECT d.id as dokter_id, d.nama_dokter, p.nama_poli, p.kode_poli
    FROM dokter d
    JOIN poliklinik p ON d.poli_id = p.id
    WHERE d.poli_id = ?
    LIMIT 1
  `).get(poliId);

  if (!dokter) {
    throw new Error('Poliklinik tidak ditemukan.');
  }

  // 2. Dapatkan atau buat pasien walk-in default
  let pasienWalkin = db.prepare(`SELECT * FROM pasien WHERE nik = '3171010000000000'`).get();
  if (!pasienWalkin) {
    const insertP = db.prepare(`
      INSERT INTO pasien (nomor_rm, nik, nama_lengkap, jenis_kelamin, tanggal_lahir, alamat, no_hp, jenis_penjamin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertP.run(
      'RM-ONSITE-0001',
      '3171010000000000',
      'Pasien On-site (Kiosk Lobi)',
      'Laki-laki',
      '2000-01-01',
      'Loket Pendaftaran Lobi RS',
      '080000000000',
      jenisPenjamin.toUpperCase()
    );
    pasienWalkin = db.prepare(`SELECT * FROM pasien WHERE nik = '3171010000000000'`).get();
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    // 3. Hitung nomor antrean poliklinik berikutnya
    const antreanRow = db.prepare(`
      SELECT COUNT(*) as total FROM pendaftaran 
      WHERE poli_id = ? AND tanggal_kunjungan = ?
    `).get(poliId, today);

    const angkaAntrean = (antreanRow ? antreanRow.total : 0) + 1;
    const kodePoli = dokter.kode_poli || 'POLI';
    const nomorAntrean = `${kodePoli}-${String(angkaAntrean).padStart(3, '0')}`;
    const kodeBooking = `KIOSK-${today.replace(/-/g, '')}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const insertPendaftaran = db.prepare(`
      INSERT INTO pendaftaran (
        kode_booking, nomor_antrean, angka_antrean, pasien_id, dokter_id, 
        poli_id, tanggal_kunjungan, sesi, status_pendaftaran, jenis_penjamin, keluhan_awal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertPendaftaran.run(
      kodeBooking,
      nomorAntrean,
      angkaAntrean,
      pasienWalkin.id,
      dokter.dokter_id,
      poliId,
      today,
      'Sesi Pagi (08:00 - 12:00)',
      'MENUNGGU',
      jenisPenjamin.toUpperCase(),
      'Kunjungan Mandiri Kiosk Lobi'
    );

    db.exec('COMMIT;');

    return {
      success: true,
      message: 'Nomor antrean fisik kiosk berhasil diterbitkan.',
      data: {
        pendaftaranId: Number(result.lastInsertRowid),
        kodeBooking,
        nomorAntrean,
        angkaAntrean,
        nomorRM: pasienWalkin.nomor_rm,
        namaPasien: 'Pasien On-site Kiosk',
        namaPoli: dokter.nama_poli,
        namaDokter: dokter.nama_dokter,
        tanggalKunjungan: today,
        sesi: 'Antrean Walk-in Hari Ini',
        jenisPenjamin: jenisPenjamin.toUpperCase(),
        waktuDiterbitkan: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
      }
    };
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
}

/**
 * 6. VERIFIKASI QR CODE / KODE BOOKING DI MEJA ADMISI
 */
function verifyQrOrCode(code) {
  if (!code || typeof code !== 'string') {
    throw new Error('Kode booking atau nomor antrean harus disertakan.');
  }

  const cleanCode = code.trim();
  const row = db.prepare(`
    SELECT 
      p.id as pendaftaran_id,
      p.kode_booking,
      p.nomor_antrean,
      p.status_pendaftaran,
      p.tanggal_kunjungan,
      p.jenis_penjamin,
      pas.nama_lengkap as nama_pasien,
      pas.nomor_rm,
      pas.nik,
      dok.nama_dokter,
      pol.nama_poli
    FROM pendaftaran p
    JOIN pasien pas ON p.pasien_id = pas.id
    JOIN dokter dok ON p.dokter_id = dok.id
    JOIN poliklinik pol ON p.poli_id = pol.id
    WHERE p.kode_booking = ? OR p.nomor_antrean = ?
    LIMIT 1
  `).get(cleanCode, cleanCode);

  if (!row) {
    const error = new Error(`Data antrean dengan kode "${cleanCode}" tidak ditemukan.`);
    error.statusCode = 404;
    throw error;
  }

  const alreadyCheckedIn = row.status_pendaftaran === 'TERKONFIRMASI';

  // Jika masih MENUNGGU, ubah status menjadi TERKONFIRMASI (Check-in)
  if (row.status_pendaftaran === 'MENUNGGU') {
    db.prepare(`
      UPDATE pendaftaran 
      SET status_pendaftaran = 'TERKONFIRMASI', waktu_checkin = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(row.pendaftaran_id);
    row.status_pendaftaran = 'TERKONFIRMASI';
  }

  return {
    success: true,
    alreadyCheckedIn,
    message: alreadyCheckedIn 
      ? `Antrean ${row.nomor_antrean} sudah pernah check-in sebelumnya.` 
      : `Check-in berhasil! Pasien ${row.nama_pasien} (${row.nomor_antrean}) telah terverifikasi.`,
    data: row
  };
}

function getRiwayatRekamMedisByRM(nomorRM) {
  return db.prepare(`
    SELECT 
      rm.*,
      p.nama_lengkap as nama_pasien,
      p.nomor_rm,
      d.nama_dokter,
      pol.nama_poli,
      pend.tanggal_kunjungan
    FROM rekam_medis rm
    JOIN pasien p ON rm.pasien_id = p.id
    JOIN dokter d ON rm.dokter_id = d.id
    JOIN pendaftaran pend ON rm.pendaftaran_id = pend.id
    JOIN poliklinik pol ON pend.poli_id = pol.id
    WHERE p.nomor_rm = ? OR p.nik = ?
    ORDER BY rm.tanggal_pemeriksaan DESC
  `).all(nomorRM, nomorRM);
}

module.exports = {
  checkDoctorQuota,
  registerNewPatient,
  registerExistingPatient,
  getAllPoliklinik,
  getDokterByPoli,
  getPendaftaranList,
  updateStatusPendaftaran,
  simpanRekamMedis,
  getRiwayatRekamMedisByRM,
  registerKioskWalkIn,
  verifyQrOrCode
};
