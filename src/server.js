const express = require('express');
const cors = require('cors');
const path = require('node:path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging sederhana untuk request
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    app: 'Smart Patient Registration - RS Politeknik LP3I Jakarta',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Mount API Routes
app.use('/api', apiRoutes);

// Static Web Frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback jika route client tidak ditemukan
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ success: false, message: 'API Endpoint tidak ditemukan.' });
  }
});

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` SMART PATIENT REGISTRATION - RS POLITEKNIK LP3I JAKARTA`);
    console.log(` Server berjalan aktif pada port: ${PORT}`);
    console.log(` Akses Aplikasi Web: http://localhost:${PORT}`);
    console.log(` Endpoint API:       http://localhost:${PORT}/api/health`);
    console.log(`================================================================`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Menutup server dengan aman (Graceful Shutdown)...');
    server.close(() => {
      console.log('Server berhasil dinonaktifkan.');
      process.exit(0);
    });
  });
}

module.exports = app;
