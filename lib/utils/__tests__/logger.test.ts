import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('calls console.error in development', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')

    const { logger } = await import('../logger')
    logger.error('test error')

    expect(spy).toHaveBeenCalledWith('test error')
    spy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('calls console.warn in development', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')

    const { logger } = await import('../logger')
    logger.warn('test warning')

    expect(spy).toHaveBeenCalledWith('test warning')
    spy.mockRestore()
    vi.unstubAllEnvs()
  })
})
