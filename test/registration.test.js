const test = require('node:test');
const assert = require('node:assert/strict');
const registrationService = require('../src/services/registrationService');
const { db } = require('../src/db');

test('SMART PATIENT REGISTRATION - RS POLITEKNIK LP3I JAKARTA TEST SUITE', async (t) => {

  await t.test('1. Algoritma Kuota Dokter: Harus mengecek ketersediaan kuota dokter pada tanggal tertentu', () => {
    // Hari kerja: misalkan kita gunakan tanggal tertentu (2026-10-27 adalah Selasa)
    const tanggal = '2026-10-27';
    const quota = registrationService.checkDoctorQuota(1, tanggal);

    assert.ok(quota, 'Response kuota tidak boleh null');
    assert.equal(quota.dokterId, 1);
    assert.equal(quota.available, true);
    assert.ok(quota.kuotaMaksimal > 0, 'Kuota maksimal harus lebih dari 0');
    assert.ok(quota.sisaKuota <= quota.kuotaMaksimal, 'Sisa kuota harus valid');
    assert.match(quota.message, /Kuota tersedia|penuh/);
  });

  await t.test('2. Algoritma Kuota Dokter: Menolak jika hari Minggu (libur poliklinik)', () => {
    // 2026-11-01 adalah hari Minggu
    const quotaMinggu = registrationService.checkDoctorQuota(1, '2026-11-01');
    assert.equal(quotaMinggu.available, false);
    assert.match(quotaMinggu.reason, /hari Minggu/i);
  });

  await t.test('3. Registrasi Pasien Baru: Validasi kegagalan jika NIK kurang dari 16 digit', () => {
    assert.throws(() => {
      registrationService.registerNewPatient({
        nik: '12345', // Invalid
        namaLengkap: 'Budi Test',
        jenisKelamin: 'Laki-laki',
        tanggalLahir: '2000-01-01',
        alamat: 'Jakarta',
        noHp: '08123456789',
        jenisPenjamin: 'UMUM',
        dokterId: 1,
        poliId: 1,
        tanggalKunjungan: '2026-10-28'
      });
    }, /NIK tidak valid/i);
  });

  await t.test('4. Registrasi Pasien Baru: Berhasil menyimpan data, auto-generate Nomor RM & Nomor Antrean', () => {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const uniqueNik = `317101${randomSuffix}0001`;

    const result = registrationService.registerNewPatient({
      nik: uniqueNik,
      namaLengkap: 'Farhan Maulana',
      jenisKelamin: 'Laki-laki',
      tanggalLahir: '2001-05-15',
      alamat: 'Jl. Salemba Tengah No. 20, Jakarta Pusat',
      noHp: '081299887766',
      golonganDarah: 'B',
      jenisPenjamin: 'BPJS',
      nomorBpjs: '0009876543210',
      dokterId: 1,
      poliId: 1,
      tanggalKunjungan: '2026-10-28',
      sesi: 'Pagi (08:00 - 12:00)',
      keluhanAwal: 'Batuk dan pilek sejak kemarin malam'
    });

    assert.equal(result.success, true);
    assert.ok(result.data.nomorRM.startsWith('RM-'), 'Nomor RM harus diawali RM-');
    assert.ok(result.data.nomorAntrean.startsWith('POLI-'), 'Nomor Antrean harus diawali kode poli');
    assert.equal(result.data.statusPendaftaran, 'MENUNGGU');
    assert.equal(result.data.namaPasien, 'Farhan Maulana');
  });

  await t.test('5. Registrasi Pasien Lama (Kontrol): Berhasil menggunakan Nomor RM yang sudah ada', () => {
    const result = registrationService.registerExistingPatient({
      identifier: 'RM-2026-0001', // Pasien seed
      dokterId: 1,
      poliId: 1,
      tanggalKunjungan: '2026-10-29',
      sesi: 'Pagi (08:00 - 12:00)',
      keluhanAwal: 'Kontrol rutin pasca perawatan lambung'
    });

    assert.equal(result.success, true);
    assert.equal(result.data.nomorRM, 'RM-2026-0001');
    assert.equal(result.data.namaPasien, 'Ahmad Fadillah');
    assert.ok(result.data.nomorAntrean.length > 0);
  });

  await t.test('6. Admisi: Update status pendaftaran menjadi TERKONFIRMASI (Check-in loket)', () => {
    // Ambil pendaftaran pertama
    const list = registrationService.getPendaftaranList({});
    assert.ok(list.length > 0, 'Harus ada data pendaftaran');

    const firstId = list[0].pendaftaran_id;
    const updateResult = registrationService.updateStatusPendaftaran(firstId, 'TERKONFIRMASI');
    assert.equal(updateResult, true);

    const check = db.prepare('SELECT status_pendaftaran, waktu_checkin FROM pendaftaran WHERE id = ?').get(firstId);
    assert.equal(check.status_pendaftaran, 'TERKONFIRMASI');
    assert.ok(check.waktu_checkin !== null, 'Waktu checkin harus tercatat');
  });

  await t.test('7. Dokter & Poliklinik: Simpan Rekam Medis & Selesaikan Antrean', () => {
    // Cari pendaftaran yang belum memiliki rekam medis
    const pendaftaran = db.prepare(`
      SELECT p.id as pendaftaran_id 
      FROM pendaftaran p
      LEFT JOIN rekam_medis rm ON p.id = rm.pendaftaran_id
      WHERE rm.id IS NULL
      ORDER BY p.id DESC
      LIMIT 1
    `).get();

    assert.ok(pendaftaran, 'Harus ada pendaftaran yang belum memiliki rekam medis');
    const pendaftaranId = pendaftaran.pendaftaran_id;

    // Set status menjadi TERKONFIRMASI
    registrationService.updateStatusPendaftaran(pendaftaranId, 'TERKONFIRMASI');

    const resRM = registrationService.simpanRekamMedis({
      pendaftaranId,
      tekananDarah: '120/80 mmHg',
      suhuTubuh: 36.8,
      beratBadan: 68.0,
      tinggiBadan: 172.0,
      keluhanUtama: 'Pusing berputar saat bangun tidur',
      diagnosaIcd10: 'H81.1 - Benign Paroxysmal Positional Vertigo',
      rencanaTerapi: 'Betahistine Mesylate 6mg 3x1, Flunarizine 5mg malam',
      catatanDokter: 'Edukasi manuver Epley dan hindari gerakan mendadak'
    });

    assert.equal(resRM.success, true);

    // Status pendaftaran harus berubah menjadi SELESAI
    const checkStatus = db.prepare('SELECT status_pendaftaran FROM pendaftaran WHERE id = ?').get(pendaftaranId);
    assert.equal(checkStatus.status_pendaftaran, 'SELESAI');
  });

  await t.test('8. Kiosk Lobi 1-Klik: Berhasil menerbitkan nomor antrean fisik instan', () => {
    const kioskRes = registrationService.registerKioskWalkIn(1, 'UMUM');
    assert.equal(kioskRes.success, true);
    assert.ok(kioskRes.data.nomorAntrean.startsWith('POLI-UMUM'));
    assert.ok(kioskRes.data.kodeBooking.startsWith('KIOSK-'));
  });

  await t.test('9. Admisi Verifikasi QR: Scan QR/Kode booking otomatis mengubah status menjadi TERKONFIRMASI', () => {
    // Buat tiket walkin dulu
    const kiosk = registrationService.registerKioskWalkIn(2, 'BPJS');
    const qrCode = kiosk.data.kodeBooking;

    const verifyRes = registrationService.verifyQrOrCode(qrCode);
    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.data.status_pendaftaran, 'TERKONFIRMASI');
  });

});
