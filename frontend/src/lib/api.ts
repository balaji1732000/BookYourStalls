import type { BookingCreate, BookingRead, EventCreate, EventDetail, EventListResponse, Stall, StallPackageCreate, User } from '../types'

export interface EventFilters {
  q?: string
  city?: string
  crowd_type?: string
  category?: string
  vendor_category?: string
  start_date_from?: string
  start_date_to?: string
  min_footfall?: number
  max_footfall?: number
  min_stall_price?: number
  max_stall_price?: number
}

export interface OtpRequestPayload {
  email: string
}

export interface OtpRequestResponse {
  challenge_id: string
  expires_in_seconds: number
  resend_after_seconds: number
}

export interface OtpVerifyPayload {
  challenge_id: string
  email: string
  otp: string
}

export interface OtpVerifyResponse {
  access_token: string
  token_type: string
  user: User
  is_new_user: boolean
  requires_profile_completion: boolean
}

export interface ProfileCompletePayload {
  name: string
  phone: string
  city: string
  onboarding_intent: string
  business_name?: string
  business_category?: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const API_PREFIX = '/api/v1'
const TOKEN_KEY = 'bys_token'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    Object.defineProperty(this, 'message', { value: message, enumerable: true, configurable: true })
    this.status = status
  }
}

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token)
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY)
  },
}

function validationPath(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  return loc.filter((part) => part !== 'body' && part !== 'query' && part !== 'path').join('.')
}

function errorMessage(data: unknown, response: Response): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = detail.map((item) => {
        if (item && typeof item === 'object') {
          const { loc, msg } = item as { loc?: unknown; msg?: unknown }
          if (typeof msg === 'string') {
            const path = validationPath(loc)
            return path ? `${path}: ${msg}` : msg
          }
        }
        return typeof item === 'string' ? item : null
      }).filter(Boolean)
      if (messages.length) return messages.join('; ')
    }
  }
  return response.statusText || 'Request failed'
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...options,
    headers,
  })

  const data = await parseResponse(response)

  if (!response.ok) {
    throw new ApiError(errorMessage(data, response), response.status)
  }

  return data as T
}

export interface RegisterPayload {
  name: string
  email: string
  phone?: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
}

function queryString(filters: EventFilters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const apiClient = {
  async register(payload: RegisterPayload): Promise<User> {
    return request<User>('/auth/register', { method: 'POST', body: JSON.stringify(payload) })
  },
  async login(payload: LoginPayload): Promise<void> {
    const response = await request<{ access_token: string; token_type: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    authStorage.setToken(response.access_token)
  },
  async requestOtp(payload: OtpRequestPayload): Promise<OtpRequestResponse> {
    return request<OtpRequestResponse>('/auth/otp/request', { method: 'POST', body: JSON.stringify(payload) })
  },
  async verifyOtp(payload: OtpVerifyPayload): Promise<OtpVerifyResponse> {
    const response = await request<OtpVerifyResponse>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    authStorage.setToken(response.access_token)
    return response
  },
  async me(): Promise<User> {
    return request<User>('/auth/me')
  },
  async completeProfile(payload: ProfileCompletePayload): Promise<User> {
    return request<User>('/auth/me/profile', { method: 'PUT', body: JSON.stringify(payload) })
  },
  async listEvents(filters: EventFilters = {}): Promise<EventListResponse> {
    return request<EventListResponse>(`/events${queryString(filters)}`)
  },
  async myEvents(): Promise<EventListResponse> {
    return request<EventListResponse>('/events/mine')
  },
  async createEvent(payload: EventCreate): Promise<EventDetail> {
    return request<EventDetail>('/events', { method: 'POST', body: JSON.stringify(payload) })
  },
  async publishEvent(eventId: number): Promise<EventDetail> {
    return request<EventDetail>(`/events/${eventId}/publish`, { method: 'POST' })
  },
  async eventDetail(eventId: number): Promise<EventDetail> {
    return request<EventDetail>(`/events/${eventId}/detail`)
  },
  async createStallPackage(eventId: number, payload: StallPackageCreate): Promise<Stall[]> {
    return request<Stall[]>(`/events/${eventId}/stall-packages`, { method: 'POST', body: JSON.stringify(payload) })
  },
  async createBooking(payload: BookingCreate): Promise<BookingRead> {
    return request<BookingRead>('/bookings', { method: 'POST', body: JSON.stringify(payload) })
  },
  async listBookings(): Promise<BookingRead[]> {
    return request<BookingRead[]>('/bookings')
  },
}
