const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_PATH = path.resolve(
  __dirname,
  '../../..',
  process.env.UPLOAD_PATH || 'uploads'
);

// Asegurar que el directorio existe
if (!fs.existsSync(UPLOAD_PATH)) {
  fs.mkdirSync(UPLOAD_PATH, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_PATH),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const nombre = `import_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, nombre);
  },
});

const filtroArchivos = (_req, file, cb) => {
  const tiposPermitidos = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', // algunos sistemas envían CSV como text/plain
  ];
  const extensionesPermitidas = ['.csv', '.xls', '.xlsx'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (tiposPermitidos.includes(file.mimetype) || extensionesPermitidas.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos CSV o Excel (.csv, .xls, .xlsx)'), false);
  }
};

const subirCSV = multer({
  storage,
  fileFilter: filtroArchivos,
  limits: {
    fileSize: (parseInt(process.env.UPLOAD_MAX_SIZE_MB) || 10) * 1024 * 1024,
  },
});

const subirImagen = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const imgPath = path.join(UPLOAD_PATH, 'images');
      if (!fs.existsSync(imgPath)) fs.mkdirSync(imgPath, { recursive: true });
      cb(null, imgPath);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { subirCSV, subirImagen, UPLOAD_PATH };
