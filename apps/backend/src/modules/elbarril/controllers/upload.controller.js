const multer  = require('multer')
const path    = require('path')
const { v4: uuidv4 } = require('uuid')
const supabase = require('../../../config/supabase')

// ── Helper: URL pública accesible desde el navegador ──────────
// SUPABASE_URL en Docker puede ser interno (http://kong:8000).
// SUPABASE_PUBLIC_URL debe ser la URL externa: https://supabase.mymulticentro.com
function buildPublicUrl(bucket, filename) {
  const base = (process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${bucket}/${filename}`
}

// ── Multer: memoria temporal, max 5 MB, solo imágenes ──────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan imágenes JPEG, PNG o WEBP'))
    }
    cb(null, true)
  },
}).single('imagen')

// POST /api/panaderia/upload/imagen
// Body: multipart/form-data con campo "imagen"
// Respuesta: { url: "https://..." }
async function subirImagen(req, res) {
  upload(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' })

    try {
      const ext      = path.extname(req.file.originalname).toLowerCase() || '.jpg'
      const filename = `productos/${Date.now()}-${uuidv4().split('-')[0]}${ext}`
      const bucket   = process.env.STORAGE_BUCKET || 'kalreco-media'

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })

      if (uploadError) throw uploadError

      return res.json({ url: buildPublicUrl(bucket, filename) })
    } catch (error) {
      console.error('Storage upload error:', error)
      const bucket = process.env.STORAGE_BUCKET || 'kalreco-media'
      return res.status(500).json({
        error: `Error al subir la imagen. Verifica que el bucket "${bucket}" existe y es público en Supabase Storage.`,
      })
    }
  })
}

// POST /api/panaderia/upload/imagen-url
// Body: { url: "https://..." }
// Descarga la imagen desde internet y la guarda en Storage
async function subirImagenUrl(req, res) {
  const { url } = req.body
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Se requiere una URL válida' })
  }

  let parsedUrl
  try { parsedUrl = new URL(url) } catch {
    return res.status(400).json({ error: 'URL no válida' })
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Kalreco/1.0)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const allowed     = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.some(m => contentType.startsWith(m))) {
      return res.status(400).json({ error: 'La URL no apunta a una imagen válida (JPEG, PNG, WEBP o GIF)' })
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'La imagen descargada supera 10 MB' })
    }

    const mime   = allowed.find(m => contentType.startsWith(m)) || 'image/jpeg'
    const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }
    // Extensión desde el path de la URL (sin query string) o por MIME
    const extFromPath = path.extname(parsedUrl.pathname).toLowerCase()
    const ext = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extFromPath)
      ? (extFromPath === '.jpeg' ? '.jpg' : extFromPath)
      : extMap[mime]

    const filename = `productos/${Date.now()}-${uuidv4().split('-')[0]}${ext}`
    const bucket   = process.env.STORAGE_BUCKET || 'kalreco-media'

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filename, buffer, { contentType: mime, upsert: false })

    if (uploadError) throw uploadError

    return res.json({ url: buildPublicUrl(bucket, filename) })
  } catch (error) {
    console.error('URL fetch/upload error:', error)
    return res.status(500).json({ error: 'No se pudo descargar la imagen. Verifica que la URL sea directa a un archivo de imagen.' })
  }
}

module.exports = { subirImagen, subirImagenUrl }
