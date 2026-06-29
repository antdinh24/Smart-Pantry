/**
 * services/__tests__/api.test.ts
 *
 * Unit tests for the APIService (services/api.ts).
 *
 * WHY this file matters:
 *   Every screen test mocks APIService. If the backend changes a URL, payload
 *   field name, or response shape, all screen tests still pass — they mock at
 *   the hook/service boundary and never touch real HTTP code. THIS file is the
 *   only thing that catches "wrong endpoint URL" or "wrong payload field name"
 *   bugs without a running backend.
 *
 * MOCKING STRATEGY — axios:
 *   api.ts calls `axios.create()` at module initialisation to create apiClient,
 *   then registers two interceptors on it. We replace axios.create() with a
 *   factory that returns a controlled jest mock instance.
 *
 *   The instance is exposed as `__mockInstance` on the mocked module so we can
 *   retrieve it via `jest.requireMock('axios').__mockInstance` in the test body
 *   without any hoisting issues.
 *
 *   Interceptor handler functions are captured by storing them in a plain
 *   `handlers` object inside the factory closure. This survives jest.clearAllMocks()
 *   (which only wipes jest.fn() call records, not plain object properties):
 *     mockAxios._handlers.requestFn      → request handler
 *     mockAxios._handlers.responseErrFn  → response error handler
 *
 * MOCKING STRATEGY — supabase / expo-secure-store:
 *   Already globally mocked by jest-setup.ts. We import them here to configure
 *   per-test return values with mockResolvedValue / mockRejectedValue.
 */

// ── Mock axios BEFORE api.ts is imported ──────────────────────────────────────
//
// jest.mock() is hoisted above all import statements by babel-jest, so this
// factory runs before api.ts ever calls require('axios').
//
// The instance is made callable (Object.assign(jest.fn(), ...)) because the
// response interceptor retries via `apiClient(originalRequest)` — calling the
// axios instance as a function, which is valid axios API.

jest.mock('axios', () => {
  // Plain object to hold interceptor handlers — NOT a jest.fn(), so
  // jest.clearAllMocks() cannot wipe it. Tests read handlers after beforeEach.
  const handlers: { requestFn?: any; responseErrFn?: any } = {}

  const instance = Object.assign(jest.fn(), {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn((fn: any) => { handlers.requestFn = fn }),
      },
      response: {
        // axios passes (successHandler, errorHandler) — capture the error handler
        use: jest.fn((_: any, fn: any) => { handlers.responseErrFn = fn }),
      },
    },
    // Expose via a plain property so tests can read handlers after clearAllMocks
    _handlers: handlers,
  })
  return {
    __esModule: true,
    // api.ts: import axios from 'axios' → uses .default
    default: { create: () => instance },
    // Also expose on the top-level in case of different interop
    create: () => instance,
    // Expose the instance so tests can access it via jest.requireMock
    __mockInstance: instance,
  }
})

// ── Imports (after mock registration) ─────────────────────────────────────────

import * as SecureStore from 'expo-secure-store'
import { supabase } from '../supabase'
import { APIService } from '../api'

// ── Typed references to the mock instance ─────────────────────────────────────

type MockAxiosInstance = jest.Mock & {
  get: jest.Mock
  post: jest.Mock
  put: jest.Mock
  delete: jest.Mock
  interceptors: {
    request: { use: jest.Mock }
    response: { use: jest.Mock }
  }
}

const mockAxios = (jest.requireMock('axios') as any).__mockInstance as MockAxiosInstance

// Retrieve interceptor handlers captured on first registration.
// Handlers live in mockAxios._handlers (a plain object) so they survive
// jest.clearAllMocks() which only wipes jest.fn() call records.
function requestFn(): (config: any) => Promise<any> {
  return (mockAxios as any)._handlers.requestFn
}
function responseErrFn(): (error: any) => Promise<any> {
  return (mockAxios as any)._handlers.responseErrFn
}

// ── Typed references to globally-mocked supabase ──────────────────────────────

const mockGetSession = supabase.auth.getSession as jest.Mock
const mockRefreshSession = supabase.auth.refreshSession as jest.Mock
const mockSignOut = supabase.auth.signOut as jest.Mock
const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a fake axios-style fulfilled response */
const okResponse = (data: any) => Promise.resolve({ data })

/** Configure the supabase session mock to return a valid token */
function withSession(token: string) {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: token } },
    error: null,
  })
}

/** Configure the supabase session mock to return no session */
function withNoSession() {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
}

beforeEach(() => {
  jest.clearAllMocks()
  withSession('test-token')
  mockAxios.get.mockResolvedValue({ data: {} })
  mockAxios.post.mockResolvedValue({ data: {} })
  mockAxios.put.mockResolvedValue({ data: {} })
  mockAxios.delete.mockResolvedValue({ data: {} })
})

// =============================================================================
// PANTRY ENDPOINTS — correct URL, payload, and return value
// =============================================================================

describe('APIService — pantry endpoints', () => {
  it('getPantryItems calls GET /pantry', async () => {
    mockAxios.get.mockResolvedValue(okResponse([]))
    await APIService.getPantryItems()
    expect(mockAxios.get).toHaveBeenCalledWith('/pantry')
  })

  it('getPantryItems returns the response data array', async () => {
    const items = [{ id: '1', ingredient_name: 'Eggs' }]
    mockAxios.get.mockResolvedValue(okResponse(items))
    const result = await APIService.getPantryItems()
    expect(result).toEqual(items)
  })

  it('addPantryItem calls POST /pantry with the full item object', async () => {
    const item = { ingredient_name: 'Milk', quantity: 1, unit: 'L', category: 'dairy' }
    mockAxios.post.mockResolvedValue(okResponse({ id: 'new', ...item }))
    await APIService.addPantryItem(item)
    expect(mockAxios.post).toHaveBeenCalledWith('/pantry', item)
  })

  it('addPantryItem returns the created item from the backend', async () => {
    const created = { id: 'new-id', ingredient_name: 'Milk' }
    mockAxios.post.mockResolvedValue(okResponse(created))
    const result = await APIService.addPantryItem({ ingredient_name: 'Milk' })
    expect(result).toEqual(created)
  })

  it('updatePantryItem calls PUT /pantry/:id with the updates payload', async () => {
    const updates = { quantity: 2 }
    mockAxios.put.mockResolvedValue(okResponse({ id: 'abc', ...updates }))
    await APIService.updatePantryItem('abc', updates)
    expect(mockAxios.put).toHaveBeenCalledWith('/pantry/abc', updates)
  })

  it('deletePantryItem calls DELETE /pantry/:id', async () => {
    mockAxios.delete.mockResolvedValue(okResponse(null))
    await APIService.deletePantryItem('abc')
    expect(mockAxios.delete).toHaveBeenCalledWith('/pantry/abc')
  })

  it('lookupBarcode calls GET /pantry/barcode/:barcode', async () => {
    mockAxios.get.mockResolvedValue(okResponse({ product_name: 'Milk' }))
    await APIService.lookupBarcode('012345678901')
    expect(mockAxios.get).toHaveBeenCalledWith('/pantry/barcode/012345678901')
  })

  it('syncPantryItems calls POST /pantry/sync wrapping items in { items }', async () => {
    const items = [{ id: '1' }]
    mockAxios.post.mockResolvedValue(okResponse({ synced: 1 }))
    await APIService.syncPantryItems(items)
    expect(mockAxios.post).toHaveBeenCalledWith('/pantry/sync', { items })
  })
})

// =============================================================================
// RECIPE ENDPOINTS
// =============================================================================

describe('APIService — recipe endpoints', () => {
  it('getRecipeSuggestions calls GET /recipes/suggestions', async () => {
    mockAxios.get.mockResolvedValue(okResponse([]))
    await APIService.getRecipeSuggestions()
    expect(mockAxios.get).toHaveBeenCalledWith('/recipes/suggestions')
  })

  it('getRecipe calls GET /recipes/:id', async () => {
    mockAxios.get.mockResolvedValue(okResponse({ id: 'r1', title: 'Pasta' }))
    await APIService.getRecipe('r1')
    expect(mockAxios.get).toHaveBeenCalledWith('/recipes/r1')
  })

  it('getRecipe returns the recipe data', async () => {
    const recipe = { id: 'r1', title: 'Pasta', match_percentage: 80 }
    mockAxios.get.mockResolvedValue(okResponse(recipe))
    expect(await APIService.getRecipe('r1')).toEqual(recipe)
  })

  it('generateRecipe calls POST /recipes/generate with ingredients + preferences', async () => {
    mockAxios.post.mockResolvedValue(okResponse({ id: 'r2' }))
    await APIService.generateRecipe(['eggs', 'milk'], { cuisine: 'Italian' })
    expect(mockAxios.post).toHaveBeenCalledWith('/recipes/generate', {
      ingredients: ['eggs', 'milk'],
      preferences: { cuisine: 'Italian' },
    })
  })

  it('generateRecipe sends undefined preferences when omitted', async () => {
    mockAxios.post.mockResolvedValue(okResponse({ id: 'r2' }))
    await APIService.generateRecipe(['eggs'])
    expect(mockAxios.post).toHaveBeenCalledWith('/recipes/generate', {
      ingredients: ['eggs'],
      preferences: undefined,
    })
  })

  it('calculateRecipeMatch calls GET /recipes/:id/match', async () => {
    mockAxios.get.mockResolvedValue(okResponse({ match_percentage: 75 }))
    await APIService.calculateRecipeMatch('r1')
    expect(mockAxios.get).toHaveBeenCalledWith('/recipes/r1/match')
  })
})

// =============================================================================
// RECEIPT ENDPOINTS
// =============================================================================

describe('APIService — receipt endpoints', () => {
  it('scanReceipt calls POST /receipts/scan with image_base64 field', async () => {
    const b64 = 'abc123=='
    mockAxios.post.mockResolvedValue(okResponse({ receipt_id: 'rec1' }))
    await APIService.scanReceipt(b64)
    expect(mockAxios.post).toHaveBeenCalledWith('/receipts/scan', { image_base64: b64 })
  })

  it('confirmReceipt calls POST /receipts/confirm with receipt_id and line_items', async () => {
    const lineItems = [{ name: 'Eggs', quantity: '12' }]
    mockAxios.post.mockResolvedValue(okResponse({ confirmed: true }))
    await APIService.confirmReceipt('rec1', lineItems)
    expect(mockAxios.post).toHaveBeenCalledWith('/receipts/confirm', {
      receipt_id: 'rec1',
      line_items: lineItems,
    })
  })

  it('getReceipts calls GET /receipts with optional date query params', async () => {
    mockAxios.get.mockResolvedValue(okResponse([]))
    await APIService.getReceipts('2025-01-01', '2025-01-31')
    expect(mockAxios.get).toHaveBeenCalledWith('/receipts', {
      params: { start_date: '2025-01-01', end_date: '2025-01-31' },
    })
  })
})

// =============================================================================
// UTILITY ENDPOINTS
// =============================================================================

describe('APIService — utility endpoints', () => {
  it('healthCheck calls GET /health', async () => {
    mockAxios.get.mockResolvedValue(okResponse({ status: 'ok' }))
    await APIService.healthCheck()
    expect(mockAxios.get).toHaveBeenCalledWith('/health')
  })

  it('getSubscriptionStatus calls GET /subscription/status', async () => {
    mockAxios.get.mockResolvedValue(okResponse({ tier: 'free' }))
    await APIService.getSubscriptionStatus()
    expect(mockAxios.get).toHaveBeenCalledWith('/subscription/status')
  })

  it('createCheckoutSession calls POST /subscription/checkout', async () => {
    mockAxios.post.mockResolvedValue(okResponse({ url: 'https://stripe.com/session' }))
    await APIService.createCheckoutSession()
    expect(mockAxios.post).toHaveBeenCalledWith('/subscription/checkout')
  })

  it('getBudgetSummary calls GET /budget/summary/:month', async () => {
    mockAxios.get.mockResolvedValue(okResponse({ total: 120 }))
    await APIService.getBudgetSummary('2025-01')
    expect(mockAxios.get).toHaveBeenCalledWith('/budget/summary/2025-01')
  })
})

// =============================================================================
// REQUEST INTERCEPTOR — auth header injection
// =============================================================================

describe('Request interceptor — auth header', () => {
  it('adds Authorization Bearer header when a Supabase session exists', async () => {
    withSession('my-access-token')
    const config: any = { headers: {} }

    const result = await requestFn()(config)

    expect(result.headers.Authorization).toBe('Bearer my-access-token')
  })

  it('does NOT add Authorization header when there is no session', async () => {
    withNoSession()
    const config: any = { headers: {} }

    const result = await requestFn()(config)

    expect(result.headers.Authorization).toBeUndefined()
  })

  it('passes the rest of the config through unchanged', async () => {
    withSession('tok')
    const config: any = { headers: {}, url: '/pantry', method: 'get' }

    const result = await requestFn()(config)

    expect(result.url).toBe('/pantry')
    expect(result.method).toBe('get')
  })
})

// =============================================================================
// RESPONSE INTERCEPTOR — 401 retry flow
// =============================================================================

describe('Response interceptor — 401 retry: success path', () => {
  it('calls refreshSession when a 401 response is received', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'refreshed-token' } },
      error: null,
    })
    mockAxios.mockResolvedValue({ data: {} })

    const error = { response: { status: 401 }, config: { headers: {}, _retry: undefined } }
    await responseErrFn()(error).catch(() => {})

    expect(mockRefreshSession).toHaveBeenCalledTimes(1)
  })

  it('writes the new access token to SecureStore after a successful refresh', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'new-token' } },
      error: null,
    })
    mockAxios.mockResolvedValue({ data: {} })

    const error = { response: { status: 401 }, config: { headers: {}, _retry: undefined } }
    await responseErrFn()(error)

    expect(mockSetItemAsync).toHaveBeenCalledWith('auth.token', 'new-token')
  })

  it('retries the original request with the updated Authorization header', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'new-token' } },
      error: null,
    })
    const retryData = { data: { items: [] } }
    mockAxios.mockResolvedValue(retryData)

    const config = { headers: {} as Record<string, string>, _retry: undefined }
    const error = { response: { status: 401 }, config }

    const result = await responseErrFn()(error)

    // apiClient(originalRequest) was called as a function — captured by the callable mock
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer new-token' }),
      })
    )
    expect(result).toEqual(retryData)
  })

  it('sets _retry = true on the original config to block a second retry', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'new-token' } },
      error: null,
    })
    mockAxios.mockResolvedValue({ data: {} })

    const config: any = { headers: {}, _retry: undefined }
    await responseErrFn()({ response: { status: 401 }, config })

    expect(config._retry).toBe(true)
  })

  it('rejects immediately (no refresh) when _retry is already true', async () => {
    const error = { response: { status: 401 }, config: { headers: {}, _retry: true } }

    await expect(responseErrFn()(error)).rejects.toMatchObject({ response: { status: 401 } })
    expect(mockRefreshSession).not.toHaveBeenCalled()
  })
})

// =============================================================================
// RESPONSE INTERCEPTOR — refresh failure → sign out
// =============================================================================

describe('Response interceptor — 401 retry: refresh failure', () => {
  it('calls signOut when refreshSession returns an error', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Refresh token expired' },
    })

    const error = { response: { status: 401 }, config: { headers: {}, _retry: undefined } }
    await responseErrFn()(error).catch(() => {})

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('clears all four auth keys from SecureStore when refresh fails', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Expired' },
    })

    const error = { response: { status: 401 }, config: { headers: {}, _retry: undefined } }
    await responseErrFn()(error).catch(() => {})

    // StorageService.clearAuth() removes these four keys
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth.token')
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth.refresh_token')
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth.user_id')
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('auth.email')
  })

  it('calls signOut when refreshSession itself throws unexpectedly', async () => {
    mockRefreshSession.mockRejectedValue(new Error('Network failure during refresh'))

    const error = { response: { status: 401 }, config: { headers: {}, _retry: undefined } }
    await responseErrFn()(error).catch(() => {})

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// RESPONSE INTERCEPTOR — non-401 errors pass through unchanged
// =============================================================================

describe('Response interceptor — non-401 errors pass through', () => {
  it.each([403, 404, 422, 500, 503])(
    'rejects without calling refreshSession for a %d response',
    async (status) => {
      const error = { response: { status }, config: { headers: {}, _retry: undefined } }

      await expect(responseErrFn()(error)).rejects.toBe(error)
      expect(mockRefreshSession).not.toHaveBeenCalled()
    }
  )
})
