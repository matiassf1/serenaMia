import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { MIME_BY_EXT, uploadDir } from '@/lib/uploads'

const notFound = () => new Response('No encontrado', { status: 404 })

// Pública a propósito: son las fotos del catálogo. Solo sirve JPG/PNG/WebP dentro de UPLOAD_DIR.
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params
  if (segments.length !== 1) return notFound()
  const name = segments[0]
  const ext = path.extname(name).slice(1).toLowerCase()
  const type = MIME_BY_EXT[ext]
  if (!type || !/^[\w.-]+$/.test(name) || name.includes('..')) return notFound()
  const root = uploadDir()
  const file = path.resolve(root, name)
  if (path.dirname(file) !== root) return notFound()
  try {
    const data = await readFile(file)
    return new Response(new Uint8Array(data), {
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return notFound()
  }
}
