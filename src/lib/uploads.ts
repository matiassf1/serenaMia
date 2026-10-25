import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

export const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** Se lee en cada llamada (no al cargar el módulo) para poder cambiarla en tests. */
export function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || './uploads')
}

/** El tipo se decide por el contenido (firma del archivo), no por el nombre ni el tipo declarado. */
function detectExt(b: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  return null
}

/** Valida JPG/PNG/WebP de hasta 5 MB y lo guarda con nombre aleatorio. Devuelve el nombre relativo a UPLOAD_DIR. */
export async function saveUpload(file: File): Promise<string> {
  if (file.size === 0) throw new UploadError('La foto está vacía.')
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('La foto pesa más de 5 MB.')
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadError('La foto pesa más de 5 MB.')
  const ext = detectExt(bytes)
  if (!ext) throw new UploadError('La foto tiene que ser JPG, PNG o WebP.')
  const name = `${randomBytes(16).toString('hex')}.${ext}`
  const dir = uploadDir()
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), bytes, { flag: 'wx' })
  return name
}
