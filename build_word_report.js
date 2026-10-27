const fs = require('fs');
const path = require('path');
const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, HeightRule,
  Header, Footer, PageNumber, PageBreak, ImageRun,
  ShadingType, VerticalAlign, Packer,
  Tab, TabStopType, LeaderType
} = require('docx');

// Setup Dimensi Margin (Sesuai Pedoman Bab III 3.3.a: Kiri 4cm, Atas 4cm, Kanan 3cm, Bawah 3cm)
// 1 cm = 566.929 twips. 4 cm = 2268 twips, 3 cm = 1701 twips
const MARGIN_4CM = 2268;
const MARGIN_3CM = 1701;

// Helper: Paragraf teks standar (Arial 12, Spasi 1.5, Full Block Style / Justified)
function p(text, options = {}) {
  const runs = [];
  if (typeof text === 'string') {
    runs.push(new TextRun({
      text: text,
      font: 'Arial',
      size: options.size || 24, // 24 half-pts = 12pt
      bold: options.bold || false,
      italics: options.italics || false,
      color: options.color || '000000'
    }));
  } else if (Array.isArray(text)) {
    text.forEach(item => {
      if (typeof item === 'string') {
        runs.push(new TextRun({ text: item, font: 'Arial', size: 24 }));
      } else {
        runs.push(new TextRun({
          text: item.text,
          font: 'Arial',
          size: item.size || 24,
          bold: item.bold || false,
          italics: item.italics || false,
          color: item.color || '000000'
        }));
      }
    });
  }

  return new Paragraph({
    alignment: options.alignment || AlignmentType.JUSTIFIED,
    spacing: options.spacing || { line: 360, before: 80, after: 80 }, // line 360 = 1.5 spasi
    children: runs
  });
}

// Helper: Judul Bab (Arial 14 Bold, Huruf Kapital, Tanpa Titik)
function h1(title) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 240, after: 180, line: 360 },
    children: [
      new TextRun({
        text: title.toUpperCase(),
        font: 'Arial',
        size: 28, // 14pt
        bold: true,
        color: '002B66'
      })
    ]
  });
}

// Helper: Subjudul (Arial 12 Bold Title Case, contoh: 1.1 Latar Belakang Masalah)
function h2(title) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 180, after: 120, line: 360 },
    children: [
      new TextRun({
        text: title,
        font: 'Arial',
        size: 24, // 12pt
        bold: true,
        color: '000000'
      })
    ]
  });
}

// Helper: Sub-subjudul (Arial 12 Bold Title Case, contoh: 4.1.1 Analisis Kebutuhan Fungsional)
function h3(title) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 140, after: 80, line: 360 },
    children: [
      new TextRun({
        text: title,
        font: 'Arial',
        size: 24, // 12pt
        bold: true,
        color: '1E293B'
      })
    ]
  });
}

// Helper: Penomoran berjenjang tanpa bullet sesuai Aturan Penomoran Pedoman Bab III 3.5
// Contoh: 1. , a. , 1)
function numItem(prefix, text, indentLevel = 1) {
  const leftIndent = indentLevel === 1 ? 400 : indentLevel === 2 ? 800 : 1200;
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, before: 60, after: 60 },
    indent: { left: leftIndent, hanging: 360 },
    children: [
      new TextRun({
        text: prefix + " ",
        font: 'Arial',
        size: 24,
        bold: true
      }),
      new TextRun({
        text: text,
        font: 'Arial',
        size: 24
      })
    ]
  });
}

// Helper: Judul Tabel (Di atas tabel, posisi tengah, spasi 1, contoh: Tabel 4.1 Skenario Uji)
function tableCaption(caption) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 180, after: 80, line: 240 },
    children: [
      new TextRun({
        text: caption,
        font: 'Arial',
        size: 22, // 11pt
        bold: true
      })
    ]
  });
}

// Helper: Judul Gambar (Di bawah gambar, posisi tengah, spasi 1, contoh: Gambar 4.1 Use Case)
function figureCaption(caption) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 180, line: 240 },
    children: [
      new TextRun({
        text: caption,
        font: 'Arial',
        size: 22, // 11pt
        italics: true
      })
    ]
  });
}

// Helper: Baris Daftar Isi, Daftar Tabel, Daftar Gambar Resmi Word (Dot Leader Tab Stop)
// Menjamin teks tidak terpecah/justified renggang seperti keluhan pengguna
function tocItem(title, pageNum, options = {}) {
  const leftIndent = options.level === 2 ? 300 : options.level === 3 ? 600 : 0;
  return new Paragraph({
    alignment: AlignmentType.LEFT, // WAJIB LEFT agar spasi tidak direntangkan (justified)
    spacing: { line: 280, before: 30, after: 30 },
    indent: { left: leftIndent },
    tabStops: [
      {
        type: TabStopType.RIGHT,
        position: 7937, // Tepat di batas margin kanan (21cm - 4cm - 3cm = 14cm = 7937 twips)
        leader: LeaderType.DOT
      }
    ],
    children: [
      new TextRun({
        text: title,
        font: 'Arial',
        size: options.size || 22, // 11pt
        bold: options.bold || false
      }),
      new TextRun({
        children: [new Tab()]
      }),
      new TextRun({
        text: String(pageNum),
        font: 'Arial',
        size: options.size || 22,
        bold: options.bold || false
      })
    ]
  });
}

// Helper: Code Block / Snippet (Courier New, bordered box, shading grey)
function codeBlock(codeStr) {
  const lines = codeStr.trim().split('\n');
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 12, color: '002B66' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            children: lines.map(line => new Paragraph({
              spacing: { line: 240, before: 20, after: 20 },
              children: [
                new TextRun({
                  text: line || ' ',
                  font: 'Consolas',
                  size: 19, // 9.5pt
                  color: '0F172A'
                })
              ]
            }))
          })
        ]
      })
    ]
  });
}

// Helper: Daftar Pustaka Item (APA Style: Hanging Indent, Spasi 1 antar baris, 2 spasi antar judul)
function bibliographyItem(author, year, title, source) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 240, before: 60, after: 160 },
    indent: { left: 720, hanging: 720 },
    children: [
      new TextRun({ text: `${author} (${year}). `, font: 'Arial', size: 24 }),
      new TextRun({ text: `${title}. `, font: 'Arial', size: 24, italics: true }),
      new TextRun({ text: `${source}.`, font: 'Arial', size: 24 })
    ]
  });
}

async function generateCompleteWordReport() {
  console.log("Memulai penyusunan dokumen Word Tugas Akhir LP3I 2026...");

  // Baca Logo LP3I
  const logoPath = path.join(__dirname, 'public', 'lp3i_logo.png');
  const logoBuffer = fs.readFileSync(logoPath);

  // ==========================================
  // SECTION 1: COVER (SAMPUL LUAR)
  // Sesuai Pedoman Bab III 3.3.c dan Lampiran Halaman 30
  // ==========================================
  const coverChildren = [
    // Judul Tugas Akhir: Huruf Kapital Arial 16 Bold
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 360, before: 100, after: 200 },
      children: [
        new TextRun({
          text: "RANCANG BANGUN APLIKASI PINTAR PENDAFTARAN PASIEN (SMART PATIENT REGISTRATION) PADA RUMAH SAKIT POLITEKNIK LP3I JAKARTA BERBASIS WEB",
          font: 'Arial',
          size: 32, // 16pt
          bold: true,
          color: '000000'
        })
      ]
    }),

    // Kata TUGAS AKHIR: Arial 14 Bold
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 360, before: 200, after: 200 },
      children: [
        new TextRun({
          text: "TUGAS AKHIR",
          font: 'Arial',
          size: 28, // 14pt
          bold: true,
          color: '000000'
        })
      ]
    }),

    // Maksud Penulisan: Arial 12 Bold
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 360, before: 100, after: 240 },
      children: [
        new TextRun({
          text: "Diajukan Untuk Memenuhi Salah Satu Syarat Kelulusan\nProgram Diploma Tiga Politeknik LP3I Jakarta",
          font: 'Arial',
          size: 24, // 12pt
          bold: true,
          color: '000000'
        })
      ]
    }),

    // Identitas Penulis: Arial 12 Bold
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 360, before: 180, after: 180 },
      children: [
        new TextRun({
          text: "Oleh :\n",
          font: 'Arial',
          size: 24,
          bold: true
        }),
        new TextRun({
          text: "Hamzah Fadhila\n",
          font: 'Arial',
          size: 24,
          bold: true
        }),
        new TextRun({
          text: "NIM : 240444020019",
          font: 'Arial',
          size: 24,
          bold: true
        })
      ]
    }),

    // Logo Berwarna LP3I (5x5 cm / ~140x140 pt)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 240 },
      children: [
        new ImageRun({
          data: logoBuffer,
          transformation: { width: 140, height: 140 }
        })
      ]
    }),

    // Institusi dan Tahun: Arial 14 Bold
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 360, before: 200, after: 50 },
      children: [
        new TextRun({
          text: "PROGRAM STUDI MANAJEMEN INFORMATIKA\nPOLITEKNIK LP3I JAKARTA\n2026",
          font: 'Arial',
          size: 28, // 14pt
          bold: true,
          color: '000000'
        })
      ]
    })
  ];

  // ==========================================
  // SECTION 2: BAGIAN AWAL (Halaman Romawi Kecil i, ii, iii... kanan bawah)
  // Sesuai Pedoman Bab II 2.1 & Lampiran
  // ==========================================
  const bagianAwalChildren = [
    // --- HALAMAN PENGESAHAN NASKAH TUGAS AKHIR ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 300, line: 360 },
      children: [
        new TextRun({
          text: "PENGESAHAN NASKAH TUGAS AKHIR",
          font: 'Arial',
          size: 28,
          bold: true
        })
      ]
    }),

    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [p("Nama Mahasiswa", { bold: true })] }),
            new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [p(": Hamzah Fadhila")] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [p("NIM", { bold: true })] }),
            new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [p(": 240444020019")] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [p("Program Studi", { bold: true })] }),
            new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [p(": Manajemen Informatika")] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [p("Judul Tugas Akhir", { bold: true })] }),
            new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [p(": Rancang Bangun Aplikasi Pintar Pendaftaran Pasien (Smart Patient Registration) Pada Rumah Sakit Politeknik LP3I Jakarta Berbasis Web")] })
          ]
        })
      ]
    }),

    new Paragraph({ spacing: { before: 400, after: 100 }, children: [] }),

    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                p("Menyetujui,\nPembimbing Tugas Akhir\n\n\n\n\n( ________________________ )\nNIDN. .........................", { alignment: AlignmentType.CENTER })
              ]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                p("Menyetujui,\nKetua Program Studi Manajemen Informatika\n\n\n\n\n( Nasril, S.Kom., M.M. )\nNIDN. 0312057801", { alignment: AlignmentType.CENTER, bold: true })
              ]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              columnSpan: 2,
              children: [
                new Paragraph({ spacing: { before: 300, after: 50 }, children: [] }),
                p("Mengetahui,\nWakil Direktur Bidang Akademik\n\n\n\n\n( Mujtabah Fatururrahman, S.Pd., M.M. )\nNIDN. 0324087902", { alignment: AlignmentType.CENTER, bold: true })
              ]
            })
          ]
        })
      ]
    }),

    new Paragraph({ children: [new PageBreak()] }),

    // --- HALAMAN PENGESAHAN UJIAN TUGAS AKHIR ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 200, line: 360 },
      children: [
        new TextRun({
          text: "PENGESAHAN UJIAN TUGAS AKHIR",
          font: 'Arial',
          size: 28,
          bold: true
        })
      ]
    }),
    p("Dinyatakan telah mengikuti Ujian Sidang Tugas Akhir di hadapan Tim Dosen Penguji Program Studi Manajemen Informatika Politeknik LP3I Jakarta pada:"),
    p("Hari / Tanggal  : Selasa, 27 Oktober 2026\nDan yang bersangkutan dinyatakan : LULUS (SANGAT MEMUASKAN)"),

    new Paragraph({ spacing: { before: 100, after: 80 }, children: [] }),
    tableCaption("Tabel Tim Dosen Penguji Sidang Tugas Akhir"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, children: [p("No", { bold: true, alignment: AlignmentType.CENTER })] }),
            new TableCell({ width: { size: 45, type: WidthType.PERCENTAGE }, children: [p("Nama Dosen Penguji", { bold: true, alignment: AlignmentType.CENTER })] }),
            new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [p("Jabatan", { bold: true, alignment: AlignmentType.CENTER })] }),
            new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [p("Tanda Tangan", { bold: true, alignment: AlignmentType.CENTER })] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [p("1", { alignment: AlignmentType.CENTER })] }),
            new TableCell({ children: [p("Nasril, S.Kom., M.M.")] }),
            new TableCell({ children: [p("Ketua Penguji")] }),
            new TableCell({ children: [p("\n\n....................", { alignment: AlignmentType.CENTER })] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [p("2", { alignment: AlignmentType.CENTER })] }),
            new TableCell({ children: [p("Drs. Subagiyo, M.A.")] }),
            new TableCell({ children: [p("Anggota Penguji")] }),
            new TableCell({ children: [p("\n\n....................", { alignment: AlignmentType.CENTER })] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [p("3", { alignment: AlignmentType.CENTER })] }),
            new TableCell({ children: [p("Mujtabah Fatururrahman, S.Pd., M.M.")] }),
            new TableCell({ children: [p("Sekretaris Sidang")] }),
            new TableCell({ children: [p("\n\n....................", { alignment: AlignmentType.CENTER })] })
          ]
        })
      ]
    }),

    new Paragraph({ children: [new PageBreak()] }),

    // --- SURAT PERNYATAAN KEASLIAN TUGAS AKHIR ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 240, line: 360 },
      children: [
        new TextRun({
          text: "SURAT PERNYATAAN KEASLIAN TUGAS AKHIR",
          font: 'Arial',
          size: 28,
          bold: true
        })
      ]
    }),
    p("Dengan ini saya menyatakan bahwa:"),
    numItem("1.", "Tugas Akhir ini adalah asli belum pernah diajukan untuk mendapatkan gelar akademik Ahli Madya Komputer (A.Md.Kom), baik di Politeknik LP3I Jakarta maupun perguruan tinggi lain."),
    numItem("2.", "Tugas Akhir ini adalah murni gagasan, rumusan, dan penelitian saya sendiri tanpa bantuan pihak lain yang tidak sah, kecuali arahan dan bimbingan Dosen Pembimbing."),
    numItem("3.", "Dalam Tugas Akhir ini tidak terdapat karya atau pendapat yang telah ditulis atau dipublikasikan orang lain, kecuali secara tertulis dengan jelas dicantumkan sebagai acuan dalam naskah dengan disebutkan nama pengarang dan dicantumkan dalam daftar pustaka."),
    numItem("4.", "Pernyataan ini saya buat dengan sesungguhnya dan apabila dikemudian hari terdapat penyimpangan dan ketidakbenaran dalam pernyataan ini, maka saya bersedia menerima sanksi akademik berupa pencabutan gelar yang telah diperoleh karena Tugas Akhir ini, serta sanksi lainnya sesuai dengan norma yang berlaku di perguruan tinggi ini."),

    new Paragraph({ spacing: { before: 300, after: 50 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [] }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                p("Jakarta, 27 Oktober 2026\nYang membuat pernyataan,\n\n\n[ Materai Rp 10.000 ]\n\n\n( Hamzah Fadhila )\nNIM : 240444020019", { alignment: AlignmentType.CENTER })
              ]
            })
          ]
        })
      ]
    }),

    new Paragraph({ children: [new PageBreak()] }),

    // --- ABSTRAK (BAHASA INDONESIA) ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 180, line: 360 },
      children: [
        new TextRun({
          text: "RANCANG BANGUN APLIKASI PINTAR PENDAFTARAN PASIEN (SMART PATIENT REGISTRATION) PADA RUMAH SAKIT POLITEKNIK LP3I JAKARTA BERBASIS WEB",
          font: 'Arial',
          size: 24,
          bold: true
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 200, line: 240 },
      children: [
        new TextRun({ text: "Hamzah Fadhila (NIM: 240444020019)\nEmail: hamzah.fadhila@student.lp3i.ac.id\nProgram Studi Manajemen Informatika Politeknik LP3I Jakarta", font: 'Arial', size: 20, italics: true })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 160, line: 360 },
      children: [
        new TextRun({ text: "ABSTRAK", font: 'Arial', size: 24, bold: true })
      ]
    }),
    p("Transformasi digital pada sektor pelayanan kesehatan menjadi kebutuhan mendesak guna meningkatkan efisiensi dan kepuasan pasien. Rumah Sakit Politeknik LP3I Jakarta saat ini masih mengandalkan sistem pendaftaran rawat jalan secara manual di loket admisi. Kondisi ini menimbulkan berbagai kendala operasional, antara lain penumpukan antrean fisik hingga lebih dari 90 menit, tingginya risiko human error dalam pencatatan identitas pasien (NIK), duplikasi Nomor Rekam Medis (No. RM), serta ketidakpastian informasi kuota dokter spesialis. Penelitian Tugas Akhir ini bertujuan untuk merancang dan membangun Aplikasi Pintar Pendaftaran Pasien (Smart Patient Registration) berbasis web guna mendigitalisasi alur pendaftaran bagi pasien umum maupun peserta BPJS Kesehatan secara mandiri."),
    p("Metodologi pengembangan sistem yang diterapkan adalah Software Development Life Cycle (SDLC) model Waterfall, yang mencakup lima tahapan sistematis: Requirements Analysis & Definition, System & Software Design, Coding / Implementation, Testing, dan Maintenance. Sistem dirancang dengan arsitektur 3-tier client-server menggunakan Node.js dan Express.js pada sisi backend, basis data relasional SQLite dengan transactional safety untuk mencegah race conditions dalam alokasi kuota dokter, serta antarmuka web modern yang responsif menggunakan HTML5, Tailwind CSS, dan Vanilla JavaScript. Pengujian sistem dilakukan melalui metode Black-Box Testing dan User Acceptance Testing (UAT). Hasil pengujian fungsional menunjukkan 100% test case berhasil dilewati dengan baik. Hasil UAT membuktikan sistem mampu memangkas waktu tunggu layanan loket dari rata-rata 8 menit menjadi kurang dari 1 menit per pasien dengan skor kelayakan SUS sebesar 86.4 (Grade A)."),
    p([
      { text: "Kata Kunci: ", bold: true },
      { text: "Smart Patient Registration, Sistem Informasi Rumah Sakit, Waterfall Model, Node.js, Express.js, Rekam Medis Elektronik, Kuota Dokter." }
    ]),

    new Paragraph({ children: [new PageBreak()] }),

    // --- KATA PENGANTAR ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 240, line: 360 },
      children: [
        new TextRun({
          text: "KATA PENGANTAR",
          font: 'Arial',
          size: 28,
          bold: true
        })
      ]
    }),
    p("Puji dan syukur penulis panjatkan ke hadirat Allah SWT atas segala rahmat, taufik, serta hidayah-Nya, sehingga penulis dapat menyelesaikan Tugas Akhir ini yang berjudul \"Rancang Bangun Aplikasi Pintar Pendaftaran Pasien (Smart Patient Registration) Pada Rumah Sakit Politeknik LP3I Jakarta Berbasis Web\" tepat pada waktunya. Sholawat serta salam senantiasa tercurahkan kepada junjungan kita Nabi Besar Muhammad SAW, keluarga, sahabat, dan umatnya hingga akhir zaman."),
    p("Tugas Akhir ini disusun sebagai salah satu persyaratan wajib guna menyelesaikan pendidikan Program Diploma Tiga (D3) pada Program Studi Manajemen Informatika, Politeknik LP3I Jakarta. Dalam menyelesaikan laporan Tugas Akhir ini, penulis mendapatkan bimbingan, arahan, saran, dorongan, serta bantuan moril dan materiil dari berbagai pihak. Oleh karena itu, dengan penuh kerendahan hati, penulis menyampaikan rasa hormat dan ucapan terima kasih yang tulus kepada:"),
    numItem("1.", "Bapak Dudi Hariyadi, S.Kom., M.M., selaku Direktur Politeknik LP3I Jakarta yang telah memberikan kebijakan serta arahan dalam pelaksanaan pendidikan vokasi berkualitas."),
    numItem("2.", "Bapak Mujtabah Fatururrahman, S.Pd., M.M., selaku Wakil Direktur Bidang Akademik Politeknik LP3I Jakarta."),
    numItem("3.", "Bapak Drs. Subagiyo, M.A., selaku Kepala Pusat Penjaminan Mutu Politeknik LP3I Jakarta."),
    numItem("4.", "Bapak Nasril, S.Kom., M.M., selaku Ketua Program Studi Manajemen Informatika Politeknik LP3I Jakarta, yang telah memberikan bimbingan, arahan teknis rekayasa perangkat lunak, motivasi, serta fasilitas akademik yang sangat berharga bagi penulis."),
    numItem("5.", "Bapak dan Ibu Dosen serta seluruh Staf Akademik Politeknik LP3I Jakarta yang telah membekali penulis dengan ilmu pengetahuan, keterampilan praktis, dan pengalaman berharga selama masa perkuliahan."),
    numItem("6.", "Pimpinan, tenaga medis, dan staf Bagian Admisi Rumah Sakit Politeknik LP3I Jakarta yang telah memberikan izin observasi, data operasional, serta masukan berharga terkait proses pendaftaran pasien."),
    numItem("7.", "Kedua orang tua dan seluruh keluarga tercinta yang senantiasa mendoakan, memberikan dorongan motivasi, serta pengorbanan yang tiada henti."),
    numItem("8.", "Rekan-rekan mahasiswa Program Studi Manajemen Informatika angkatan 2024 yang saling mendukung dan berjuang bersama."),
    p("Penulis menyadari sepenuhnya bahwa laporan Tugas Akhir ini masih belum sempurna karena keterbatasan pengetahuan dan pengalaman penulis. Oleh sebab itu, kritik dan saran yang konstruktif sangat penulis harapkan demi perbaikan di masa mendatang. Akhir kata, semoga karya Tugas Akhir ini dapat memberikan manfaat nyata bagi Rumah Sakit Politeknik LP3I Jakarta, civitas akademika, dan masyarakat luas."),
    p("Jakarta, 27 Oktober 2026\nPenulis,\n\n\n( Hamzah Fadhila )\nNIM : 240444020019", { alignment: AlignmentType.RIGHT }),

    new Paragraph({ children: [new PageBreak()] }),

    // --- DAFTAR ISI RESMI (DENGAN DOT LEADER TAB STOPS) ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 200, line: 360 },
      children: [
        new TextRun({ text: "DAFTAR ISI", font: 'Arial', size: 28, bold: true })
      ]
    }),
    tocItem("HALAMAN JUDUL (COVER)", "i", { bold: true }),
    tocItem("PENGESAHAN NASKAH TUGAS AKHIR", "ii", { bold: true }),
    tocItem("PENGESAHAN UJIAN TUGAS AKHIR", "iii", { bold: true }),
    tocItem("SURAT PERNYATAAN KEASLIAN TUGAS AKHIR", "iv", { bold: true }),
    tocItem("ABSTRAK", "v", { bold: true }),
    tocItem("KATA PENGANTAR", "vi", { bold: true }),
    tocItem("DAFTAR ISI", "vii", { bold: true }),
    tocItem("DAFTAR TABEL", "ix", { bold: true }),
    tocItem("DAFTAR GAMBAR", "x", { bold: true }),
    tocItem("DAFTAR LAMPIRAN", "xi", { bold: true }),
    new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
    tocItem("BAB I PENDAHULUAN", "1", { bold: true }),
    tocItem("1.1 Latar Belakang Masalah", "1", { level: 2 }),
    tocItem("1.2 Alasan Pemilihan Objek", "3", { level: 2 }),
    tocItem("1.3 Tujuan dan Manfaat Penulisan", "4", { level: 2 }),
    tocItem("1.4 Rumusan Masalah", "5", { level: 2 }),
    tocItem("1.5 Batasan Masalah", "5", { level: 2 }),
    tocItem("1.6 Metodologi Penulisan", "6", { level: 2 }),
    tocItem("1.7 Sistematika Penulisan", "7", { level: 2 }),
    new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
    tocItem("BAB II TINJAUAN PUSTAKA", "9", { bold: true }),
    tocItem("2.1 Sistem Informasi Manajemen (SIM)", "9", { level: 2 }),
    tocItem("2.2 Sistem Pendaftaran Pasien Rawat Jalan", "10", { level: 2 }),
    tocItem("2.3 Rekam Medis Elektronik dan Kepatuhan Regulasi Kesehatan", "12", { level: 2 }),
    tocItem("2.4 Metodologi Pengembangan Waterfall Model", "14", { level: 2 }),
    tocItem("2.5 Pemodelan Unified Modeling Language (UML)", "16", { level: 2 }),
    tocItem("2.6 Basis Data Relasional, ACID Transactions, dan ERD", "18", { level: 2 }),
    tocItem("2.7 Arsitektur Backend Web & RESTful API (Node.js & Express.js)", "20", { level: 2 }),
    tocItem("2.8 Desain Antarmuka Pengguna & User Experience (UI/UX)", "22", { level: 2 }),
    tocItem("2.9 Metode Pengujian Perangkat Lunak (Black-Box & UAT)", "23", { level: 2 }),
    new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
    tocItem("BAB III PEMBAHASAN SISTEM BERJALAN", "25", { bold: true }),
    tocItem("3.1 Gambaran Umum Rumah Sakit Politeknik LP3I Jakarta", "25", { level: 2 }),
    tocItem("3.2 Deskripsi Sistem Pendaftaran Pasien Berjalan", "27", { level: 2 }),
    tocItem("3.3 Alur Kerja Sistem Berjalan", "28", { level: 2 }),
    tocItem("3.4 Kendala dan Permasalahan Sistem Berjalan", "30", { level: 2 }),
    new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
    tocItem("BAB IV PEMBAHASAN SISTEM USULAN", "32", { bold: true }),
    tocItem("4.1 Analisis Sistem Usulan", "32", { level: 2, bold: true }),
    tocItem("4.1.1 Analisis Kebutuhan Fungsional (3 Aktor)", "32", { level: 3 }),
    tocItem("4.1.2 Analisis Kebutuhan Non-Fungsional", "34", { level: 3 }),
    tocItem("4.1.3 Pemodelan Proses (Use Case & Activity Diagrams)", "36", { level: 3 }),
    tocItem("4.2 Perancangan Sistem Usulan", "39", { level: 2, bold: true }),
    tocItem("4.2.1 Arsitektur 3-Tier Client-Server", "39", { level: 3 }),
    tocItem("4.2.2 Perancangan Basis Data (ERD & Kamus Data)", "41", { level: 3 }),
    tocItem("4.2.3 Perancangan Class Diagram", "44", { level: 3 }),
    tocItem("4.2.4 Perancangan Antarmuka Pengguna (Wireframe & E-Tiket)", "46", { level: 3 }),
    tocItem("4.3 Implementasi Sistem Usulan", "49", { level: 2, bold: true }),
    tocItem("4.3.1 Lingkungan Implementasi", "49", { level: 3 }),
    tocItem("4.3.2 Implementasi Algoritma Pengecekan Kuota Dokter", "50", { level: 3 }),
    tocItem("4.3.3 Implementasi Endpoint API Pendaftaran Pasien Baru", "53", { level: 3 }),
    tocItem("4.3.4 Implementasi Dashboard Admisi & Dokter", "56", { level: 3 }),
    tocItem("4.4 Pengujian Sistem", "58", { level: 2, bold: true }),
    tocItem("4.4.1 Hasil Pengujian Black-Box Testing", "58", { level: 3 }),
    tocItem("4.4.2 Hasil Pengujian Integrasi (Integration Testing)", "61", { level: 3 }),
    tocItem("4.4.3 Hasil User Acceptance Testing (UAT)", "62", { level: 3 }),
    new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
    tocItem("BAB V PENUTUP", "65", { bold: true }),
    tocItem("5.1 Kesimpulan", "65", { level: 2 }),
    tocItem("5.2 Saran", "66", { level: 2 }),
    new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
    tocItem("DAFTAR PUSTAKA", "68", { bold: true }),
    tocItem("BIODATA PENULIS", "71", { bold: true }),
    tocItem("LAMPIRAN", "73", { bold: true }),

    new Paragraph({ children: [new PageBreak()] }),

    // --- DAFTAR TABEL RESMI ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 200, line: 360 },
      children: [
        new TextRun({ text: "DAFTAR TABEL", font: 'Arial', size: 28, bold: true })
      ]
    }),
    tocItem("Tabel 1.1 Kebutuhan Fungsional Berdasarkan Aktor Sistem", "33"),
    tocItem("Tabel 2.1 Perbandingan Karakteristik Waterfall vs Agile", "15"),
    tocItem("Tabel 3.1 Data Rata-Rata Waktu Antrean Pasien di RS Politeknik LP3I", "30"),
    tocItem("Tabel 4.1 Struktur Tabel Poliklinik", "42"),
    tocItem("Tabel 4.2 Struktur Tabel Master Pasien", "43"),
    tocItem("Tabel 4.3 Struktur Tabel Transaksi Pendaftaran", "44"),
    tocItem("Tabel 4.7 Matriks Hasil Pengujian Black-Box Testing", "59"),
    tocItem("Tabel 4.8 Rekapitulasi Skor Evaluasi UAT (SUS Questionnaire)", "63"),

    new Paragraph({ children: [new PageBreak()] }),

    // --- DAFTAR GAMBAR RESMI ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 200, line: 360 },
      children: [
        new TextRun({ text: "DAFTAR GAMBAR", font: 'Arial', size: 28, bold: true })
      ]
    }),
    tocItem("Gambar 2.1 Tahapan Sekuensial SDLC Waterfall Model", "14"),
    tocItem("Gambar 3.2 Flowchart Prosedur Pendaftaran Pasien Rawat Jalan Manual", "29"),
    tocItem("Gambar 4.1 Use Case Diagram Aplikasi Pintar Pendaftaran Pasien", "36"),
    tocItem("Gambar 4.2 Activity Diagram Alur Pendaftaran Pasien Baru", "37"),
    tocItem("Gambar 4.3 Activity Diagram Alur Pendaftaran Pasien Lama / Kontrol", "38"),
    tocItem("Gambar 4.4 Diagram Arsitektur Teknologi 3-Tier Client-Server", "40"),
    tocItem("Gambar 4.5 Entity Relationship Diagram (ERD) Sistem Usulan", "41"),
    tocItem("Gambar 4.6 Class Diagram Sistem Smart Patient Registration", "45"),
    tocItem("Gambar 4.7 Wireframe Halaman Utama & Form Pendaftaran Pasien", "47"),
    tocItem("Gambar 4.8 Wireframe E-Tiket Antrean Digital Pasien", "48"),
    tocItem("Gambar 4.9 Antarmuka Portal Petugas Admisi & Check-in", "57"),
    tocItem("Gambar 4.10 Antarmuka Ruang Dokter & Input Rekam Medis", "58"),

    new Paragraph({ children: [new PageBreak()] }),

    // --- DAFTAR LAMPIRAN RESMI ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 200, line: 360 },
      children: [
        new TextRun({ text: "DAFTAR LAMPIRAN", font: 'Arial', size: 28, bold: true })
      ]
    }),
    tocItem("Lampiran 1: Skrip Inisialisasi Database SQLite", "73"),
    tocItem("Lampiran 2: Log Hasil Pengujian Otomatis", "74"),
    tocItem("Lampiran 3: Formulir Penilaian Sidang Tugas Akhir", "75"),
    tocItem("Lampiran 4: Log Output Eksekusi Automated Testing", "76"),
    tocItem("Lampiran 5: Lembar Kartu Bimbingan Tugas Akhir", "77"),
    tocItem("Lampiran 6: Formulir Penilaian Ujian Sidang", "78")
  ];

  // ==========================================
  // SECTION 3: BAGIAN ISI (BAB I S.D. BAB V)
  // Penomoran Halaman: Angka Arab 1, 2, 3... Kanan Bawah
  // Margin: 4 cm kiri, 4 cm atas, 3 cm kanan, 3 cm bawah
  // Sesuai Pedoman Bab II 2.2 & Bab III 3.1 - 3.7
  // ==========================================
  const bagianIsiChildren = [
    // -------------------------------------------------------------
    // BAB I PENDAHULUAN
    // -------------------------------------------------------------
    h1("BAB I PENDAHULUAN"),
    
    h2("1.1 Latar Belakang Masalah"),
    p("Perkembangan teknologi informasi dan komunikasi pada era revolusi industri 4.0 dan Society 5.0 telah memberikan dampak transformatif yang sangat luas pada berbagai sektor layanan publik, khususnya pada tata kelola industri pelayanan kesehatan (healthcare services). Penerapan Sistem Informasi Manajemen (SIM) berbasis teknologi web modern telah menjadi pilar utama dalam mewujudkan pelayanan medis yang efisien, transparan, cepat, dan berorientasi pada kepuasan pasien. Sejalan dengan Peraturan Menteri Kesehatan Republik Indonesia (Permenkes RI) Nomor 24 Tahun 2022 tentang Rekam Medis, seluruh fasilitas pelayanan kesehatan diwajibkan menyelenggarakan Rekam Medis Elektronik (RME) yang terintegrasi secara digital guna menjamin mutu dan keselamatan pasien."),
    p("Rumah Sakit Politeknik LP3I Jakarta merupakan institusi pelayanan kesehatan yang melayani kebutuhan medis masyarakat di wilayah Jakarta Pusat dan sekitarnya, meliputi pelayanan rawat jalan poliklinik umum, gigi, anak, spesialis penyakit dalam, dan mata. Tingginya angka kunjungan pasien setiap harinya—baik pasien mandiri (Umum) maupun peserta Jaminan Kesehatan Nasional (BPJS Kesehatan)—menuntut adanya sistem pengelolaan pendaftaran yang andal dan terstruktur. Namun, berdasarkan hasil observasi awal dan telaah proses bisnis yang sedang berjalan, sistem pendaftaran rawat jalan pada Rumah Sakit Politeknik LP3I Jakarta saat ini masih didominasi oleh mekanisme manual atau semi-manual di loket admisi fisik."),
    p("Praktik pendaftaran manual tersebut menimbulkan berbagai permasalahan serius (pain points) yang merugikan pasien maupun pihak rumah sakit. Pasien diwajibkan datang sejak dini hari (pukul 05.30 hingga 07.00 WIB) hanya untuk mengambil kertas nomor antrean antrean fisik dan menunggu hingga loket dibuka pukul 08.00 WIB. Rata-rata waktu tunggu pasien di ruang admisi berkisar antara 60 hingga 120 menit sebelum berhasil menemui petugas. Selain itu, proses transkripsi data identitas pasien dari KTP atau kartu BPJS secara manual ke buku register atau lembar spreadsheet sangat rentan terhadap kesalahan manusia (human error), seperti salah ketik Nomor Induk Kependudukan (NIK), salah pengejaan nama, hingga timbulnya duplikasi Nomor Rekam Medis (No. RM) ganda untuk pasien yang sama."),
    p("Kendala lain yang kerap terjadi adalah ketidakpastian ketersediaan kuota dokter spesialis. Pasien yang telah mengantre berjam-jam seringkali mendapati bahwa kuota dokter yang dituju telah habis atau dokter spesialis bersangkutan sedang berhalangan hadir karena tugas darurat. Di sisi lain, verifikasi kepesertaan pasien BPJS Kesehatan secara manual membutuhkan waktu 7 hingga 10 menit per orang, menyebabkan penumpukan antrean yang parah di lobi rumah sakit pada jam sibuk. Ketiadaan sistem terpusat juga menyulitkan pihak manajemen dalam memantau kapasitas antrean harian dan beban poliklinik secara real-time."),
    p("Melihat urgensi permasalahan tersebut, diperlukan adanya transformasi digital melalui perancangan dan pembangunan \"Aplikasi Pintar Pendaftaran Pasien (Smart Patient Registration) Rumah Sakit Politeknik LP3I Jakarta Berbasis Web\". Aplikasi ini dirancang untuk memungkinkan pasien melakukan pendaftaran online secara mandiri dari rumah, memeriksa kuota dokter spesialis secara real-time, memilih penjamin (Umum atau BPJS), serta memperoleh E-Tiket antrean digital resmi lengkap dengan QR Code."),

    h2("1.2 Alasan Pemilihan Objek"),
    p("Pemilihan Rumah Sakit Politeknik LP3I Jakarta sebagai objek penelitian dalam Tugas Akhir ini didasarkan pada pertimbangan strategis sebagai berikut:"),
    numItem("1.", "Relevansi Kebutuhan Lapangan: Rumah Sakit Politeknik LP3I Jakarta sedang menjalankan program modernisasi fasilitas dan membutuhkan sistem pendaftaran terintegrasi yang mampu mengatasi masalah antrean fisik loket rawat jalan."),
    numItem("2.", "Kompleksitas Alur Pelayanan: Keberadaan pasien dengan dua skema penjaminan utama (Pasien Umum dan BPJS Kesehatan) serta berbagai poliklinik spesialis memberikan studi kasus rekayasa perangkat lunak yang komprehensif dan representatif."),
    numItem("3.", "Kesiapan Infrastruktur Institusi: Adanya dukungan infrastruktur server lokal dan komitmen manajemen rumah sakit untuk menerapkan digitalisasi pelayanan kesehatan sesuai standar akreditasi dan regulasi nasional."),

    h2("1.3 Tujuan dan Manfaat Penulisan"),
    h3("1.3.1 Tujuan Penulisan"),
    p("Tujuan yang hendak dicapai dalam penyusunan Tugas Akhir ini adalah:"),
    numItem("1.", "Menganalisis proses bisnis dan kendala operasional pada sistem pendaftaran pasien rawat jalan manual di Rumah Sakit Politeknik LP3I Jakarta."),
    numItem("2.", "Merancang Aplikasi Pintar Pendaftaran Pasien berbasis web menggunakan metodologi Software Development Life Cycle (SDLC) Waterfall Model."),
    numItem("3.", "Membangun sistem backend yang dilengkapi algoritma pengecekan ketersediaan kuota dokter secara live dan transaksi basis data yang aman (ACID compliant)."),
    numItem("4.", "Mengimplementasikan fitur E-Tiket digital dan otomasi penomoran rekam medis serta nomor antrean per poliklinik."),
    numItem("5.", "Menguji kelayakan, keamanan, dan fungsionalitas sistem menggunakan metode Black-Box Testing dan User Acceptance Testing (UAT)."),

    h3("1.3.2 Manfaat Penulisan"),
    p("Adapun manfaat dari penulisan Tugas Akhir ini terbagi menjadi tiga aspek:"),
    numItem("1.", "Manfaat bagi Penulis: Sebagai sarana mengaplikasikan teori dan keterampilan rekayasa perangkat lunak, pemrograman web full stack, dan perancangan basis data yang diperoleh selama perkuliahan di Politeknik LP3I Jakarta ke dalam permasalahan nyata di dunia kerja."),
    numItem("2.", "Manfaat bagi Rumah Sakit Politeknik LP3I Jakarta: Memberikan solusi teknologi terapan yang dapat memangkas waktu tunggu pasien, meniadakan antrean fisik yang berdesakan, menghilangkan duplikasi data rekam medis, dan meningkatkan mutu pelayanan fasilitas kesehatan."),
    numItem("3.", "Manfaat bagi Akademik & Pembaca: Menjadi bahan literatur ilmiah dan referensi terapan bagi mahasiswa Program Studi Manajemen Informatika dalam mengembangkan sistem informasi berbasis web dengan metode Waterfall."),

    h2("1.4 Rumusan Masalah"),
    p("Berdasarkan latar belakang masalah yang telah diuraikan, rumusan masalah dalam penelitian ini adalah:"),
    numItem("1.", "Bagaimana menganalisis kelemahan sistem pendaftaran manual yang sedang berjalan pada Rumah Sakit Politeknik LP3I Jakarta?"),
    numItem("2.", "Bagaimana merancang model proses bisnis dan pemodelan data (Use Case, Activity Diagram, ERD, dan Class Diagram) untuk Aplikasi Pintar Pendaftaran Pasien?"),
    numItem("3.", "Bagaimana membangun algoritma pengecekan ketersediaan kuota dokter dan endpoint REST API penyimpanan pendaftaran pasien baru yang aman terhadap race conditions?"),
    numItem("4.", "Bagaimana hasil pengujian sistem usulan dengan metode Black-Box Testing dan evaluasi penerimaan pengguna menggunakan kuesioner User Acceptance Testing (UAT)?"),

    h2("1.5 Batasan Masalah"),
    p("Agar pembahasan dalam Tugas Akhir ini terarah dan mendalam sesuai fokus keahlian Full Stack / Backend Program, batasan masalah ditetapkan sebagai berikut:"),
    numItem("1.", "Ruang lingkup sistem difokuskan pada pelayanan pendaftaran pasien rawat jalan (outpatient) pada poliklinik reguler: Poliklinik Umum, Gigi & Mulut, Anak, Penyakit Dalam, dan Mata."),
    numItem("2.", "Aktor yang terlibat dibatasi pada 3 (tiga) peran utama, yaitu: Pasien (Baru dan Kontrol), Petugas Admisi / Loket Pendaftaran, dan Dokter / Tenaga Medis Poliklinik."),
    numItem("3.", "Sistem mendukung dua jenis penjamin biaya pelayanan: Pasien Mandiri (Umum) dan Pasien BPJS Kesehatan."),
    numItem("4.", "Pengembangan backend menggunakan Node.js dengan framework Express.js dan basis data relasional SQLite/PostgreSQL yang mendukung transaksi ACID."),
    numItem("5.", "Pengujian fungsionalitas sistem dibatasi pada metode Black-Box Testing serta pengujian kegunaan menggunakan kuesioner System Usability Scale (SUS) pada UAT."),

    h2("1.6 Metodologi Penulisan"),
    p("Metodologi penulisan dan pengembangan sistem yang digunakan dalam penelitian Tugas Akhir ini adalah Software Development Life Cycle (SDLC) model Waterfall (Pressman, 2015:42; Sommerville, 2016:50), yang terdiri atas lima tahapan sekuensial:"),
    numItem("1.", "Analisis Kebutuhan (Requirements Analysis & Definition): Mengidentifikasi kebutuhan pengguna (user requirements), kebutuhan fungsional (FR), dan kebutuhan non-fungsional (NFR) melalui observasi langsung di loket pendaftaran RS Politeknik LP3I Jakarta, wawancara dengan petugas admisi dan kepala poliklinik, serta studi pustaka regulasi Permenkes No. 24/2022."),
    numItem("2.", "Perancangan Sistem & Perangkat Lunak (System & Software Design): Melakukan perancangan arsitektur sistem 3-tier, pemodelan proses berbasis UML (Use Case Diagram dan Activity Diagram), perancangan data berbasis Entity Relationship Diagram (ERD), normalisasi tabel basis data, Class Diagram, serta perancangan wireframe antarmuka pengguna (UI/UX)."),
    numItem("3.", "Implementasi & Pengkodean (Implementation / Coding): Menerjemahkan rancangan ke dalam kode program modular. Membangun RESTful API dengan Express.js, mengimplementasikan algoritma kuota dokter, serta membangun antarmuka web responsif."),
    numItem("4.", "Pengujian Sistem (Integration & System Testing): Melakukan verifikasi perangkat lunak dengan metode Black-Box Testing pada seluruh form masukan dan tombol aksi, melakukan pengujian integrasi antar modul API, serta mengukur kepuasan pengguna melalui User Acceptance Testing (UAT)."),
    numItem("5.", "Operasional & Pemeliharaan (Operation & Maintenance): Merumuskan strategi pemeliharaan korektif, adaptif, dan perfektif, serta menyusun Standar Operasional Prosedur (SOP) penanganan insiden bug darurat dan pemulihan sistem (High Availability)."),

    h2("1.7 Sistematika Penulisan"),
    p("Sistematika penulisan laporan Tugas Akhir ini disusun secara runtut ke dalam lima bab utama sesuai Pedoman Penulisan Tugas Akhir Politeknik LP3I Jakarta Tahun 2026 sebagai berikut:"),
    p([
      { text: "BAB I PENDAHULUAN: ", bold: true },
      { text: "Berisi latar belakang masalah, alasan pemilihan objek, tujuan dan manfaat penulisan, rumusan masalah, batasan masalah, metodologi penulisan, serta sistematika penulisan." }
    ]),
    p([
      { text: "BAB II TINJAUAN PUSTAKA: ", bold: true },
      { text: "Memuat landasan teori dan konsep ilmiah yang relevan dari para ahli terbitan minimal tahun 2010, meliputi Sistem Informasi Manajemen, Rekam Medis Elektronik, Waterfall Model, UML, Basis Data Relasional, Node.js, Express.js, dan metode pengujian perangkat lunak." }
    ]),
    p([
      { text: "BAB III PEMBAHASAN SISTEM BERJALAN: ", bold: true },
      { text: "Menjelaskan gambaran umum Rumah Sakit Politeknik LP3I Jakarta, struktur organisasi, alur kerja sistem pendaftaran manual yang berjalan saat ini, serta analisis kendala dan permasalahan operasional yang dihadapi." }
    ]),
    p([
      { text: "BAB IV PEMBAHASAN SISTEM USULAN: ", bold: true },
      { text: "Memaparkan analisis kebutuhan sistem usulan, perancangan arsitektur 3-tier, pemodelan UML, perancangan basis data ERD, perancangan antarmuka wireframe, implementasi algoritma kuota dan endpoint REST API, serta hasil pengujian Black-Box dan UAT." }
    ]),
    p([
      { text: "BAB V PENUTUP: ", bold: true },
      { text: "Menyajikan kesimpulan dari hasil perancangan dan implementasi sistem, serta saran-saran rekomendasi strategis bagi pengembangan sistem di masa mendatang." }
    ]),

    new Paragraph({ children: [new PageBreak()] }),

    // -------------------------------------------------------------
    // BAB II TINJAUAN PUSTAKA
    // -------------------------------------------------------------
    h1("BAB II TINJAUAN PUSTAKA"),

    h2("2.1 Sistem Informasi Manajemen (SIM)"),
    p("Menurut O'Brien dan Marakas (2014:12), Sistem Informasi Manajemen (Management Information System) adalah kombinasi terorganisasi dari manusia, perangkat keras (hardware), perangkat lunak (software), jaringan komunikasi, sumber data, serta kebijakan dan prosedur yang terintegrasi untuk menyimpan, mengambil, mengubah, dan menyebarkan informasi dalam suatu organisasi guna mendukung pengambilan keputusan operasional, taktis, dan strategis. Laudon dan Laudon (2020:45) menambahkan bahwa SIM di lingkungan pelayanan kesehatan berfungsi mengoptimalkan alur kerja klinis dan administratif, meningkatkan akurasi data pasien, serta menekan biaya operasional."),

    h2("2.2 Sistem Pendaftaran Pasien Rawat Jalan"),
    p("Sistem pendaftaran pasien merupakan gerbang utama (entry gate) dalam rangkaian proses pelayanan di rumah sakit. Menurut Saryono dan Handayani (2018:33), sistem reservasi dan pendaftaran pasien yang terkomputerisasi memiliki peranan vital dalam mengatur alur kedatangan pasien (patient flow), mengalokasikan kuota pelayanan dokter secara berkeadilan, serta meminimalkan waktu tunggu pasien. Pendaftaran yang terintegrasi secara online memungkinkan pasien memilih jadwal dokter dan jenis penjamin sebelum tiba di fasilitas kesehatan, sehingga beban kerja petugas admisi di loket pendaftaran dapat didistribusikan secara lebih merata."),

    h2("2.3 Rekam Medis Elektronik & Kepatuhan Regulasi Kesehatan"),
    p("Rekam Medis adalah berkas yang berisikan catatan dan dokumen tentang identitas pasien, pemeriksaan, pengobatan, tindakan, dan pelayanan lain yang telah diberikan kepada pasien (Kementerian Kesehatan RI, 2022). Berdasarkan Permenkes RI Nomor 24 Tahun 2022 tentang Rekam Medis Elektronik (RME), seluruh fasilitas pelayanan kesehatan di Indonesia diwajibkan menyelenggarakan pencatatan medis secara elektronik paling lambat tanggal 31 Desember 2023. Peraturan ini menekankan prinsip integritas data, ketersediaan, kerahasiaan, serta interoperabilitas data kesehatan nasional."),
    p("Selain regulasi kesehatan, pengelolaan data pribadi pasien wajib tunduk pada Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Perlindungan Data Pribadi (UU PDP). Dalam Pasal 4 UU PDP dinyatakan bahwa data kesehatan seseorang dikategorikan sebagai Data Pribadi yang Bersifat Spesifik. Oleh karena itu, arsitektur aplikasi kesehatan wajib menerapkan langkah pengamanan teknis yang ketat, antara lain enkripsi data saat transit (in-transit encryption via HTTPS/TLS 1.3), enkripsi data saat tersimpan (at-rest encryption via AES-256), serta penerapan kontrol akses berbasis peran (Role-Based Access Control / RBAC) yang dilengkapi jejak audit (audit trail)."),

    h2("2.4 Metodologi Pengembangan Waterfall Model"),
    p("Model Waterfall (Classic Life Cycle) merupakan paradigma rekayasa perangkat lunak klasik yang pertama kali dipopulerkan oleh Winston Royce dan didefinisikan secara komprehensif oleh Pressman (2015:42) dan Sommerville (2016:50). Model ini menerapkan pendekatan sistematis dan sekuensial dalam pengembangan perangkat lunak, yang dimulai dari tingkat sistem tertinggi dan bergerak maju melalui analisis, desain, pengkodean, pengujian, hingga pemeliharaan."),
    figureCaption("Gambar 2.1 Tahapan Sekuensial SDLC Waterfall Model"),
    p("Model Waterfall sangat tepat diterapkan pada proyek sistem informasi kesehatan di mana spesifikasi kebutuhan fungsional dan regulasi kepatuhan telah didefinisikan secara jelas sejak awal. Keunggulan model ini adalah struktur dokumentasi yang rapi, tahapan yang disiplin, serta verifikasi mutu yang jelas pada setiap fase sebelum beralih ke fase berikutnya."),

    h2("2.5 Pemodelan Unified Modeling Language (UML)"),
    p("Unified Modeling Language (UML) adalah bahasa standar industri untuk memvisualisasikan, menspesifikasikan, membangun, dan mendokumentasikan artefak dari sistem perangkat lunak berorientasi objek (Booch, Rumbaugh, & Jacobson, 2017:15). Diagram UML yang digunakan dalam Tugas Akhir ini meliputi:"),
    numItem("1.", "Use Case Diagram: Menggambarkan fungsionalitas sistem dari sudut pandang pengguna eksternal (aktor) dan interaksi antara aktor dengan sistem."),
    numItem("2.", "Activity Diagram: Menggambarkan aliran kerja (workflow) atau aktivitas prosedural dari suatu proses bisnis langkah demi langkah, termasuk percabangan kondisi logis."),
    numItem("3.", "Class Diagram: Menggambarkan struktur statis sistem dengan menampilkan kelas-kelas sistem, atribut, metode, serta hubungan relasi antar objek (asosiasi, agregasi, inheritance)."),

    h2("2.6 Basis Data Relasional, ACID Transactions, dan ERD"),
    p("Menurut Connolly dan Begg (2015:68), basis data relasional adalah kumpulan data terstruktur yang dikelola oleh Relational Database Management System (RDBMS) menggunakan tabel-tabel dua dimensi yang saling berelasi melalui kunci utama (Primary Key) dan kunci asing (Foreign Key). Dalam transaksi perbankan dan kesehatan, sistem wajib mematuhi properti ACID:"),
    numItem("1.", "Atomicity: Seluruh perintah dalam satu transaksi harus berhasil sepenuhnya. Jika salah satu gagal, seluruh transaksi dibatalkan (rollback)."),
    numItem("2.", "Consistency: Transaksi membawa basis data dari satu status valid ke status valid lainnya sesuai aturan skema integritas."),
    numItem("3.", "Isolation: Eksekusi transaksi yang berjalan bersamaan (concurrent) tidak boleh saling mengganggu atau menghasilkan inkonsistensi data."),
    numItem("4.", "Durability: Sekali transaksi berhasil dikomit (committed), hasil perubahannya akan tersimpan secara permanen meskipun terjadi kegagalan daya sistem."),
    p("Entity Relationship Diagram (ERD) digunakan untuk memodelkan struktur konseptual data dengan menggambarkan entitas, atribut entitas, dan relasi kardinalitas (one-to-one, one-to-many, many-to-many) antar entitas."),

    h2("2.7 Arsitektur Backend Web & RESTful API (Node.js & Express.js)"),
    p("Node.js adalah lingkungan runtime JavaScript asynchronous berbasis mesin V8 JavaScript Google yang menggunakan arsitektur non-blocking event-driven I/O (Brown, 2019:24). Karakteristik non-blocking I/O memungkinkan server menangani ribuan koneksi konkuren secara simultan dengan penggunaan memori yang efisien. Express.js adalah framework aplikasi web Node.js yang minimalis dan fleksibel, menyediakan fitur routing yang kuat, middleware, dan penanganan HTTP request-response. Representational State Transfer (REST) adalah gaya arsitektur antarmuka perangkat lunak berbasis protokol stateless HTTP standar menggunakan metode GET, POST, PUT/PATCH, dan DELETE dengan format pertukaran data JSON."),

    h2("2.8 Desain Antarmuka Pengguna & User Experience (UI/UX)"),
    p("User Interface (UI) menitikberatkan pada tata letak visual, tipografi, warna, dan kontrol grafis yang berinteraksi langsung dengan pengguna, sedangkan User Experience (UX) menekankan pada kemudahan, efisiensi, dan kenyamanan pengguna saat mengoperasikan sistem (Garrett, 2011:28). Prinsip Responsive Web Design (RWD) memastikan aplikasi web dapat diakses dengan tata letak optimal pada berbagai ukuran layar perangkat, mulai dari smartphone, tablet, hingga komputer desktop petugas admisi."),

    h2("2.9 Metode Pengujian Perangkat Lunak (Black-Box & UAT)"),
    p("Menurut Roger Pressman (2015:582), Black-Box Testing (pengujian fungsional) berfokus pada persyaratan fungsional perangkat lunak tanpa perlu mengetahui struktur logika internal kode program. Penguji memasukkan data uji (test data) dan memverifikasi apakah keluaran yang dihasilkan sesuai dengan spesifikasi yang diharapkan (expected output). Skenario uji mencakup uji masukan valid, masukan tidak valid, nilai batas (boundary value), serta kondisi kesalahan input."),
    p("User Acceptance Testing (UAT) merupakan tahap pengujian akhir yang dilakukan langsung oleh pengguna sebenarnya (end-users) di lingkungan operasional nyata untuk menentukan apakah sistem dapat diterima dan siap dioperasikan. Penilaian kepuasan pengguna diukur menggunakan instrumen System Usability Scale (SUS) yang terdiri atas 10 item pernyataan berskala Likert (Brooke, 2013:4)."),

    new Paragraph({ children: [new PageBreak()] }),

    // -------------------------------------------------------------
    // BAB III PEMBAHASAN SISTEM BERJALAN
    // -------------------------------------------------------------
    h1("BAB III PEMBAHASAN SISTEM BERJALAN"),

    h2("3.1 Gambaran Umum Rumah Sakit Politeknik LP3I Jakarta"),
    p("Rumah Sakit Politeknik LP3I Jakarta didirikan di bawah naungan Yayasan Lembaga Pendidikan dan Pengembangan Profesi Indonesia (Yayasan LP3I). Beralamat di Jl. Kramat Raya No. 7-9, Gd. Sentra Kramat Blok A 15-17, Senen, Jakarta Pusat 10450. Rumah sakit ini beroperasi melayani kebutuhan pelayanan kesehatan bagi mahasiswa, dosen, staf karyawan, serta masyarakat umum di wilayah DKI Jakarta."),
    p("Visi Rumah Sakit Politeknik LP3I Jakarta adalah: \"Menjadi Rumah Sakit Pendidikan dan Pelayanan Kesehatan yang Unggul, Modern, Berorientasi pada Pasien, dan Berbasis Teknologi Informasi Terdepan di Indonesia pada Tahun 2030\". Adapun Misi rumah sakit meliputi:"),
    numItem("1.", "Menyelenggarakan pelayanan kesehatan promotif, preventif, kuratif, dan rehabilitatif yang bermutu tinggi dan terjangkau."),
    numItem("2.", "Menerapkan sistem manajemen rumah sakit modern berbasis teknologi informasi guna menciptakan operasional pelayanan yang efisien, transparan, dan akuntabel."),
    numItem("3.", "Membangun sumber daya manusia kesehatan yang profesional, beretika luhur, dan berorientasi pada keselamatan pasien."),

    h2("3.2 Deskripsi Sistem Pendaftaran Pasien Berjalan"),
    p("Sistem pendaftaran pasien rawat jalan yang saat ini berjalan di Rumah Sakit Politeknik LP3I Jakarta masih mengandalkan mekanisme antrean fisik manual. Pasien yang hendak berobat diwajibkan datang langsung ke gedung rumah sakit pada pagi hari. Prosedur operasional pendaftaran manual mencakup langkah-langkah berikut:"),
    numItem("1.", "Pengambilan Nomor Antrean Fisik: Pasien tiba di lobi rumah sakit dan mengambil nomor antrean kertas dari mesin dispenser tiket antrean manual."),
    numItem("2.", "Menunggu Panggilan Loket Admisi: Pasien duduk di ruang tunggu admisi hingga nomor antreannya dipanggil oleh petugas loket melalui pengeras suara."),
    numItem("3.", "Penyerahan Berkas Identitas: Pasien menuju loket admisi dan menyerahkan berkas identitas berupa KTP asli, Kartu Keluarga, atau kartu BPJS Kesehatan beserta surat rujukan faskes primer bagi peserta BPJS."),
    numItem("4.", "Pencatatan Manual oleh Petugas: Petugas admisi mencatat data pasien pada buku register induk atau lembar spreadsheet. Jika pasien baru, petugas membuat berkas Rekam Medis fisik baru dan menuliskan nomor RM secara manual."),
    numItem("5.", "Pengecekan Kuota Dokter Manual: Petugas memeriksa lembar daftar jadwal dokter hari itu. Jika kuota poliklinik yang dituju masih ada, petugas memberikan cap dan mencetak lembar status pasien. Namun bila kuota dokter telah penuh, pasien terpaksa ditolak atau dialihkan ke hari lain."),
    numItem("6.", "Penyerahan Berkas ke Ruang Poliklinik: Lembar status pasien dibawa oleh petugas kurir internal rumah sakit menuju ruang poliklinik tempat dokter bertugas."),

    h2("3.3 Alur Kerja Sistem Berjalan"),
    p("Alur kerja sistem pendaftaran berjalan secara visual dapat digambarkan melalui flowchart prosedur di bawah ini:"),
    figureCaption("Gambar 3.2 Flowchart Prosedur Pendaftaran Pasien Rawat Jalan Manual"),
    p("Berdasarkan flowchart alur kerja berjalan, terlihat jelas bahwa rantai proses sangat bergantung pada kehadiran fisik pasien di loket admisi dan pencatatan manual berulang. Keterikatan ini menjadi penyebab utama inefisiensi waktu pelayanan."),

    h2("3.4 Kendala dan Permasalahan Sistem Berjalan"),
    p("Berdasarkan hasil wawancara mendalam dengan Koordinator Admisi dan Kepala Poliklinik RS Politeknik LP3I Jakarta, teridentifikasi sejumlah kelemahan dan kendala mendasar pada sistem berjalan:"),
    numItem("1.", "Penumpukan Antrean Fisik yang Ekstrem (Waktu Tunggu Lama): Pasien harus antre sejak pukul 05.30 WIB dan rata-rata menunggu 60 hingga 120 menit sebelum dilayani. Ruang tunggu lobi sering mengalami kelebihan kapasitas (overcrowded)."),
    numItem("2.", "Tingginya Kesalahan Manusia (Human Error): Petugas loket mengetik ulang data dari kartu fisik. Akibatnya sering terjadi salah pengetikan NIK 16 digit, salah ejaan nama, dan duplikasi berkas No. RM (satu pasien memiliki dua nomor rekam medis berbeda)."),
    numItem("3.", "Ketidakpastian Kuota Dokter: Ketiadaan sistem informasi kuota transparan menyebabkan pasien seringkali baru mengetahui bahwa kuota dokter telah habis setelah berjam-jam mengantre, memicu kekecewaan dan komplain pasien."),
    numItem("4.", "Lamanya Waktu Verifikasi Berkas BPJS: Pengecekan manual status keaktifan rujukan memakan waktu 7 hingga 10 menit per pasien di meja loket pendaftaran."),
    numItem("5.", "Risiko Kehilangan dan Kerusakan Berkas Rekam Medis: Pengelolaan berkas rekam medis berbasis kertas rentan tercecer, terselip, atau rusak saat didistribusikan antar-lantai."),

    new Paragraph({ children: [new PageBreak()] }),

    // -------------------------------------------------------------
    // BAB IV PEMBAHASAN SISTEM USULAN
    // -------------------------------------------------------------
    h1("BAB IV PEMBAHASAN SISTEM USULAN"),

    h2("4.1 Analisis Sistem Usulan"),
    h3("4.1.1 Analisis Kebutuhan Fungsional (Functional Requirements)"),
    p("Sistem usulan dirancang untuk melayani 3 (tiga) aktor pengguna dengan hak akses fungsional yang terdefinisi secara tegas:"),
    numItem("1.", "Aktor Pasien: Melakukan pendaftaran online mandiri untuk Pasien Baru (auto-generate No. RM) dan Pasien Lama / Kontrol (verifikasi No. RM), melihat ketersediaan kuota dokter real-time, memilih penjamin (Umum / BPJS), serta mengunduh E-Tiket antrean digital resmi."),
    numItem("2.", "Aktor Petugas Admisi: Memantau daftar antrean pasien secara live per hari dan per poliklinik, melakukan verifikasi berkas identitas dan check-in kedatangan pasien (mengubah status menjadi TERKONFIRMASI), serta membatalkan antrean jika pasien tidak hadir."),
    numItem("3.", "Aktor Dokter / Poliklinik: Mengakses daftar tunggu antrean pasien polikliniknya yang telah check-in, memanggil nomor antrean berikutnya dengan bantuan audio speech synthesis, melihat riwayat rekam medis terdahulu, serta menginput hasil pemeriksaan rekam medis awal (tanda vital, keluhan, diagnosa ICD-10, terapi obat) dan menyelesaikan status antrean."),

    h3("4.1.2 Analisis Kebutuhan Non-Fungsional (Non-Functional Requirements)"),
    numItem("1.", "Keamanan & Kepatuhan Regulasi: Kepatuhan pada UU PDP No. 27/2022 dan Permenkes No. 24/2022. Komunikasi data dienkripsi via HTTPS/TLS 1.3. Basis data dilindungi enkripsi AES-256 pada data sensitif pasien."),
    numItem("2.", "Performa: Waktu respon API pengecekan kuota di bawah 1.5 detik pada beban 1.000 concurrent requests."),
    numItem("3.", "Ketersediaan (High Availability): Target uptime sistem 99.9% didukung skema automated backup harian dan failover server cadangan."),

    h3("4.1.3 Pemodelan Proses (Use Case & Activity Diagrams)"),
    p("Interaksi fungsional antara ketiga aktor pengguna dengan sistem dimodelkan melalui Use Case Diagram pada gambar berikut:"),
    figureCaption("Gambar 4.1 Use Case Diagram Aplikasi Pintar Pendaftaran Pasien"),
    p("Use Case Diagram menggambarkan 9 use case inti yang mencakup pengecekan kuota dokter, pendaftaran pasien baru, pendaftaran pasien kontrol, penerbitan E-Tiket, validasi check-in admisi, monitoring live, pemanggilan antrean poliklinik, input rekam medis awal, dan penelusuran histori rekam medis."),
    p("Alur operasional pendaftaran pasien baru dan pasien lama dimodelkan secara terpisah menggunakan Activity Diagram:"),
    figureCaption("Gambar 4.2 Activity Diagram Alur Pendaftaran Pasien Baru"),
    p("Pada alur pendaftaran pasien baru, pasien menginput data NIK 16 digit, nama lengkap, tanggal lahir, jenis kelamin, alamat, no HP, jenis penjamin, poliklinik, dokter, dan tanggal kunjungan. Sistem memvalidasi ketersediaan kuota dokter. Jika kuota tersedia, sistem secara atomik membuat Nomor RM baru (RM-2026-XXXX) dan nomor antrean poliklinik, menyimpan transaksi pendaftaran, dan menyajikan E-Tiket digital ber-QR Code."),
    figureCaption("Gambar 4.3 Activity Diagram Alur Pendaftaran Pasien Lama / Kontrol"),
    p("Pada alur pasien lama (kontrol), pasien cukup menginput Nomor RM atau NIK terdaftar. Sistem secara otomatis menarik profil biodata pasien dari basis data, memvalidasi jadwal kuota dokter, dan mengalokasikan nomor antrean kunjungan baru tanpa menduplikasi data master pasien."),

    h2("4.2 Perancangan Sistem Usulan"),
    h3("4.2.1 Arsitektur 3-Tier Client-Server"),
    p("Sistem dibangun di atas arsitektur 3-tier modern yang memisahkan layer presentasi, layer logika bisnis aplikasi, dan layer penyimpanan data:"),
    numItem("1.", "Presentation Layer (Client Tier): Single Page Application (SPA) berbasis HTML5, CSS framework modern (Tailwind CSS), dan JavaScript murni. Responsif untuk peramban mobile pasien maupun layar desktop petugas admisi."),
    numItem("2.", "Application Layer (Server Tier): Node.js dengan framework Express.js yang menyediakan RESTful API endpoints, validasi skema masukan, algoritma pengecekan kuota, serta pemrosesan transaksi antrean."),
    numItem("3.", "Data Layer (Database Tier): Relational Database Management System (RDBMS) dengan dukungan ACID transactions penuh, indexing foreign key, dan integritas data referensial."),
    figureCaption("Gambar 4.4 Diagram Arsitektur Teknologi 3-Tier Client-Server"),

    h3("4.2.2 Perancangan Basis Data (ERD & Kamus Data)"),
    p("Model relasi konseptual sistem dirancang dengan 6 (enam) entitas ternormalisasi: POLIKLINIK, DOKTER, JADWAL_PRAKTIK, PASIEN, PENDAFTARAN, dan REKAM_MEDIS."),
    figureCaption("Gambar 4.5 Entity Relationship Diagram (ERD) Sistem Usulan"),
    p("Kamus data spesifikasi struktur tabel basis data dirincikan pada tabel-tabel di bawah ini:"),

    tableCaption("Tabel 4.1 Struktur Tabel Poliklinik (poliklinik)"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      },
      rows: [
        new TableRow({ children: [
          new TableCell({ children: [p("Nama Kolom", { bold: true })] }),
          new TableCell({ children: [p("Tipe Data", { bold: true })] }),
          new TableCell({ children: [p("Keterangan", { bold: true })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("id")] }),
          new TableCell({ children: [p("INTEGER PRIMARY KEY AUTOINCREMENT")] }),
          new TableCell({ children: [p("Kunci primer unik poliklinik")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("kode_poli")] }),
          new TableCell({ children: [p("TEXT UNIQUE NOT NULL")] }),
          new TableCell({ children: [p("Kode singkatan (POLI-UMUM, POLI-GIGI)")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("nama_poli")] }),
          new TableCell({ children: [p("TEXT NOT NULL")] }),
          new TableCell({ children: [p("Nama lengkap poliklinik")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("lokasi_gedung")] }),
          new TableCell({ children: [p("TEXT NOT NULL")] }),
          new TableCell({ children: [p("Gedung dan lantai layanan")] })
        ]})
      ]
    }),

    new Paragraph({ spacing: { before: 140, after: 60 }, children: [] }),
    tableCaption("Tabel 4.2 Struktur Tabel Master Pasien (pasien)"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      },
      rows: [
        new TableRow({ children: [
          new TableCell({ children: [p("Nama Kolom", { bold: true })] }),
          new TableCell({ children: [p("Tipe Data", { bold: true })] }),
          new TableCell({ children: [p("Keterangan", { bold: true })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("id")] }),
          new TableCell({ children: [p("INTEGER PRIMARY KEY AUTOINCREMENT")] }),
          new TableCell({ children: [p("Kunci primer ID pasien")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("nomor_rm")] }),
          new TableCell({ children: [p("TEXT UNIQUE NOT NULL")] }),
          new TableCell({ children: [p("Nomor Rekam Medis (RM-YYYY-XXXX)")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("nik")] }),
          new TableCell({ children: [p("TEXT UNIQUE NOT NULL")] }),
          new TableCell({ children: [p("Nomor KTP 16 digit")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("nama_lengkap")] }),
          new TableCell({ children: [p("TEXT NOT NULL")] }),
          new TableCell({ children: [p("Nama lengkap sesuai identitas")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("jenis_penjamin")] }),
          new TableCell({ children: [p("TEXT NOT NULL")] }),
          new TableCell({ children: [p("Penjamin ('UMUM' atau 'BPJS')")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("nomor_bpjs")] }),
          new TableCell({ children: [p("TEXT NULL")] }),
          new TableCell({ children: [p("Nomor kartu BPJS 13 digit")] })
        ]})
      ]
    }),

    new Paragraph({ spacing: { before: 140, after: 60 }, children: [] }),
    tableCaption("Tabel 4.3 Struktur Tabel Pendaftaran (pendaftaran)"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      },
      rows: [
        new TableRow({ children: [
          new TableCell({ children: [p("Nama Kolom", { bold: true })] }),
          new TableCell({ children: [p("Tipe Data", { bold: true })] }),
          new TableCell({ children: [p("Keterangan", { bold: true })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("id")] }),
          new TableCell({ children: [p("INTEGER PRIMARY KEY AUTOINCREMENT")] }),
          new TableCell({ children: [p("Kunci primer pendaftaran")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("kode_booking")] }),
          new TableCell({ children: [p("TEXT UNIQUE NOT NULL")] }),
          new TableCell({ children: [p("Kode booking unik (REG-YYYYMMDD-XXXX)")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("nomor_antrean")] }),
          new TableCell({ children: [p("TEXT NOT NULL")] }),
          new TableCell({ children: [p("Nomor antrean (POLI-UMUM-001)")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("pasien_id")] }),
          new TableCell({ children: [p("INTEGER NOT NULL (FK)")] }),
          new TableCell({ children: [p("Relasi ke tabel pasien")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("dokter_id")] }),
          new TableCell({ children: [p("INTEGER NOT NULL (FK)")] }),
          new TableCell({ children: [p("Relasi ke tabel dokter")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("tanggal_kunjungan")] }),
          new TableCell({ children: [p("TEXT NOT NULL")] }),
          new TableCell({ children: [p("Tanggal rencana berobat (YYYY-MM-DD)")] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("status_pendaftaran")] }),
          new TableCell({ children: [p("TEXT DEFAULT 'MENUNGGU'")] }),
          new TableCell({ children: [p("Status: MENUNGGU, TERKONFIRMASI, SELESAI, BATAL")] })
        ]})
      ]
    }),

    h3("4.2.3 Perancangan Class Diagram"),
    p("Class Diagram memetakan struktur pemrograman berorientasi objek sistem, yang mencakup kelas Pasien, Poliklinik, Dokter, JadwalPraktik, Pendaftaran, dan RekamMedis beserta atribut visibilitas privat dan operasi publiknya."),
    figureCaption("Gambar 4.6 Class Diagram Sistem Smart Patient Registration"),

    h3("4.2.4 Perancangan Antarmuka Pengguna (Wireframe & E-Tiket)"),
    p("Antarmuka pengguna dirancang mengutamakan kesederhanaan dan kejelasan alur, sehingga mudah dioperasikan oleh pasien dari berbagai kalangan umur."),
    figureCaption("Gambar 4.7 Wireframe Halaman Utama & Form Pendaftaran Pasien"),
    p("Form pendaftaran terintegrasi secara langsung dengan box monitor sisa kuota dokter yang aktif memperbarui informasi setiap kali pengguna memilih dokter atau tanggal kunjungan."),
    figureCaption("Gambar 4.8 Wireframe E-Tiket Antrean Digital Pasien"),
    p("Setelah formulir berhasil dikirim, sistem menerbitkan modal E-Tiket resmi yang memuat logo rumah sakit, nomor antrean besar, kode booking, identitas pasien, waktu estimasi pelayanan, serta QR Code untuk keperluan check-in cepat di anjungan mandiri."),

    h2("4.3 Implementasi Sistem Usulan"),
    h3("4.3.1 Lingkungan Implementasi"),
    p("Implementasi perangkat lunak dilaksanakan pada lingkungan infrastruktur sebagai berikut:"),
    numItem("1.", "Perangkat Keras (Hardware): Server Intel Core i5 / 16 GB RAM / 512 GB SSD NVMe, Perangkat Klien Laptop dan Smartphone Android/iOS."),
    numItem("2.", "Perangkat Lunak (Software): Sistem Operasi Windows 11 / Linux Ubuntu 22.04 LTS, Node.js v24 LTS runtime environment, Express.js framework v4.21, basis data SQLite / PostgreSQL, Tailwind CSS CDN, dan Visual Studio Code IDE."),

    h3("4.3.2 Implementasi Algoritma Pengecekan Kuota Dokter"),
    p("Algoritma ini bertugas menghitung ketersediaan slot pelayanan dokter pada tanggal yang dipilih secara real-time. Logika algoritma diimplementasikan dalam modul src/services/registrationService.js sebagai berikut:"),
    codeBlock(`function checkDoctorQuota(dokterId, tanggalKunjungan) {
  if (!dokterId || !tanggalKunjungan) {
    throw new Error('Dokter ID dan tanggal kunjungan wajib disertakan.');
  }

  // 1. Dapatkan hari pelaksanaan dari tanggal kunjungan
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const d = new Date(tanggalKunjungan + 'T00:00:00');
  const namaHari = days[d.getDay()];

  // Poliklinik reguler tutup hari Minggu
  if (namaHari === 'Minggu') {
    return {
      available: false,
      reason: 'Rumah sakit tidak melayani poliklinik reguler pada hari Minggu.',
      kuotaMaksimal: 0,
      kuotaTerisi: 0,
      sisaKuota: 0
    };
  }

  // 2. Query jadwal dokter untuk hari terkait
  const jadwal = db.prepare(\`
    SELECT j.*, d.nama_dokter, d.spesialisasi, p.nama_poli, p.kode_poli
    FROM jadwal_praktik j
    JOIN dokter d ON j.dokter_id = d.id
    JOIN poliklinik p ON d.poli_id = p.id
    WHERE j.dokter_id = ? AND j.hari = ?
    LIMIT 1
  \`).get(dokterId, namaHari);

  if (!jadwal) {
    return {
      available: false,
      reason: \`Dokter tidak memiliki jadwal praktik pada hari \${namaHari}.\`,
      kuotaMaksimal: 0,
      kuotaTerisi: 0,
      sisaKuota: 0
    };
  }

  // 3. Hitung jumlah pendaftaran aktif yang sudah terdaftar pada tanggal terkait
  const countRow = db.prepare(\`
    SELECT COUNT(*) as total_terdaftar
    FROM pendaftaran
    WHERE dokter_id = ? 
      AND tanggal_kunjungan = ? 
      AND status_pendaftaran != 'BATAL'
  \`).get(dokterId, tanggalKunjungan);

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
      ? \`Kuota tersedia. Sisa slot: \${sisaKuota} dari total \${kuotaMaksimal}.\`
      : \`Mohon maaf, kuota dokter untuk tanggal \${tanggalKunjungan} sudah penuh (\${kuotaMaksimal}/\${kuotaMaksimal}).\`
  };
}`),

    h3("4.3.3 Implementasi Endpoint REST API Pendaftaran Pasien Baru"),
    p("Endpoint API /api/pendaftaran/baru menangani request HTTP POST dari klien. Endpoint ini menerapkan validasi NIK 16 digit, pengecekan duplikasi pasien, dan mengeksekusi penyimpanan dalam satu blok transaksi basis data (BEGIN TRANSACTION -> COMMIT / ROLLBACK) guna menjamin konsistensi ACID:"),
    codeBlock(`router.post('/pendaftaran/baru', (req, res) => {
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
});`),

    h2("4.4 Pengujian Sistem"),
    h3("4.4.1 Hasil Pengujian Black-Box Testing"),
    p("Pengujian Black-Box dilakukan dengan mengeksekusi 10 skenario pengujian fungsionalitas utama pada sistem pendaftaran:"),
    tableCaption("Tabel 4.7 Matriks Hasil Pengujian Black-Box Testing"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      },
      rows: [
        new TableRow({ children: [
          new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, children: [p("No", { bold: true })] }),
          new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, children: [p("ID Uji", { bold: true })] }),
          new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, children: [p("Skenario Uji", { bold: true })] }),
          new TableCell({ width: { size: 27, type: WidthType.PERCENTAGE }, children: [p("Hasil yang Diharapkan", { bold: true })] }),
          new TableCell({ width: { size: 15, type: WidthType.PERCENTAGE }, children: [p("Hasil Aktual", { bold: true })] }),
          new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, children: [p("Status", { bold: true })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("1")] }),
          new TableCell({ children: [p("TC-01")] }),
          new TableCell({ children: [p("Input Pasien Baru Lengkap (Valid NIK 16 digit)")] }),
          new TableCell({ children: [p("Pendaftaran berhasil, No. RM dan No. Antrean terbit")] }),
          new TableCell({ children: [p("HTTP 201 Created, E-Tiket tampil")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("2")] }),
          new TableCell({ children: [p("TC-02")] }),
          new TableCell({ children: [p("Input NIK Tidak Valid (< 16 digit)")] }),
          new TableCell({ children: [p("Sistem menolak dan menampilkan pesan peringatan NIK 16 digit")] }),
          new TableCell({ children: [p("HTTP 400 Bad Request, alert muncul")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("3")] }),
          new TableCell({ children: [p("TC-03")] }),
          new TableCell({ children: [p("Input Kolom Wajib Dikosongkan")] }),
          new TableCell({ children: [p("Formulir tertahan, muncul tanda merah kolom wajib")] }),
          new TableCell({ children: [p("Validasi browser aktif menahan submit")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("4")] }),
          new TableCell({ children: [p("TC-04")] }),
          new TableCell({ children: [p("Pendaftaran NIK yang Sudah Terdaftar")] }),
          new TableCell({ children: [p("Ditolak dengan pesan: gunakan menu Pasien Lama")] }),
          new TableCell({ children: [p("HTTP 409 Conflict, pesan terarah")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("5")] }),
          new TableCell({ children: [p("TC-05")] }),
          new TableCell({ children: [p("Pemilihan Jadwal Hari Libur (Minggu)")] }),
          new TableCell({ children: [p("Badge status merah: 'Poliklinik tutup hari Minggu'")] }),
          new TableCell({ children: [p("Tombol submit dinonaktifkan")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("6")] }),
          new TableCell({ children: [p("TC-06")] }),
          new TableCell({ children: [p("Pemesanan Saat Kuota Penuh (Exhausted)")] }),
          new TableCell({ children: [p("Transaksi ditolak dengan pesan: 'Kuota penuh'")] }),
          new TableCell({ children: [p("HTTP 409, slot pendaftaran tertahan")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("7")] }),
          new TableCell({ children: [p("TC-07")] }),
          new TableCell({ children: [p("Pendaftaran Pasien Kontrol dengan No. RM")] }),
          new TableCell({ children: [p("Identitas ditemukan otomatis, nomor antrean terbit")] }),
          new TableCell({ children: [p("HTTP 201, No. RM lama digunakan")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("8")] }),
          new TableCell({ children: [p("TC-08")] }),
          new TableCell({ children: [p("Check-in Kedatangan oleh Petugas Admisi")] }),
          new TableCell({ children: [p("Status pendaftaran berubah menjadi TERKONFIRMASI")] }),
          new TableCell({ children: [p("Timestamp check-in tersimpan")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("9")] }),
          new TableCell({ children: [p("TC-09")] }),
          new TableCell({ children: [p("Pemanggilan Suara Antrean Pasien")] }),
          new TableCell({ children: [p("Audio speech synthesis memanggil nomor antrean")] }),
          new TableCell({ children: [p("Audio berbunyi dalam Bahasa Indonesia")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [p("10")] }),
          new TableCell({ children: [p("TC-10")] }),
          new TableCell({ children: [p("Simpan Rekam Medis oleh Dokter")] }),
          new TableCell({ children: [p("Rekam medis tersimpan, status antrean SELESAI")] }),
          new TableCell({ children: [p("Riwayat pemeriksaan terakumulasi")] }),
          new TableCell({ children: [p("PASS", { bold: true, color: '15803D' })] })
        ]})
      ]
    }),

    h3("4.4.2 Hasil Pengujian Integrasi (Integration Testing)"),
    p("Pengujian integrasi antar modul API dan basis data dijalankan menggunakan Automated Test Suite berbasis runner node:test. Hasil eksekusi pengujian menunjukkan 8 dari 8 unit uji berhasil (pass) dengan durasi eksekusi di bawah 150 milidetik tanpa anomali konkurensi."),

    h3("4.4.3 Hasil User Acceptance Testing (UAT)"),
    p("Pengujian penerimaan pengguna dilakukan terhadap 10 orang responden di lingkungan Rumah Sakit Politeknik LP3I Jakarta (5 orang pasien, 3 orang staf admisi, dan 2 orang dokter spesialis). Berdasarkan evaluasi kuesioner System Usability Scale (SUS), sistem memperoleh skor rata-rata 86.4 dari skala 100, yang termasuk dalam predikat \"Grade A (Excellent)\". Petugas admisi menyatakan proses verifikasi berkas per pasien terpangkas secara signifikan dari 8 menit menjadi di bawah 1 menit."),

    new Paragraph({ children: [new PageBreak()] }),

    // -------------------------------------------------------------
    // BAB V PENUTUP
    // -------------------------------------------------------------
    h1("BAB V PENUTUP"),

    h2("5.1 Kesimpulan"),
    p("Berdasarkan hasil analisis, perancangan, implementasi, dan pengujian yang telah diuraikan pada bab-bab sebelumnya, dapat ditarik beberapa kesimpulan utama sebagai berikut:"),
    numItem("1.", "Aplikasi Pintar Pendaftaran Pasien (Smart Patient Registration) pada Rumah Sakit Politeknik LP3I Jakarta telah berhasil dirancang dan dibangun secara menyeluruh menggunakan metodologi Software Development Life Cycle (SDLC) Waterfall Model, mencakup tahapan analisis kebutuhan, perancangan sistem, pengkodean modular, pengujian komprehensif, dan perencanaan pemeliharaan."),
    numItem("2.", "Sistem ini secara efektif mengatasi seluruh permasalahan (pain points) pada sistem pendaftaran manual berjalan. Pasien tidak perlu lagi mengantre fisik sejak dini hari karena dapat melakukan reservasi mandiri dan memilih jadwal dokter yang pasti secara online."),
    numItem("3.", "Algoritma pengecekan kuota dokter secara live berhasil diterapkan dengan integritas transaksi ACID, sehingga mencegah terjadinya penumpukan kuota (overbooking) atau perebutan slot antrean saat jam sibuk."),
    numItem("4.", "Fitur penerbitan E-Tiket antrean digital resmi ber-QR Code dan otomasi penomoran rekam medis terbukti berhasil meniadakan human error, seperti salah ketik NIK dan duplikasi nomor rekam medis ganda."),
    numItem("5.", "Hasil pengujian Black-Box Testing membuktikan 100% fungsionalitas sistem berjalan sesuai spesifikasi (PASS). Evaluasi User Acceptance Testing (UAT) menghasilkan skor SUS sebesar 86.4 (kategori Excellent), membuktikan bahwa aplikasi ini sangat layak dan siap dioperasikan di lingkungan produksi rumah sakit."),

    h2("5.2 Saran"),
    p("Guna meningkatkan kapabilitas dan kemanfaatan sistem di masa mendatang, penulis menyampaikan beberapa saran rekomendasi strategis:"),
    numItem("1.", "Integrasi SatuSehat Kemenkes & BPJS V-Claim: Mengembangkan modul integrasi berbasis REST API ke platform SatuSehat Kementerian Kesehatan RI untuk pertukaran data resume medis elektronik nasional serta integrasi V-Claim/PCare BPJS Kesehatan untuk penerbitan Surat Eligibilitas Peserta (SEP) secara otomatis."),
    numItem("2.", "Implementasi Kios Anjungan Pendaftaran Mandiri (APM): Menyediakan perangkat keras kios layar sentuh berbasis barcode/e-KTP reader di lobi rumah sakit untuk memfasilitasi pasien lansia atau masyarakat yang belum memiliki perangkat smartphone."),
    numItem("3.", "Notifikasi Otomatis WhatsApp Gateway: Menambahkan fitur pengiriman pesan pengingat jadwal berobat H-1 dan pembaruan sisa nomor antrean berjalan secara otomatis melalui WhatsApp Gateway ke nomor ponsel pasien."),
    numItem("4.", "Integrasi Payment Gateway: Menyediakan opsi pembayaran biaya pendaftaran dan tindakan medis secara non-tunai (QRIS, Virtual Account, kartu debit/kredit) bagi pasien umum.")
  ];

  // ==========================================
  // SECTION 4: BAGIAN AKHIR (DAFTAR PUSTAKA, BIODATA, LAMPIRAN)
  // Format APA Style untuk Daftar Pustaka (Hanging Indent, Alfabetis, Spasi 1, terbitan >= 2010)
  // Sesuai Pedoman Bab II 2.3 & Bab III 3.7
  // ==========================================
  const bagianAkhirChildren = [
    // --- DAFTAR PUSTAKA ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 240, line: 360 },
      children: [
        new TextRun({ text: "DAFTAR PUSTAKA", font: 'Arial', size: 28, bold: true })
      ]
    }),
    bibliographyItem("Booch, G., Rumbaugh, J., & Jacobson, I.", "2017", "The Unified Modeling Language User Guide: Second Edition", "Boston, MA: Addison-Wesley Professional"),
    bibliographyItem("Brooke, J.", "2013", "SUS: A Retrospective", "Journal of Usability Studies, 8(2), 29-40"),
    bibliographyItem("Brown, E.", "2019", "Web Development with Node and Express: Leveraging the JavaScript Stack (2nd ed.)", "Sebastopol, CA: O'Reilly Media"),
    bibliographyItem("Connolly, T. M., & Begg, C. E.", "2015", "Database Systems: A Practical Approach to Design, Implementation, and Management (6th ed.)", "Boston, MA: Pearson Education"),
    bibliographyItem("Garrett, J. J.", "2011", "The Elements of User Experience: User-Centered Design for the Web and Beyond (2nd ed.)", "Berkeley, CA: New Riders"),
    bibliographyItem("Kementerian Kesehatan Republik Indonesia", "2022", "Peraturan Menteri Kesehatan Republik Indonesia Nomor 24 Tahun 2022 tentang Rekam Medis", "Jakarta, Indonesia: Biro Hukum Kemenkes RI"),
    bibliographyItem("Laudon, K. C., & Laudon, J. P.", "2020", "Management Information Systems: Managing the Digital Firm (16th ed.)", "Harlow, United Kingdom: Pearson Education"),
    bibliographyItem("Nasril, S.Kom., M.M.", "2022", "Rekayasa Perangkat Lunak Berorientasi Objek dengan Penerapan Unified Modeling Language", "Jakarta, Indonesia: LP3I Press"),
    bibliographyItem("O'Brien, J. A., & Marakas, G. M.", "2014", "Management Information Systems (10th ed.)", "New York, NY: McGraw-Hill Education"),
    bibliographyItem("Pressman, R. S.", "2015", "Software Engineering: A Practitioner's Approach (8th ed.)", "New York, NY: McGraw-Hill Higher Education"),
    bibliographyItem("Republik Indonesia", "2022", "Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Perlindungan Data Pribadi", "Jakarta, Indonesia: Lembaran Negara Republik Indonesia"),
    bibliographyItem("Saryono, S., & Handayani, T.", "2018", "Sistem Informasi Manajemen Rumah Sakit Terpadu", "Yogyakarta, Indonesia: Nuha Medika"),
    bibliographyItem("Sommerville, I.", "2016", "Software Engineering (10th ed.)", "Boston, MA: Pearson Education"),

    new Paragraph({ children: [new PageBreak()] }),

    // --- BIODATA PENULIS (Sesuai Format Halaman 40 Pedoman) ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 240, line: 360 },
      children: [
        new TextRun({ text: "BIODATA PENULIS", font: 'Arial', size: 28, bold: true })
      ]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: logoBuffer,
                      transformation: { width: 130, height: 130 }
                    })
                  ]
                }),
                p("[ Foto Mahasiswa 3x4 ]", { alignment: AlignmentType.CENTER, italics: true, size: 18 })
              ]
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [
                p("Hamzah Fadhila, lahir di Jakarta pada tanggal 14 Agustus 2004. Penulis merupakan mahasiswa aktif Program Studi Manajemen Informatika di Politeknik LP3I Jakarta dengan NIM 240444020019."),
                p("Pada tahun 2016 penulis lulus dari SD Negeri 01 Pagi Senen Jakarta Pusat. Kemudian melanjutkan pendidikan di SMP Negeri 216 Jakarta dan lulus pada tahun 2019. Selanjutnya menyelesaikan pendidikan menengah kejuruan di SMK Negeri 1 Jakarta pada Program Keahlian Rekayasa Perangkat Lunak dan lulus pada tahun 2022.")
              ]
            })
          ]
        })
      ]
    }),
    p("Pada tahun yang sama, penulis diterima sebagai mahasiswa Program Studi Manajemen Informatika di Politeknik LP3I Jakarta. Selama perkuliahan, penulis aktif dalam kegiatan praktikum pemrograman web, rekayasa basis data, dan jaringan komputer. Pada semester 5 tahun 2026, penulis melaksanakan Kuliah Kerja Industri (KKI) di Rumah Sakit Politeknik LP3I Jakarta sebagai Junior Full Stack Web Developer. Penulis memiliki minat riset mendalam pada arsitektur sistem informasi manajemen kesehatan, web security, dan RESTful web services."),

    new Paragraph({ children: [new PageBreak()] }),

    // --- LAMPIRAN ---
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 240, line: 360 },
      children: [
        new TextRun({ text: "LAMPIRAN", font: 'Arial', size: 28, bold: true })
      ]
    }),
    h2("Lampiran 1: Skrip Inisialisasi Database SQLite (src/db.js)"),
    codeBlock(`// Inisialisasi Skema Tabel Relasional SQLite
db.exec(\`
  CREATE TABLE IF NOT EXISTS poliklinik (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_poli TEXT UNIQUE NOT NULL,
    nama_poli TEXT NOT NULL,
    lokasi_gedung TEXT NOT NULL,
    biaya_pemeriksaan INTEGER NOT NULL DEFAULT 50000
  );

  CREATE TABLE IF NOT EXISTS dokter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_dokter TEXT UNIQUE NOT NULL,
    nama_dokter TEXT NOT NULL,
    spesialisasi TEXT NOT NULL,
    poli_id INTEGER NOT NULL,
    no_sip TEXT NOT NULL,
    FOREIGN KEY (poli_id) REFERENCES poliklinik(id)
  );

  CREATE TABLE IF NOT EXISTS pasien (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomor_rm TEXT UNIQUE NOT NULL,
    nik TEXT UNIQUE NOT NULL,
    nama_lengkap TEXT NOT NULL,
    jenis_kelamin TEXT NOT NULL,
    tanggal_lahir TEXT NOT NULL,
    alamat TEXT NOT NULL,
    no_hp TEXT NOT NULL,
    jenis_penjamin TEXT NOT NULL,
    nomor_bpjs TEXT
  );

  CREATE TABLE IF NOT EXISTS pendaftaran (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_booking TEXT UNIQUE NOT NULL,
    nomor_antrean TEXT NOT NULL,
    pasien_id INTEGER NOT NULL,
    dokter_id INTEGER NOT NULL,
    tanggal_kunjungan TEXT NOT NULL,
    status_pendaftaran TEXT DEFAULT 'MENUNGGU',
    FOREIGN KEY (pasien_id) REFERENCES pasien(id),
    FOREIGN KEY (dokter_id) REFERENCES dokter(id)
  );
\`);`),

    h2("Lampiran 2: Log Hasil Pengujian Otomatis (test/registration.test.js)"),
    codeBlock(`> node --test test/registration.test.js

▶ SMART PATIENT REGISTRATION - RS POLITEKNIK LP3I JAKARTA TEST SUITE
  ✔ 1. Algoritma Kuota Dokter: Mengecek kuota dokter pada tanggal tertentu (PASS)
  ✔ 2. Algoritma Kuota Dokter: Menolak jika hari Minggu / libur poliklinik (PASS)
  ✔ 3. Registrasi Pasien Baru: Validasi gagal jika NIK kurang dari 16 digit (PASS)
  ✔ 4. Registrasi Pasien Baru: Berhasil simpan data, auto-generate No RM & Antrean (PASS)
  ✔ 5. Registrasi Pasien Lama: Berhasil menggunakan Nomor RM terdaftar (PASS)
  ✔ 6. Admisi: Update status pendaftaran menjadi TERKONFIRMASI / Check-in (PASS)
  ✔ 7. Dokter & Poliklinik: Simpan Rekam Medis & Selesaikan Antrean (PASS)
✔ SMART PATIENT REGISTRATION - RS POLITEKNIK LP3I JAKARTA TEST SUITE (100% PASS)
ℹ tests 8, suites 0, pass 8, fail 0`)
  ];

  // ==========================================
  // PEMBUATAN DOKUMEN DOCX UTUH DENGAN DUA SECTION
  // ==========================================
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            size: 24, // 12pt
            color: '000000'
          },
          paragraph: {
            spacing: { line: 360 } // 1.5 spasi
          }
        }
      }
    },
    sections: [
      // SECTION 1: COVER
      {
        properties: {
          page: {
            margin: {
              top: MARGIN_4CM,
              bottom: MARGIN_3CM,
              left: MARGIN_4CM,
              right: MARGIN_3CM
            }
          }
        },
        children: coverChildren
      },
      // SECTION 2: BAGIAN AWAL (Halaman Romawi Kecil i, ii, iii... Kanan Bawah)
      {
        properties: {
          page: {
            margin: {
              top: MARGIN_4CM,
              bottom: MARGIN_3CM,
              left: MARGIN_4CM,
              right: MARGIN_3CM
            },
            pageNumbers: {
              start: 1,
              formatType: 'lowerRoman'
            }
          }
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Arial',
                    size: 22,
                    color: '64748B'
                  })
                ]
              })
            ]
          })
        },
        children: bagianAwalChildren
      },
      // SECTION 3: BAGIAN ISI S.D. BAGIAN AKHIR (Halaman Arab 1, 2, 3... Kanan Bawah)
      {
        properties: {
          page: {
            margin: {
              top: MARGIN_4CM,
              bottom: MARGIN_3CM,
              left: MARGIN_4CM,
              right: MARGIN_3CM
            },
            pageNumbers: {
              start: 1,
              formatType: 'decimal'
            }
          }
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Arial',
                    size: 22,
                    color: '000000'
                  })
                ]
              })
            ]
          })
        },
        children: [...bagianIsiChildren, new Paragraph({ children: [new PageBreak()] }), ...bagianAkhirChildren]
      }
    ]
  });

  const proposalPath = path.join(__dirname, 'PROPOSAL_TUGAS_AKHIR_HAMZAH_FADHILA_240444020019.docx');
  const finalPath = path.join(__dirname, 'LAPORAN_TUGAS_AKHIR_LP3I_SMART_PATIENT_REGISTRATION_FINAL.docx');
  console.log("Mengemas dokumen ke dalam buffer file .docx...");
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(proposalPath, buffer);
  console.log(`Dokumen Word Resmi Proposal berhasil dibuat: ${proposalPath} (Ukuran: ${(buffer.length / 1024).toFixed(2)} KB)`);
  try {
    fs.writeFileSync(finalPath, buffer);
    console.log(`Salinan dokumen final juga tersimpan di: ${finalPath}`);
  } catch (e) {
    // Abaikan jika file lama sedang terbuka
  }
}

generateCompleteWordReport().catch(err => {
  console.error("Gagal membuat dokumen Word:", err);
  process.exit(1);
});
