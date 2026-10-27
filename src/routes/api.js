const express = require('express');
const router = express.Router();
const registrationService = require('../services/registrationService');
const { db } = require('../db');

/**
 * Endpoint: Ambil semua Poliklinik
 * GET /api/poliklinik
 */
router.get('/poliklinik', (req, res) => {
  try {
    const list = registrationService.getAllPoliklinik();
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Endpoint: Ambil Dokter berdasarkan Poliklinik
 * GET /api/dokter?poli_id=1
 */
router.get('/dokter', (req, res) => {
  try {
    const { poli_id } = req.query;
    if (!poli_id) {
      const allDokter = db.prepare(`
        SELECT d.*, p.nama_poli 
        FROM dokter d 
        JOIN poliklinik p ON d.poli_id = p.id
      `).all();
      return res.json({ success: true, data: allDokter });
    }
    const list = registrationService.getDokterByPoli(poli_id);
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Endpoint Inti 1: Algoritma Pengecekan Ketersediaan Kuota Dokter
 * GET /api/jadwal/kuota?dokterId=1&tanggal=2026-10-27
 */
router.get('/jadwal/kuota', (req, res) => {
  try {
    const { dokterId, tanggal } = req.query;
    if (!dokterId || !tanggal) {
      return res.status(400).json({
        success: false,
        message: 'Parameter dokterId dan tanggal (format: YYYY-MM-DD) wajib disertakan.'
      });
    }

    const quotaResult = registrationService.checkDoctorQuota(dokterId, tanggal);
    res.json({
      success: true,
      data: quotaResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Endpoint Inti 2: Pendaftaran Pasien Baru
 * POST /api/pendaftaran/baru
 */
router.post('/pendaftaran/baru', (req, res) => {
  try {
    const result = registrationService.registerNewPatient(req.body);
    res.status(201).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Endpoint: Pendaftaran Pasien Lama (Kontrol)
 * POST /api/pendaftaran/lama
 */
router.post('/pendaftaran/lama', (req, res) => {
  try {
    const result = registrationService.registerExistingPatient(req.body);
    res.status(201).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Endpoint: Pencarian Pasien Terdaftar by NIK atau No. RM
 * GET /api/pasien/search?q=RM-2026-0001
 */
router.get('/pasien/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: 'Query pencarian diperlukan.' });
    }
    const pasien = db.prepare(`
      SELECT * FROM pasien 
      WHERE nomor_rm = ? OR nik = ? OR nama_lengkap LIKE ?
      LIMIT 5
    `).all(q.trim(), q.trim(), `%${q.trim()}%`);

    res.json({ success: true, data: pasien });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Endpoint: List Pendaftaran (Monitoring Admisi / Poliklinik)
 * GET /api/pendaftaran?tanggal=2026-10-27&poli_id=1&status=MENUNGGU
 */
router.get('/pendaftaran', (req, res) => {
  try {
    const filters = {
      tanggal: req.query.tanggal,
      poli_id: req.query.poli_id,
      dokter_id: req.query.dokter_id,
      status: req.query.status
    };
    const list = registrationService.getPendaftaranList(filters);
    res.json({ success: true, count: list.length, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Endpoint: Update Status Pendaftaran (Admisi / Dokter)
 * PATCH /api/pendaftaran/:id/status
 */
router.patch('/pendaftaran/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status baru wajib disertakan.' });
    }

    const updated = registrationService.updateStatusPendaftaran(id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Data pendaftaran tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Status pendaftaran #${id} berhasil diubah menjadi ${status}.`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Endpoint: Simpan Rekam Medis / Diagnosa oleh Dokter
 * POST /api/rekam-medis
 */
router.post('/rekam-medis', (req, res) => {
  try {
    const result = registrationService.simpanRekamMedis(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Endpoint: Ambil Antrean Cepat Mesin Kiosk Lobi (1-Klik)
 * POST /api/antrean/kiosk
 */
router.post('/antrean/kiosk', (req, res) => {
  try {
    const { poliId, jenisPenjamin } = req.body;
    const result = registrationService.registerKioskWalkIn(poliId, jenisPenjamin);
    res.status(201).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

/**
 * Endpoint: Verifikasi QR Code / Barcode / Kode Booking di Loket Admisi
 * POST /api/pendaftaran/verifikasi-qr
 */
router.post('/pendaftaran/verifikasi-qr', (req, res) => {
  try {
    const { code } = req.body;
    const result = registrationService.verifyQrOrCode(code);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

/**
 * Endpoint: Riwayat Rekam Medis Pasien
 * GET /api/rekam-medis/:nomorRM
 */
router.get('/rekam-medis/:nomorRM', (req, res) => {
  try {
    const { nomorRM } = req.params;
    const records = registrationService.getRiwayatRekamMedisByRM(nomorRM);
    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
