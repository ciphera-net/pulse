import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The /join/[code] public preview (PULSE-92 Phase 5): the unauthenticated
// preview fetch moved off Ciphera ID onto Pulse's own invite-links route, same
// 410/404 handling as before; a failed post-accept activateTeam is now logged
// rather than swallowed.

const h = vi.hoisted(() => {
  class ApiError extends Error {
    status: number
    data?: Record<string, unknown>
    constructor(message: string, status: number, data?: Record<string, unknown>) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return {
    ApiError,
    PULSE_API: 'https://api.pulse.example.test',
    code: 'abc123',
    user: null as { id: string; email: string } | null,
    authLoading: false,
    acceptInviteLink: vi.fn(),
    initiateOAuthFlow: vi.fn(),
    initiateSignupFlow: vi.fn(),
    rememberReturnTarget: vi.fn(),
    activateTeam: vi.fn(async (..._args: unknown[]) => {}),
    logError: vi.fn(),
    assign: vi.fn(),
  }
})
const PULSE_API = h.PULSE_API

vi.mock('next/navigation', () => ({ useParams: () => ({ code: h.code }) }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: h.user, loading: h.authLoading }),
}))
vi.mock('@/lib/api/organization', () => ({
  acceptInviteLink: (...a: unknown[]) => h.acceptInviteLink(...a),
}))
vi.mock('@/lib/api/oauth', () => ({
  initiateOAuthFlow: (...a: unknown[]) => h.initiateOAuthFlow(...a),
  initiateSignupFlow: (...a: unknown[]) => h.initiateSignupFlow(...a),
}))
vi.mock('@/lib/api/client', () => ({
  API_URL: h.PULSE_API,
  ApiError: h.ApiError,
}))
vi.mock('@/lib/auth/return-target', () => ({
  rememberReturnTarget: (...a: unknown[]) => h.rememberReturnTarget(...a),
}))
vi.mock('@/lib/auth/switchOrganization', () => ({
  activateTeam: (...a: unknown[]) => h.activateTeam(...a),
}))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: (...a: unknown[]) => h.logError(...a), warn: vi.fn() } }))

import JoinPage from '../page'

beforeEach(() => {
  vi.clearAllMocks()
  h.code = 'abc123'
  h.user = { id: 'u1', email: 'a@b.c' }
  h.authLoading = false
  h.activateTeam.mockResolvedValue(undefined)
  Object.defineProperty(window, 'location', {
    value: { origin: 'https://pulse.ciphera.net', assign: h.assign, href: '' },
    writable: true,
  })
})
afterEach(() => vi.clearAllMocks())

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

describe('the public preview fetch goes to Pulse', () => {
  it('fetches the invite-link preview from Pulse (API_URL), not Ciphera ID', async () => {
    const fetchSpy = vi.fn().mockReturnValue(jsonResponse(200, {
      organization_name: 'Acme', organization_id: 'org1', role: 'member', name: 'Engineering invite',
    }))
    vi.stubGlobal('fetch', fetchSpy)

    render(<JoinPage />)

    await waitFor(() => expect(screen.getByText("You've been invited")).toBeInTheDocument())
    expect(fetchSpy).toHaveBeenCalledWith(`${PULSE_API}/api/v1/invite-links/abc123`)
  })

  it('reads the 410 reason the same way as before', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(jsonResponse(410, { reason: 'revoked' })))

    render(<JoinPage />)

    await waitFor(() => expect(screen.getByText('This invite link has been revoked by an admin.')).toBeInTheDocument())
  })

  it('treats a non-410 failure as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(jsonResponse(404, {})))

    render(<JoinPage />)

    await waitFor(() => expect(screen.getByText('Link not found')).toBeInTheDocument())
  })
})

describe('a failed post-accept team switch is logged, not swallowed', () => {
  function validPreview() {
    return jsonResponse(200, { organization_name: 'Acme', organization_id: 'org1', role: 'member', name: 'Engineering invite' })
  }

  it('logs the activateTeam failure and still lands on the dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(validPreview()))
    h.acceptInviteLink.mockResolvedValue({ organization_id: 'org1' })
    h.activateTeam.mockRejectedValueOnce(new Error('could not switch'))

    render(<JoinPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Join Acme/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Join Acme/i }))

    await waitFor(() => expect(h.logError).toHaveBeenCalledWith(
      'Could not switch into the joined team',
      expect.any(Error),
    ))
    expect(window.location.href).toBe('/')
  })

  it('still lands on the dashboard when the team switch succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(validPreview()))
    h.acceptInviteLink.mockResolvedValue({ organization_id: 'org1' })

    render(<JoinPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Join Acme/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Join Acme/i }))

    await waitFor(() => expect(window.location.href).toBe('/'))
    expect(h.logError).not.toHaveBeenCalled()
  })
})
