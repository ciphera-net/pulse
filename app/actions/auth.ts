     1|'use server'
     2|
     3|import { cookies } from 'next/headers'
     4|
     5|const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:8081'
     6|
     7|interface AuthResponse {
     8|  access_token: string
     9|  refresh_token: string
    10|  id_token: string
    11|  expires_in: number
    12|}
    13|
    14|interface UserPayload {
    15|  sub: string
    16|  email?: string
    17|  totp_enabled?: boolean
    18|}
    19|
    20|export async function exchangeAuthCode(code: string, codeVerifier: string, redirectUri: string) {
    21|  try {
    22|    const res = await fetch(`${AUTH_API_URL}/oauth/token`, {
    23|      method: 'POST',
    24|      headers: {
    25|        'Content-Type': 'application/json',
    26|      },
    27|      body: JSON.stringify({
    28|        grant_type: 'authorization_code',
    29|        code,
    30|        client_id: 'analytics-app',
    31|        redirect_uri: redirectUri,
    32|        code_verifier: codeVerifier,
    33|      }),
    34|    })
    35|
    36|    if (!res.ok) {
    37|      const data = await res.json()
    38|      throw new Error(data.error || 'Failed to exchange token')
    39|    }
    40|
    41|    const data: AuthResponse = await res.json()
    42|    
    43|    // * Decode payload (without verification, we trust the direct channel to Auth Server)
    44|    const payloadPart = data.access_token.split('.')[1]
    45|    const payload: UserPayload = JSON.parse(Buffer.from(payloadPart, 'base64').toString())
    46|
    47|    // * Set Cookies
    48|    const cookieStore = await cookies()
    49|    
    50|    // * Access Token
    51|    cookieStore.set('access_token', data.access_token, {
    52|      httpOnly: true,
    53|      secure: process.env.NODE_ENV === 'production',
    54|      sameSite: 'lax',
    55|      path: '/',
    56|      maxAge: 60 * 15 // 15 minutes (short lived)
    57|    })
    58|
    59|    // * Refresh Token (Long lived)
    60|    cookieStore.set('refresh_token', data.refresh_token, {
    61|      httpOnly: true,
    62|      secure: process.env.NODE_ENV === 'production',
    63|      sameSite: 'lax',
    64|      path: '/',
    65|      maxAge: 60 * 60 * 24 * 30 // 30 days
    66|    })
    67|
    68|    return {
    69|      success: true,
    70|      user: {
    71|        id: payload.sub,
    72|        email: payload.email || 'user@ciphera.net',
    73|        totp_enabled: payload.totp_enabled || false
    74|      }
    75|    }
    76|
    77|  } catch (error: any) {
    78|    console.error('Auth Exchange Error:', error)
    79|    return { success: false, error: error.message }
    80|  }
    81|}
    82|
    83|export async function setSessionAction(accessToken: string, refreshToken: string) {
    84|    try {
    85|        const payloadPart = accessToken.split('.')[1]
    86|        const payload: UserPayload = JSON.parse(Buffer.from(payloadPart, 'base64').toString())
    87|        
    88|        const cookieStore = await cookies()
    89|        
    90|        cookieStore.set('access_token', accessToken, {
    91|            httpOnly: true,
    92|            secure: process.env.NODE_ENV === 'production',
    93|            sameSite: 'lax',
    94|            path: '/',
    95|            maxAge: 60 * 15
    96|        })
    97|
    98|        cookieStore.set('refresh_token', refreshToken, {
    99|            httpOnly: true,
   100|            secure: process.env.NODE_ENV === 'production',
   101|            sameSite: 'lax',
   102|            path: '/',
   103|            maxAge: 60 * 60 * 24 * 30
   104|        })
   105|
   106|        return {
   107|            success: true,
   108|            user: {
   109|                id: payload.sub,
   110|                email: payload.email || 'user@ciphera.net',
   111|                totp_enabled: payload.totp_enabled || false
   112|            }
   113|        }
   114|    } catch (e) {
   115|        return { success: false, error: 'Invalid token' }
   116|    }
   117|}
   118|
   119|export async function logoutAction() {
   120|  const cookieStore = await cookies()
   121|  cookieStore.delete('access_token')
   122|  cookieStore.delete('refresh_token')
   123|  return { success: true }
   124|}
   125|
   126|export async function getSessionAction() {
   127|    const cookieStore = await cookies()
   128|    const token = cookieStore.get('access_token')
   129|    
   130|    if (!token) return null
   131|
   132|    try {
   133|        const payloadPart = token.value.split('.')[1]
   134|        const payload: UserPayload = JSON.parse(Buffer.from(payloadPart, 'base64').toString())
   135|        return {
   136|            id: payload.sub,
   137|            email: payload.email || 'user@ciphera.net',
   138|            totp_enabled: payload.totp_enabled || false
   139|        }
   140|    } catch {
   141|        return null
   142|    }
   143|}
   144|