import { assertSecrets } from '@/lib/secrets'

// Se ejecuta una vez al iniciar el servidor (antes de atender requests): en producción no arranca con secretos débiles.
export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') assertSecrets(process.env)
}
