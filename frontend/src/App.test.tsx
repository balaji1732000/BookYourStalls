import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const eventsPayload = {
  total: 1,
  items: [
    {
      id: 10,
      organizer_id: 1,
      title: 'Chennai Summer Expo',
      description: 'High footfall shopping expo',
      city: 'Chennai',
      venue_name: 'Trade Centre',
      venue_address: 'Nandambakkam',
      start_date: '2026-06-01',
      end_date: '2026-06-03',
      crowd_type: 'families',
      expected_footfall: 10000,
      category: 'Shopping expo',
      categories: ['Shopping expo', 'Thrift/vintage market'],
      allowed_vendor_categories: ['Clothing', 'Thrift/vintage clothing'],
      banner_image_url: null,
      status: 'published',
      created_at: '2026-05-10T00:00:00',
      updated_at: '2026-05-10T00:00:00',
    },
  ],
}

const nullFootfallEventsPayload = {
  total: 1,
  items: [
    {
      ...eventsPayload.items[0],
      id: 11,
      title: 'Mystery Expo',
      expected_footfall: null,
    },
  ],
}

const detailPayload = {
  ...eventsPayload.items[0],
  stalls: [
    {
      id: 7, event_id: 10, stall_code: 'A1', title: 'Prime Stall', description: 'Near entrance', size: '10x10', zone: 'Entrance', price: 25000, amenities: 'Power, table', layout_image_url: null, status: 'available', created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00',
    },
  ],
}

const groupedDetailPayload = {
  ...eventsPayload.items[0],
  organizer_id: 3,
  stalls: [
    { id: 21, event_id: 10, stall_code: 'B01', title: 'Budget Stall', description: 'Best for thrift and handmade', size: '8x8 ft', zone: 'Zone B', price: 8000, amenities: 'table, chair, basic lighting', layout_image_url: null, status: 'available', created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' },
    { id: 22, event_id: 10, stall_code: 'B02', title: 'Budget Stall', description: 'Best for thrift and handmade', size: '8x8 ft', zone: 'Zone B', price: 8000, amenities: 'table, chair, basic lighting', layout_image_url: null, status: 'available', created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' },
    { id: 23, event_id: 10, stall_code: 'B03', title: 'Budget Stall', description: 'Best for thrift and handmade', size: '8x8 ft', zone: 'Zone B', price: 8000, amenities: 'table, chair, basic lighting', layout_image_url: null, status: 'booked', created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' },
    { id: 31, event_id: 10, stall_code: 'P01', title: 'Premium Stall', description: 'Best for high-footfall brands', size: '12x12 ft', zone: 'Entrance', price: 25000, amenities: '2 chairs, power, branding space', layout_image_url: null, status: 'available', created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' },
  ],
}

describe('Book Your Stall frontend', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    window.history.pushState({}, '', '/')
  })

  it('logs in with email OTP flow and stores the returned session', async () => {
    window.history.pushState({}, '', '/login')
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/otp/request') && options?.method === 'POST') {
        expect(JSON.parse(String(options.body))).toEqual({ email: 'balaji@example.com' })
        return Promise.resolve(new Response(JSON.stringify({ challenge_id: 'challenge-1', expires_in_seconds: 300, resend_after_seconds: 45 }), { status: 200 }))
      }
      if (url.includes('/auth/otp/verify') && options?.method === 'POST') {
        expect(JSON.parse(String(options.body))).toEqual({ challenge_id: 'challenge-1', email: 'balaji@example.com', otp: '123456' })
        return Promise.resolve(new Response(JSON.stringify({
          access_token: 'otp-token',
          token_type: 'bearer',
          is_new_user: true,
          user: { id: 9, name: 'balaji', email: 'balaji@example.com', phone: null, email_verified_at: '2026-05-10T00:00:00', phone_verified_at: null, role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' },
        }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.type(screen.getByLabelText(/email address/i), 'balaji@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send login code/i }))

    expect(await screen.findByText(/login code sent/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/enter login code/i), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify.*continue/i }))

    await waitFor(() => expect(localStorage.getItem('bys_token')).toBe('otp-token'))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/otp/request'))).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/otp/verify'))).toBe(true)
  })

  it('shows event listing with filters and event cards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(eventsPayload), { status: 200 })))

    render(<App />)

    expect(screen.getByRole('heading', { name: /book your perfect stall/i })).toBeInTheDocument()
    expect(await screen.findByText('Chennai Summer Expo')).toBeInTheDocument()
    expect(screen.getByText('1 event available')).toBeInTheDocument()
    expect(screen.getByText('Trade Centre')).toBeInTheDocument()
  })

  it('opens event detail and submits a booking request as logged-in vendor', async () => {
    localStorage.setItem('bys_token', 'token-1')
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 2, name: 'Balaji', email: 'b@example.com', phone: '9999999999', role: 'vendor', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(detailPayload), { status: 200 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      if (url.includes('/bookings') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 99, event_id: 10, stall_id: 7, vendor_id: 2, booking_reference: 'BYS-ABC', status: 'pending', business_name: 'Yuneekway', contact_name: 'Balaji', contact_phone: '9999999999', notes: 'Vintage clothing stall', total_amount: 25000, created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' }), { status: 201 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    expect(await screen.findByRole('heading', { name: 'Chennai Summer Expo' })).toBeInTheDocument()

    const stallCard = screen.getByTestId('stall-package-Prime Stall-Entrance-25000')
    await userEvent.click(within(stallCard).getByRole('button', { name: /request booking/i }))
    await userEvent.type(screen.getByLabelText(/business name/i), 'Yuneekway')
    await userEvent.type(screen.getByLabelText(/contact name/i), 'Balaji')
    await userEvent.type(screen.getByLabelText(/contact phone/i), '9999999999')
    await userEvent.type(screen.getByLabelText(/notes/i), 'Vintage clothing stall')
    await userEvent.click(screen.getByRole('button', { name: /submit booking request/i }))

    await waitFor(() => expect(screen.getByText(/booking request submitted/i)).toBeInTheDocument())
    const bookingCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/bookings'))
    expect(bookingCall?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-1' })
  })

  it('clears stale events and total when a filter request fails', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('city=Chennai')) return Promise.resolve(new Response(JSON.stringify({ detail: 'Filter failed' }), { status: 500 }))
      return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByText('Chennai Summer Expo')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /cchennai/i }))

    expect(await screen.findByText('Filter failed')).toBeInTheDocument()
    expect(screen.getByText('0 events available')).toBeInTheDocument()
    expect(screen.queryByText('Chennai Summer Expo')).not.toBeInTheDocument()
  })

  it('uses search-first discovery with quick chips, selected filters, and city carousel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const searchInput = screen.getByLabelText(/search events, city, category or vendor type/i)
    await screen.findByText('Chennai Summer Expo')

    await userEvent.type(searchInput, '  thrift chennai  ')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=thrift+chennai'))).toBe(true))
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('%20%20thrift'))).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /bbangalore/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('city=Bangalore'))).toBe(true))
    expect(screen.getByRole('button', { name: /remove bangalore filter/i })).toBeInTheDocument()

    await userEvent.click(within(screen.getByLabelText(/popular searches/i)).getByRole('button', { name: /thrift/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('category=Thrift%2Fvintage+market'))).toBe(true))
    expect(screen.getByRole('button', { name: /remove thrift\/vintage market filter/i })).toBeInTheDocument()
  })

  it('does not render duplicated footfall fallback text when expected footfall is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(nullFootfallEventsPayload), { status: 200 })))

    render(<App />)

    expect(await screen.findByText('Mystery Expo')).toBeInTheDocument()
    expect(screen.getByText(/footfall tba/i)).toBeInTheDocument()
    expect(screen.queryByText(/footfall tba footfall/i)).not.toBeInTheDocument()
  })

  it('renders an invalid event route message without fetching /events/NaN/detail', async () => {
    window.history.pushState({}, '', '/events/foo')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(screen.getByText(/invalid event link/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/events/NaN/detail'))).toBe(true)
  })

  it('opens the saved page from bottom navigation instead of returning home', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(eventsPayload), { status: 200 })))

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /saved/i }))

    expect(screen.getByRole('heading', { name: /saved events/i })).toBeInTheDocument()
    expect(screen.getByText(/your saved event list is empty/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /book your perfect stall/i })).not.toBeInTheDocument()
  })

  it('asks users to login on My Events instead of calling protected API without a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /my events/i }))

    const loginPrompt = screen.getByText(/please login to view your events/i).closest('section') as HTMLElement
    expect(loginPrompt).toBeInTheDocument()
    expect(within(loginPrompt).getByRole('link', { name: /login/i })).toHaveAttribute('href', '/login')
    expect(screen.queryByText(/missing bearer token/i)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/events/mine'))).toBe(true)
  })

  it('opens the menu page with login and register links from bottom navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(eventsPayload), { status: 200 })))

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /menu/i }))

    const menuCard = screen.getByRole('heading', { name: /menu/i }).closest('section') as HTMLElement
    expect(within(menuCard).getByRole('link', { name: /login/i })).toHaveAttribute('href', '/login')
    expect(within(menuCard).getByRole('link', { name: /create account/i })).toHaveAttribute('href', '/register')
    expect(within(menuCard).getByText(/testvendor@example.com/i)).toBeInTheDocument()
    expect(within(menuCard).getByText(/testorganizer@example.com/i)).toBeInTheDocument()
    expect(within(menuCard).getByText(/TestPass123!/i)).toBeInTheDocument()
  })

  it('opens notifications from the bell button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(eventsPayload), { status: 200 })))

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /notifications/i }))

    expect(screen.getByRole('heading', { level: 1, name: /notifications/i })).toBeInTheDocument()
    expect(screen.getByText(/please login to view notifications/i)).toBeInTheDocument()
  })

  it('opens create event from the plus button, publishes it, and shows it on home', async () => {
    localStorage.setItem('bys_token', 'organizer-token')
    const createdEvent = { ...eventsPayload.items[0], id: 44, title: 'Creator Expo', venue_name: 'Creator Hall', start_date: '2026-12-01', end_date: '2026-12-02', status: 'draft' }
    const publishedEvent = { ...createdEvent, status: 'published' }
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 3, name: 'Test Organizer', email: 'testorganizer@example.com', phone: '9000001002', role: 'organizer', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.endsWith('/events') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify(createdEvent), { status: 201 }))
      if (url.endsWith('/events/44/publish') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify(publishedEvent), { status: 200 }))
      if (url.endsWith('/events')) return Promise.resolve(new Response(JSON.stringify({ total: 2, items: [eventsPayload.items[0], publishedEvent] }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /create event/i }))
    expect(await screen.findByRole('heading', { name: /create event/i })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/^title/i), 'Creator Expo')
    await userEvent.selectOptions(screen.getByLabelText(/^city/i), 'Chennai')
    await userEvent.type(screen.getByLabelText(/venue name/i), 'Creator Hall')
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-12-01')
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-12-02')
    await userEvent.selectOptions(screen.getByLabelText(/crowd type/i), 'Families')
    await userEvent.click(screen.getByRole('checkbox', { name: /shopping expo/i }))
    await userEvent.click(screen.getByRole('button', { name: /create event/i }))

    expect(await screen.findByRole('heading', { name: /book your perfect stall/i })).toBeInTheDocument()
    expect(await screen.findByText('Creator Expo')).toBeInTheDocument()
    const createCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/events') && options?.method === 'POST')
    const publishCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/events/44/publish') && options?.method === 'POST')
    expect(createCall?.[1]?.headers).toMatchObject({ Authorization: 'Bearer organizer-token' })
    expect(publishCall?.[1]?.headers).toMatchObject({ Authorization: 'Bearer organizer-token' })
  })

  it('saves an event with the heart button and shows it on the saved page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(eventsPayload), { status: 200 })))

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /save chennai summer expo/i }))
    await userEvent.click(screen.getByRole('link', { name: /saved/i }))

    expect(screen.getByRole('heading', { name: /saved events/i })).toBeInTheDocument()
    expect(screen.getByText('Chennai Summer Expo')).toBeInTheDocument()
    expect(screen.queryByText(/your saved event list is empty/i)).not.toBeInTheDocument()
  })

  it('prevents duplicate booking submissions while a submit is pending', async () => {
    localStorage.setItem('bys_token', 'token-1')
    let resolveBooking: (response: Response) => void = () => undefined
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 2, name: 'Balaji', email: 'b@example.com', phone: '9999999999', role: 'vendor', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(detailPayload), { status: 200 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      if (url.includes('/bookings') && options?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveBooking = resolve })
      }
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    await userEvent.click(await screen.findByRole('button', { name: /request booking/i }))
    await userEvent.type(screen.getByLabelText(/business name/i), 'Yuneekway')
    await userEvent.type(screen.getByLabelText(/contact name/i), 'Balaji')
    await userEvent.type(screen.getByLabelText(/contact phone/i), '9999999999')

    const submitButton = screen.getByRole('button', { name: /submit booking request/i })
    await userEvent.click(submitButton)
    expect(await screen.findByRole('button', { name: /submitting/i })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /submitting/i }))

    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/bookings')).length).toBe(1)
    resolveBooking(new Response(JSON.stringify({ id: 99, event_id: 10, stall_id: 7, vendor_id: 2, booking_reference: 'BYS-ABC', status: 'pending', business_name: 'Yuneekway', contact_name: 'Balaji', contact_phone: '9999999999', notes: '', total_amount: 25000, created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' }), { status: 201 }))
    expect(await screen.findByRole('heading', { name: /my conducted events/i })).toBeInTheDocument()
    expect(sessionStorage.getItem('bys_last_booking_reference')).toBe('BYS-ABC')
  })

  it('shows auth checking state and avoids false vendor denial while token bootstrap is pending', async () => {
    localStorage.setItem('bys_token', 'token-1')
    let resolveMe: (response: Response) => void = () => undefined
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/me')) {
        return new Promise<Response>((resolve) => { resolveMe = resolve })
      }
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(detailPayload), { status: 200 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    await userEvent.click(await screen.findByRole('button', { name: /request booking/i }))

    expect(screen.getAllByText(/checking authentication/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /checking authentication/i })).toBeDisabled()
    expect(screen.queryByText(/please login as vendor/i)).not.toBeInTheDocument()

    resolveMe(new Response(JSON.stringify({ id: 2, name: 'Balaji', email: 'b@example.com', phone: '9999999999', role: 'vendor', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
    expect(await screen.findByRole('button', { name: /submit booking request/i })).toBeInTheDocument()
  })

  it('groups repeated stalls into package cards with availability counts', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(groupedDetailPayload), { status: 200 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))

    const budgetPackage = await screen.findByTestId('stall-package-Budget Stall-Zone B-8000')
    expect(within(budgetPackage).getByRole('heading', { name: /budget stall/i })).toBeInTheDocument()
    expect(within(budgetPackage).getByText(/2 available of 3/i)).toBeInTheDocument()
    expect(within(budgetPackage).getByText(/B01, B02/i)).toBeInTheDocument()
    expect(screen.getByTestId('stall-package-Premium Stall-Entrance-25000')).toBeInTheDocument()
    expect(screen.queryByTestId('stall-21')).not.toBeInTheDocument()
  })

  it('lets an event owner generate many stalls from one package form', async () => {
    localStorage.setItem('bys_token', 'organizer-token')
    const generatedStalls = groupedDetailPayload.stalls.slice(0, 3).map((stall) => ({ ...stall, status: 'available' }))
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 3, name: 'Test Organizer', email: 'testorganizer@example.com', phone: '9000001002', role: 'organizer', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify({ ...groupedDetailPayload, stalls: [] }), { status: 200 }))
      if (url.endsWith('/events/10/stall-packages') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify(generatedStalls), { status: 201 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    expect(await screen.findByRole('heading', { name: /generate stall package/i })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/package name/i), 'Budget Stall')
    await userEvent.type(screen.getByLabelText(/size/i), '8x8 ft')
    await userEvent.type(screen.getByLabelText(/zone/i), 'Zone B')
    await userEvent.type(screen.getByLabelText(/price/i), '8000')
    await userEvent.type(screen.getByLabelText(/quantity/i), '3')
    await userEvent.type(screen.getByLabelText(/code prefix/i), 'B')
    await userEvent.type(screen.getByLabelText(/includes/i), 'table, chair, basic lighting')
    await userEvent.click(screen.getByRole('button', { name: /generate stalls/i }))

    expect(await screen.findByText(/generated 3 stalls/i)).toBeInTheDocument()
    const packageCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/events/10/stall-packages') && options?.method === 'POST')
    expect(JSON.parse(String(packageCall?.[1]?.body))).toMatchObject({ title: 'Budget Stall', quantity: 3, code_prefix: 'B' })
  })

  it('allows organizer owner to submit a customer booking without vendor-login error', async () => {
    localStorage.setItem('bys_token', 'organizer-token')
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 3, name: 'Test Organizer', email: 'testorganizer@example.com', phone: '9000001002', role: 'organizer', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(groupedDetailPayload), { status: 200 }))
      if (url.includes('/bookings') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 101, event_id: 10, stall_id: 21, vendor_id: 3, booking_reference: 'BYS-ORG', status: 'pending', business_name: 'Yuneekway', contact_name: 'Balaji', contact_phone: '6383954887', notes: 'Vintage thrifted clothes', total_amount: 8000, created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' }), { status: 201 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    await userEvent.click(await screen.findByRole('button', { name: /add customer booking for budget stall/i }))
    await userEvent.type(screen.getByLabelText(/business name/i), 'Yuneekway')
    await userEvent.type(screen.getByLabelText(/contact name/i), 'Balaji')
    await userEvent.type(screen.getByLabelText(/contact phone/i), '6383954887')
    await userEvent.click(screen.getByRole('button', { name: /submit booking request/i }))

    expect(await screen.findByText(/booking request submitted/i)).toBeInTheDocument()
    expect(screen.queryByText(/please login as vendor/i)).not.toBeInTheDocument()
  })

  it('closes the booking form when the user logs out', async () => {
    localStorage.setItem('bys_token', 'token-1')
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 2, name: 'Balaji', email: 'b@example.com', phone: '9999999999', role: 'vendor', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(detailPayload), { status: 200 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    await userEvent.click(await screen.findByRole('button', { name: /request booking/i }))
    expect(screen.getByRole('heading', { name: /request prime stall/i })).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: /logout/i }))

    expect(screen.queryByRole('heading', { name: /request prime stall/i })).not.toBeInTheDocument()
  })

  it('registers a member account without exposing role selection or sending role payload', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/register') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 9, name: 'Balaji', email: 'balaji@example.com', phone: '6383954887', role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 201 }))
      if (url.includes('/auth/login') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ access_token: 'member-token', token_type: 'bearer' }), { status: 200 }))
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 9, name: 'Balaji', email: 'balaji@example.com', phone: '6383954887', role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /menu/i }))
    await userEvent.click(screen.getByRole('link', { name: /create account/i }))

    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/name/i), 'Balaji')
    await userEvent.type(screen.getByLabelText(/email/i), 'balaji@example.com')
    await userEvent.type(screen.getByLabelText(/phone/i), '6383954887')
    await userEvent.type(screen.getByLabelText(/password/i), 'StrongPass123')
    await userEvent.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => expect(localStorage.getItem('bys_token')).toBe('member-token'))
    const registerCall = fetchMock.mock.calls.find(([url, options]) => String(url).includes('/auth/register') && options?.method === 'POST')
    expect(JSON.parse(String(registerCall?.[1]?.body))).not.toHaveProperty('role')
  })

  it('lets a member create an event with suggested and custom event categories only', async () => {
    localStorage.setItem('bys_token', 'member-token')
    const createdEvent = { ...eventsPayload.items[0], id: 44, title: 'Creator Expo', venue_name: 'Creator Hall', start_date: '2026-12-01', end_date: '2026-12-02', status: 'draft', categories: ['Shopping expo', 'Vintage sneaker meetup'], allowed_vendor_categories: [] }
    const publishedEvent = { ...createdEvent, status: 'published' }
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 3, name: 'Balaji', email: 'balaji@example.com', phone: '9000001002', role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.endsWith('/events') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify(createdEvent), { status: 201 }))
      if (url.endsWith('/events/44/publish') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify(publishedEvent), { status: 200 }))
      if (url.endsWith('/events')) return Promise.resolve(new Response(JSON.stringify({ total: 2, items: [eventsPayload.items[0], publishedEvent] }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /create event/i }))
    expect(await screen.findByRole('heading', { name: /create event/i })).toBeInTheDocument()
    expect(screen.queryByText(/allowed vendor categories/i)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/^title/i), 'Creator Expo')
    await userEvent.selectOptions(screen.getByLabelText(/^city/i), 'Chennai')
    await userEvent.type(screen.getByLabelText(/venue name/i), 'Creator Hall')
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-12-01')
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-12-02')
    await userEvent.selectOptions(screen.getByLabelText(/crowd type/i), 'Families')
    await userEvent.type(screen.getByLabelText(/expected footfall/i), '10000')
    await userEvent.click(screen.getByRole('checkbox', { name: /shopping expo/i }))
    await userEvent.type(screen.getByLabelText(/add custom event category/i), 'Vintage sneaker meetup')
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    expect(screen.getByRole('checkbox', { name: /vintage sneaker meetup/i })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /create event/i }))

    await screen.findByRole('heading', { name: /book your perfect stall/i })
    const createCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/events') && options?.method === 'POST')
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      categories: ['Shopping expo', 'Vintage sneaker meetup'],
      crowd_type: 'Families',
    })
    expect(JSON.parse(String(createCall?.[1]?.body))).not.toHaveProperty('allowed_vendor_categories')
  })

  it('presents create event as mobile-friendly sections with category chips', async () => {
    localStorage.setItem('bys_token', 'member-token')
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 3, name: 'Balaji', email: 'balaji@example.com', phone: '9000001002', role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    }))

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /create event/i }))

    const eventForm = await screen.findByRole('form', { name: /create event/i })
    expect(eventForm).toHaveClass('event-builder')
    expect(screen.getByText(/1/i).closest('.form-step-card')).toHaveTextContent(/event basics/i)
    expect(screen.getByText(/2/i).closest('.form-step-card')).toHaveTextContent(/event type/i)
    expect(screen.getByRole('checkbox', { name: /shopping expo/i }).closest('.category-chip')).toBeInTheDocument()
  })

  it('shows a vendor-friendly booking panel with package summary before request fields', async () => {
    localStorage.setItem('bys_token', 'member-token')
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 2, name: 'Balaji', email: 'b@example.com', phone: '9999999999', role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(detailPayload), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
    }))

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    await userEvent.click(await screen.findByRole('button', { name: /request booking/i }))

    const bookingPanel = await screen.findByRole('form', { name: /request stall booking/i })
    expect(bookingPanel).toHaveClass('booking-panel')
    expect(screen.getByText(/selected package/i).closest('.booking-summary-card')).toHaveTextContent(/pending organizer approval/i)
    expect(screen.getByText(/your business details/i)).toBeInTheDocument()
  })

  it('shows booking submitted tick screen and redirects to conducted events', async () => {
    localStorage.setItem('bys_token', 'member-token')
    const myEventsPayload = { total: 1, items: [{ ...eventsPayload.items[0], organizer_id: 2, title: 'My Conducted Expo' }] }
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 2, name: 'Balaji', email: 'b@example.com', phone: '9999999999', role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(detailPayload), { status: 200 }))
      if (url.includes('/events/mine')) return Promise.resolve(new Response(JSON.stringify(myEventsPayload), { status: 200 }))
      if (url.includes('/bookings') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 99, event_id: 10, stall_id: 7, vendor_id: 2, booking_reference: 'BYS-TICK', status: 'pending', business_name: 'Yuneekway', contact_name: 'Balaji', contact_phone: '9999999999', notes: 'Vintage clothing stall', total_amount: 25000, created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' }), { status: 201 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    await userEvent.click(await screen.findByRole('button', { name: /request booking/i }))
    await userEvent.type(screen.getByLabelText(/business name/i), 'Yuneekway')
    await userEvent.type(screen.getByLabelText(/contact name/i), 'Balaji')
    await userEvent.type(screen.getByLabelText(/contact phone/i), '9999999999')
    await userEvent.click(screen.getByRole('button', { name: /submit booking request/i }))

    expect(await screen.findByText('✅')).toBeInTheDocument()
    expect(screen.getByText(/booking request submitted/i)).toBeInTheDocument()
    expect(screen.getByText(/BYS-TICK/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /my conducted events/i })).toBeInTheDocument()
    expect(await screen.findByText('My Conducted Expo')).toBeInTheDocument()
  })

  it('reveals organiser phone to vendor after booking request is submitted', async () => {
    localStorage.setItem('bys_token', 'member-token')
    const myEventsPayload = { total: 0, items: [] }
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 2, name: 'Balaji', email: 'b@example.com', phone: '9999999999', role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/10/detail')) return Promise.resolve(new Response(JSON.stringify(detailPayload), { status: 200 }))
      if (url.includes('/events/mine')) return Promise.resolve(new Response(JSON.stringify(myEventsPayload), { status: 200 }))
      if (url.includes('/bookings') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 99, event_id: 10, stall_id: 7, vendor_id: 2, booking_reference: 'BYS-CONNECT', status: 'pending', business_name: 'Yuneekway', contact_name: 'Balaji', contact_phone: '9999999999', organizer_contact_name: 'Organizer One', organizer_contact_phone: '9000001001', vendor_contact_name: 'Balaji', vendor_contact_phone: '9999999999', notes: 'Vintage clothing stall', total_amount: 25000, created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' }), { status: 201 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /view details chennai summer expo/i }))
    await userEvent.click(await screen.findByRole('button', { name: /request booking/i }))
    await userEvent.type(screen.getByLabelText(/business name/i), 'Yuneekway')
    await userEvent.type(screen.getByLabelText(/contact name/i), 'Balaji')
    await userEvent.type(screen.getByLabelText(/contact phone/i), '9999999999')
    await userEvent.click(screen.getByRole('button', { name: /submit booking request/i }))

    expect(await screen.findByText(/organiser contact/i)).toBeInTheDocument()
    expect(screen.getByText(/Organizer One/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /call organiser/i })).toHaveAttribute('href', 'tel:9000001001')
    expect(screen.getByRole('link', { name: /whatsapp organiser/i })).toHaveAttribute('href', expect.stringContaining('9000001001'))
  })

  it('keeps vendor booking requests in notifications, not mixed into My Events', async () => {
    localStorage.setItem('bys_token', 'organizer-token')
    const myEventsPayload = { total: 1, items: [{ ...eventsPayload.items[0], organizer_id: 3, title: 'My Conducted Expo' }] }
    const bookingPayload = [{ id: 99, event_id: 10, stall_id: 7, vendor_id: 2, booking_reference: 'BYS-CONNECT', status: 'pending', business_name: 'Yuneekway', contact_name: 'Balaji', contact_phone: '9999999999', organizer_contact_name: 'Test Organizer', organizer_contact_phone: '9000001001', vendor_contact_name: 'Balaji', vendor_contact_phone: '9999999999', notes: 'Vintage clothing stall', total_amount: 25000, created_at: '2026-05-10T00:00:00', updated_at: '2026-05-10T00:00:00' }]
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify({ id: 3, name: 'Test Organizer', email: 'testorganizer@example.com', phone: '9000001001', role: 'member', is_active: true, created_at: '2026-05-10T00:00:00' }), { status: 200 }))
      if (url.includes('/events/mine')) return Promise.resolve(new Response(JSON.stringify(myEventsPayload), { status: 200 }))
      if (url.includes('/bookings')) return Promise.resolve(new Response(JSON.stringify(bookingPayload), { status: 200 }))
      if (url.includes('/events')) return Promise.resolve(new Response(JSON.stringify(eventsPayload), { status: 200 }))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: /my events/i }))
    expect(await screen.findByText('My Conducted Expo')).toBeInTheDocument()
    expect(screen.queryByText(/new booking requests/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /call vendor/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: /notifications/i }))
    expect(await screen.findByText(/new booking requests/i)).toBeInTheDocument()
    expect(screen.getByText(/Yuneekway/i)).toBeInTheDocument()
    expect(screen.getByText(/Balaji/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /call vendor/i })).toHaveAttribute('href', 'tel:9999999999')
    expect(screen.getByRole('link', { name: /whatsapp vendor/i })).toHaveAttribute('href', expect.stringContaining('9999999999'))
  })
})
