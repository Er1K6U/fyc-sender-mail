const express = require('express');
const path = require('path');
const fs = require('fs');
const { autenticar } = require('../middleware/auth');
const { subirImagen, UPLOAD_PATH } = require('../config/multer');

const router = express.Router();
router.use(autenticar);

// POST /api/uploads/imagen
// Sube una imagen y devuelve la URL pública.
// Unlayer espera: { url: "https://..." }
router.post('/imagen', subirImagen.single('imagen'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  }

  const url = `${process.env.APP_URL}/uploads/images/${req.file.filename}`;
  res.json({
    url,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// DELETE /api/uploads/imagen/:filename - Eliminar imagen subida
router.delete('/imagen/:filename', (req, res) => {
  const { filename } = req.params;

  // Seguridad: no permitir traversal de directorios
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }

  const rutaArchivo = path.join(UPLOAD_PATH, 'images', filename);

  if (!fs.existsSync(rutaArchivo)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  fs.unlinkSync(rutaArchivo);
  res.json({ mensaje: 'Imagen eliminada' });
});

// GET /api/uploads/imagenes - Listar imágenes subidas por el usuario
router.get('/imagenes', (req, res) => {
  const imgPath = path.join(UPLOAD_PATH, 'images');

  if (!fs.existsSync(imgPath)) {
    return res.json({ imagenes: [] });
  }

  const archivos = fs.readdirSync(imgPath)
    .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
    .map(f => ({
      filename: f,
      url: `${process.env.APP_URL}/uploads/images/${f}`,
      size: fs.statSync(path.join(imgPath, f)).size,
      fecha: fs.statSync(path.join(imgPath, f)).mtime,
    }))
    .sort((a, b) => b.fecha - a.fecha)
    .slice(0, 100); // máximo 100 imágenes recientes

  res.json({ imagenes: archivos });
});

module.exports = router;
