import { ApiError } from '@/lib/api/client'

/**
 * The words for a key the server would not create (copy deck §11.2). The plan's key limit answers 403
 * `API_KEY_LIMIT_REACHED`, which `apiRequest` would otherwise show as Facet's 403 text, "Invalid credentials" (§11.5,
 * finding 3). The limit itself travels only inside the server's sentence ("This plan allows 2 active API keys. …"),
 * so it is read from there.
 */
export function createKeyError(err: unknown): string {
  if (err instanceof ApiError && err.status === 403 && err.data && err.data.error === 'API_KEY_LIMIT_REACHED') {
    const said = typeof err.data.message === 'string' ? /\d+/.exec(err.data.message) : null
    if (!said) return 'Your plan has no room for another API key. Revoke one to create another.'
    const n = Number(said[0])
    return `Your plan allows ${n} ${n === 1 ? 'API key' : 'API keys'} at a time. Revoke one to create another.`
  }
  return "Couldn't create the API key. Try again."
}
