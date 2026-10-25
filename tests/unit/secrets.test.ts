import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertSecrets, getCronSecret, getSessionSecret } from '@/lib/secrets'
import { signWholesaleToken } from '@/lib/wholesale'

const PLACEHOLDER = 'change-me-to-a-long-random-string' // 33 caracteres: el largo solo no lo detecta
const GOOD = 'x'.repeat(40)

afterEach(() => vi.unstubAllEnvs())

describe('assertSecrets (arranque en producción)', () => {
  it('en producción rechaza SESSION_SECRET corta, ausente o igual al placeholder', () => {
    expect(() => assertSecrets({ NODE_ENV: 'production', SESSION_SECRET: 'corta' })).toThrow(/SESSION_SECRET/)
    expect(() => assertSecrets({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(31) })).toThrow(/SESSION_SECRET/)
    expect(() => assertSecrets({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/)
    expect(() => assertSecrets({ NODE_ENV: 'production', SESSION_SECRET: PLACEHOLDER })).toThrow(/SESSION_SECRET/)
  })

  it('en producción acepta un secreto de 32+ caracteres', () => {
    expect(() => assertSecrets({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) })).not.toThrow()
  })

  it('CRON_SECRET: si está definida en producción también debe ser fuerte; sin definir = cron deshabilitado', () => {
    const base = { NODE_ENV: 'production', SESSION_SECRET: GOOD }
    expect(() => assertSecrets({ ...base, CRON_SECRET: 'corta' })).toThrow(/CRON_SECRET/)
    expect(() => assertSecrets({ ...base, CRON_SECRET: 'change-me-to-another-random-string' })).toThrow(/CRON_SECRET/)
    expect(() => assertSecrets({ ...base, CRON_SECRET: 'y'.repeat(40) })).not.toThrow()
    expect(() => assertSecrets(base)).not.toThrow()
  })

  it('en desarrollo y test no exige nada (el .env.example trae placeholders)', () => {
    expect(() => assertSecrets({ NODE_ENV: 'development', SESSION_SECRET: PLACEHOLDER, CRON_SECRET: 'x' })).not.toThrow()
    expect(() => assertSecrets({ NODE_ENV: 'test' })).not.toThrow()
    expect(() => assertSecrets({})).not.toThrow()
  })
})

describe('uso perezoso (defensa si el arranque no corrió)', () => {
  it('getSessionSecret falla en producción con el placeholder y en cualquier entorno si falta', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', PLACEHOLDER)
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
    expect(() => signWholesaleToken('x')).toThrow(/SESSION_SECRET/)
    vi.stubEnv('SESSION_SECRET', GOOD)
    expect(getSessionSecret()).toBe(GOOD)
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SESSION_SECRET', '')
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
  })

  it('getCronSecret devuelve null si falta o es débil en producción; en desarrollo acepta cualquiera', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CRON_SECRET', 'corta')
    expect(getCronSecret()).toBeNull()
    vi.stubEnv('CRON_SECRET', 'y'.repeat(40))
    expect(getCronSecret()).toBe('y'.repeat(40))
    vi.stubEnv('CRON_SECRET', '')
    expect(getCronSecret()).toBeNull()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('CRON_SECRET', 'corta')
    expect(getCronSecret()).toBe('corta')
  })
})
