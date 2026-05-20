import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { Bell, CalendarDays, Heart, Home, LogIn, MapPin, Menu, Plus, Search, Store, UserPlus, Users } from 'lucide-react'
import { apiClient, authStorage, type EventFilters } from './lib/api'
import { compactNumber, formatDateParts, formatDateRange, formatINR } from './lib/format'
import type { BookingCreate, BookingRead, EventCreate, EventDetail, EventItem, Stall, StallPackageCreate, User } from './types'

const cities = ['Chennai', 'Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Coimbatore']
const eventCategoryOptions = ['Shopping expo', 'Fashion pop-up', 'Thrift/vintage market', 'Food festival', 'Business expo', 'Handicrafts market']
const quickSearchChips = [
  { label: 'Thrift', filters: { category: 'Thrift/vintage market' } },
  { label: 'Food', filters: { category: 'Food festival' } },
  { label: 'Fashion', filters: { category: 'Fashion pop-up' } },
  { label: 'Under ₹10k', filters: { max_stall_price: 10000 } },
  { label: 'High footfall', filters: { min_footfall: 5000 } },
] satisfies { label: string; filters: EventFilters }[]
const crowdTypes = ['Families', 'Students', 'Corporate', 'Fashion shoppers', 'Collectors', 'General public']

const LAST_BOOKING_KEY = 'bys_last_booking'

function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '')
}

function whatsappLink(phone: string, message: string) {
  return `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(message)}`
}

function Header({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="Book Your Stall home">
        <span className="brand-mark"><Store size={20} /></span>
        <span>BookYourStall</span>
      </Link>
      <nav className="top-actions" aria-label="Primary navigation">
        {user ? <span className="user-pill">{user.name}</span> : <Link to="/login" className="ghost-button">Login</Link>}
        {user ? <button className="ghost-button" onClick={onLogout}>Logout</button> : null}
        <Link className="icon-button" aria-label="Create event" title="Create event" to="/events/new"><Plus size={18} /></Link>
        <Link className="icon-button" aria-label="Notifications" title="Notifications" to="/notifications"><Bell size={18} /></Link>
      </nav>
    </header>
  )
}

function Shell({ user, authLoading, setUser }: { user: User | null; authLoading: boolean; setUser: (user: User | null) => void }) {
  const [savedEvents, setSavedEvents] = useState<EventItem[]>([])
  const logout = () => {
    authStorage.clearToken()
    setUser(null)
  }
  const toggleSavedEvent = (event: EventItem) => {
    setSavedEvents((current) => current.some((item) => item.id === event.id) ? current.filter((item) => item.id !== event.id) : [...current, event])
  }
  const savedIds = useMemo(() => new Set(savedEvents.map((event) => event.id)), [savedEvents])
  return (
    <div className="app-shell">
      <Header user={user} onLogout={logout} />
      <main>
        <Routes>
          <Route path="/" element={<EventsPage savedIds={savedIds} onToggleSaved={toggleSavedEvent} />} />
          <Route path="/saved" element={<SavedPage savedEvents={savedEvents} savedIds={savedIds} onToggleSaved={toggleSavedEvent} />} />
          <Route path="/my-events" element={<MyEventsPage user={user} authLoading={authLoading} savedIds={savedIds} onToggleSaved={toggleSavedEvent} />} />
          <Route path="/menu" element={<MenuPage user={user} onLogout={logout} />} />
          <Route path="/notifications" element={<NotificationsPage user={user} authLoading={authLoading} />} />
          <Route path="/events/new" element={<CreateEventPage user={user} authLoading={authLoading} />} />
          <Route path="/events/:eventId" element={<EventDetailPage user={user} authLoading={authLoading} />} />
          <Route path="/login" element={<LoginPage setUser={setUser} />} />
          <Route path="/register" element={<RegisterPage setUser={setUser} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      <NavLink to="/" end><Home size={20} />Home</NavLink>
      <NavLink to="/saved"><Heart size={20} />Saved</NavLink>
      <NavLink to="/my-events"><CalendarDays size={20} />My Events</NavLink>
      <NavLink to="/menu"><Menu size={20} />Menu</NavLink>
    </nav>
  )
}

function SavedPage({ savedEvents, savedIds, onToggleSaved }: { savedEvents: EventItem[]; savedIds: Set<number>; onToggleSaved: (event: EventItem) => void }) {
  return (
    <section className="page-stack">
      <section className="simple-page-card">
        <p className="eyebrow">Saved shortlist</p>
        <h1>Saved events</h1>
        {savedEvents.length === 0 ? <p className="hero-copy">Your saved event list is empty. Tap the heart on any event card to shortlist it for later.</p> : null}
        <Link className="primary-link" to="/">Browse events</Link>
      </section>
      {savedEvents.length > 0 ? <div className="event-grid">{savedEvents.map((event) => <EventCard key={event.id} event={event} saved={savedIds.has(event.id)} onToggleSaved={onToggleSaved} />)}</div> : null}
    </section>
  )
}

function MyEventsPage({ user, authLoading, savedIds, onToggleSaved }: { user: User | null; authLoading: boolean; savedIds: Set<number>; onToggleSaved: (event: EventItem) => void }) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState<string | null>(null)
  const lastBooking = useMemo(() => {
    const stored = sessionStorage.getItem(LAST_BOOKING_KEY)
    if (!stored) return null
    try {
      return JSON.parse(stored) as BookingRead
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) return
    let active = true
    // This effect intentionally reflects a new async fetch cycle when auth is ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    apiClient.myEvents()
      .then((response) => {
        if (!active) return
        setEvents(response.items)
        setError(null)
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [authLoading, user])

  return (
    <section className="page-stack">
      {lastBooking ? <BookingSuccessCard booking={lastBooking} /> : null}
      <section className="simple-page-card">
        <p className="eyebrow">Events you conduct</p>
        <h1>My conducted events</h1>
        <p className="hero-copy">Manage events you created and track bookings submitted from your account.</p>
        <Link className="primary-link" to="/events/new">Create event</Link>
      </section>
      {authLoading ? <p className="empty-state">Checking authentication...</p> : null}
      {!authLoading && !user ? <section className="simple-page-card"><h2>Please login to view your events</h2><p className="hero-copy">Your conducted events and booking updates are private to your account.</p><Link className="primary-link" to="/login">Login</Link></section> : null}
      {!authLoading && user && loading ? <p className="empty-state">Loading your events...</p> : null}
      {error ? <p className="alert error">{error}</p> : null}
      {!authLoading && user && !loading && !error && events.length === 0 ? <p className="empty-state">No conducted events yet. Create your first event to become an organiser for it.</p> : null}
      {events.length > 0 ? <div className="event-grid">{events.map((event) => <EventCard key={event.id} event={event} saved={savedIds.has(event.id)} onToggleSaved={onToggleSaved} />)}</div> : null}
    </section>
  )
}

function BookingSuccessCard({ booking }: { booking: BookingRead }) {
  const phone = booking.organizer_contact_phone
  const organizerName = booking.organizer_contact_name ?? 'Event organiser'
  return (
    <section className="simple-page-card success-card" aria-live="polite">
      <div className="success-tick">✅</div>
      <h2>Booking request submitted</h2>
      <p>Reference {booking.booking_reference} is under review.</p>
      {phone ? <div className="contact-panel"><p className="eyebrow">Organiser contact</p><h3>{organizerName}</h3><p>{phone}</p><div className="contact-actions"><a className="primary-link" href={`tel:${phone}`}>Call organiser</a><a className="ghost-button" href={whatsappLink(phone, `Hi ${organizerName}, I submitted booking request ${booking.booking_reference} on BookYourStall.`)}>WhatsApp organiser</a></div></div> : null}
    </section>
  )
}

function BookingRequestsCard({ bookings }: { bookings: BookingRead[] }) {
  return (
    <section className="notifications-panel">
      <div className="notifications-header">
        <div>
          <p className="eyebrow">New booking requests</p>
          <h2>Vendor contacts</h2>
          <p className="hero-copy">Review incoming stall requests and connect with vendors quickly.</p>
        </div>
        <span className="count-badge">{bookings.length} pending</span>
      </div>
      <div className="request-list">
        {bookings.map((booking) => {
          const phone = booking.vendor_contact_phone ?? booking.contact_phone
          const name = booking.vendor_contact_name ?? booking.contact_name
          const initials = (booking.business_name || name).slice(0, 2).toUpperCase()
          return (
            <article className="request-card" key={booking.id}>
              <div className="request-topline">
                <span className="vendor-avatar">{initials}</span>
                <div className="request-title-block">
                  <h3>{booking.business_name}</h3>
                  <p>{booking.booking_reference}</p>
                </div>
                <span className="status-chip">{booking.status}</span>
              </div>
              <div className="contact-detail-grid">
                <div><span>Contact person</span><strong>{name}</strong></div>
                <div><span>Phone number</span><strong>{phone}</strong></div>
              </div>
              {booking.notes ? <p className="request-note">“{booking.notes}”</p> : null}
              <div className="contact-actions">
                <a className="primary-link" href={`tel:${phone}`}>Call vendor</a>
                <a className="ghost-button" href={whatsappLink(phone, `Hi ${name}, I received your booking request ${booking.booking_reference} on BookYourStall.`)}>WhatsApp vendor</a>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function NotificationsPage({ user, authLoading }: { user: User | null; authLoading: boolean }) {
  const [bookings, setBookings] = useState<BookingRead[]>([])
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) return
    let active = true
    // This effect intentionally reflects a new async fetch cycle when auth is ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    apiClient.listBookings()
      .then((response) => {
        if (!active) return
        setBookings(response)
        setError(null)
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [authLoading, user])

  return (
    <section className="page-stack">
      <section className="simple-page-card">
        <p className="eyebrow">Updates</p>
        <h1>Notifications</h1>
        <p className="hero-copy">Booking requests and contact updates appear here.</p>
        <Link className="primary-link" to="/">Back to events</Link>
      </section>
      {authLoading ? <p className="empty-state">Checking authentication...</p> : null}
      {!authLoading && !user ? <section className="simple-page-card"><h2>Please login to view notifications</h2><p className="hero-copy">Vendor requests and contact updates are private to your account.</p><Link className="primary-link" to="/login">Login</Link></section> : null}
      {!authLoading && user && loading ? <p className="empty-state">Loading notifications...</p> : null}
      {error ? <p className="alert error">{error}</p> : null}
      {!authLoading && user && !loading && !error && bookings.length === 0 ? <p className="empty-state">No new booking requests yet.</p> : null}
      {!authLoading && user && !loading && !error && bookings.length > 0 ? <BookingRequestsCard bookings={bookings} /> : null}
    </section>
  )
}

function MenuPage({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  return (
    <section className="page-stack">
      <section className="simple-page-card menu-card">
        <p className="eyebrow">Account</p>
        <h1>Menu</h1>
        {user ? <p className="hero-copy">Logged in as {user.name} ({user.role}).</p> : <p className="hero-copy">Login or create a test account to request stall bookings.</p>}
        <div className="menu-actions">
          {user ? <button className="ghost-button" onClick={onLogout}>Logout</button> : null}
          {!user ? <Link className="primary-link" to="/login"><LogIn size={18} />Login</Link> : null}
          {!user ? <Link className="ghost-button" to="/register"><UserPlus size={18} />Create account</Link> : null}
          <Link className="ghost-button" to="/">Browse events</Link>
        </div>
        <div className="test-credentials">
          <h2>Test login</h2>
          <p>Vendor: testvendor@example.com</p>
          <p>Organizer: testorganizer@example.com</p>
          <p>Password: TestPass123!</p>
        </div>
      </section>
    </section>
  )
}

function EventsPage({ savedIds, onToggleSaved }: { savedIds: Set<number>; onToggleSaved: (event: EventItem) => void }) {
  const [filters, setFilters] = useState<EventFilters>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [events, setEvents] = useState<EventItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    // This effect intentionally reflects a new async fetch cycle whenever filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    apiClient.listEvents(filters)
      .then((response) => {
        if (!active) return
        setEvents(response.items)
        setTotal(response.total)
        setError(null)
      })
      .catch((err: Error) => {
        if (!active) return
        setEvents([])
        setTotal(0)
        setError(err.message)
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [filters])

  const eventCountText = `${total} ${total === 1 ? 'event' : 'events'} available`
  const selectedFilters = [
    filters.q ? { key: 'q' as const, label: filters.q } : null,
    filters.city ? { key: 'city' as const, label: filters.city } : null,
    filters.category ? { key: 'category' as const, label: filters.category } : null,
    filters.max_stall_price ? { key: 'max_stall_price' as const, label: `Under ${formatINR(filters.max_stall_price)}` } : null,
    filters.min_stall_price ? { key: 'min_stall_price' as const, label: `From ${formatINR(filters.min_stall_price)}` } : null,
    filters.min_footfall ? { key: 'min_footfall' as const, label: `${compactNumber(filters.min_footfall)}+ footfall` } : null,
  ].filter(Boolean) as { key: keyof EventFilters; label: string }[]
  const applyQuickFilters = (quickFilters: EventFilters) => {
    setFilters((current) => ({ ...current, ...quickFilters }))
  }
  const removeFilter = (key: keyof EventFilters) => {
    if (key === 'q') setSearchQuery('')
    setFilters((current) => ({ ...current, [key]: undefined }))
  }
  const resetFilters = () => {
    setSearchQuery('')
    setFilters({})
  }
  const updateSearchQuery = (value: string) => {
    setSearchQuery(value)
    setFilters((current) => ({ ...current, q: value.trim().replace(/\s+/g, ' ') || undefined }))
  }

  return (
    <section className="page-stack">
      <section className="hero-section search-first-hero">
        <div>
          <p className="eyebrow">India’s stall booking marketplace</p>
          <h1>Book your perfect stall</h1>
          <p className="hero-copy">Search events by city, category, vendor type, custom tags and stall budget.</p>
        </div>
        <div className="search-card search-card-primary">
          <label htmlFor="search-query">Search events, city, category or vendor type</label>
          <div className="search-row"><Search size={18} /><input id="search-query" placeholder="Try Chennai thrift, food under 10000..." value={searchQuery} onChange={(event) => updateSearchQuery(event.target.value)} /></div>
        </div>
      </section>

      <section className="filter-panel marketplace-filters" aria-label="Event filters">
        <div className="filter-panel-head">
          <div>
            <p className="eyebrow">Quick filters</p>
            <h2>Browse by location, category and budget</h2>
          </div>
          <button className="filter-clear" type="button" onClick={resetFilters}>Reset</button>
        </div>
        <div className="city-strip" aria-label="Popular cities">
          {cities.map((city) => (
            <button key={city} className={filters.city === city ? 'city-chip active' : 'city-chip'} onClick={() => setFilters((current) => ({ ...current, city: current.city === city ? undefined : city }))}>
              <span>{city.slice(0, 1)}</span><strong>{city}</strong>
            </button>
          ))}
        </div>
        <div className="quick-chip-row" aria-label="Popular searches">
          {quickSearchChips.map((chip) => (
            <button key={chip.label} className="quick-filter-chip" type="button" onClick={() => applyQuickFilters(chip.filters)}>{chip.label}</button>
          ))}
        </div>
        {selectedFilters.length > 0 ? (
          <div className="selected-filter-row" aria-label="Selected filters">
            {selectedFilters.map((filter) => (
              <button key={filter.key} className="selected-filter-chip" type="button" aria-label={`Remove ${filter.label} filter`} onClick={() => removeFilter(filter.key)}>{filter.label} ×</button>
            ))}
          </div>
        ) : null}
        <details className="advanced-filters">
          <summary>More filters</summary>
          <div className="filter-row">
            <label className="filter-select-card">
              <span>Category</span>
              <select aria-label="Category" value={filters.category ?? ''} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value || undefined }))}>
                <option value="">All categories</option>
                {eventCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="filter-select-card">
              <span>Stall price</span>
              <select aria-label="Price" value={filters.max_stall_price ?? ''} onChange={(event) => setFilters((current) => ({ ...current, max_stall_price: event.target.value ? Number(event.target.value) : undefined }))}>
                <option value="">Any price</option>
                <option value="10000">Under ₹10,000</option>
                <option value="25000">Under ₹25,000</option>
              </select>
            </label>
          </div>
        </details>
      </section>

      <div className="section-heading">
        <h2>{eventCountText}</h2>
        <p>{loading ? 'Loading fresh events...' : 'Tap any card to view stalls and request booking.'}</p>
      </div>

      {error ? <p className="alert error">{error}</p> : null}
      {!loading && events.length === 0 ? <p className="empty-state">No events found. Try another city, category, search term or price.</p> : null}
      <div className="event-grid">
        {events.map((event) => <EventCard key={event.id} event={event} saved={savedIds.has(event.id)} onToggleSaved={onToggleSaved} />)}
      </div>
    </section>
  )
}

function EventCard({ event, saved, onToggleSaved }: { event: EventItem; saved: boolean; onToggleSaved: (event: EventItem) => void }) {
  const date = formatDateParts(event.start_date)
  return (
    <article className="event-card">
      <div className="date-block"><strong>{date.day}</strong><span>{date.month}</span><small>{date.weekday}</small></div>
      <div className="event-body">
        <div className="card-title-row"><h3>{event.title}</h3><button className={saved ? 'heart-button saved' : 'heart-button'} aria-pressed={saved} aria-label={`${saved ? 'Unsave' : 'Save'} ${event.title}`} onClick={() => onToggleSaved(event)}><Heart size={17} /></button></div>
        <p><MapPin size={16} />{event.venue_name}</p>
        <p><Users size={16} />{event.crowd_type} · {event.expected_footfall === null ? 'Footfall TBA' : `${compactNumber(event.expected_footfall)} footfall`}</p>
        <div className="tag-row"><span>{event.city}</span><span>{event.category}</span></div>
        <Link className="primary-link" to={`/events/${event.id}`} aria-label={`View details ${event.title}`}>View details</Link>
      </div>
    </article>
  )
}

function CreateEventPage({ user, authLoading }: { user: User | null; authLoading: boolean }) {
  const navigate = useNavigate()
  const [form, setForm] = useState<EventCreate>({ title: '', description: '', city: '', venue_name: '', venue_address: '', start_date: '', end_date: '', crowd_type: '', expected_footfall: null, category: null, categories: [] })
  const [customCategory, setCustomCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const canCreate = Boolean(user)
  const update = (field: keyof EventCreate, value: string) => setForm((current) => ({ ...current, [field]: field === 'expected_footfall' ? (value ? Number(value) : null) : value }))
  const visibleCategoryOptions = useMemo(() => {
    const customOnly = form.categories.filter((category) => !eventCategoryOptions.includes(category))
    return [...eventCategoryOptions, ...customOnly]
  }, [form.categories])
  const toggleListValue = (field: 'categories', value: string) => {
    setForm((current) => {
      const selected = current[field]
      return { ...current, [field]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] }
    })
  }
  const addCustomCategory = () => {
    const cleaned = customCategory.trim().replace(/\s+/g, ' ')
    if (!cleaned) return
    setForm((current) => ({ ...current, categories: current.categories.includes(cleaned) ? current.categories : [...current.categories, cleaned] }))
    setCustomCategory('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (authLoading) return
    if (!canCreate) {
      setError('Please login before creating events.')
      return
    }
    if (form.categories.length === 0) {
      setError('Select at least one event category.')
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      setSuccess(null)
      const eventPayload = {
        title: form.title,
        city: form.city,
        venue_name: form.venue_name,
        start_date: form.start_date,
        end_date: form.end_date,
        crowd_type: form.crowd_type,
        categories: form.categories,
        category: form.categories[0],
        description: form.description || null,
        venue_address: form.venue_address || null,
        expected_footfall: form.expected_footfall ?? null,
        banner_image_url: form.banner_image_url || null,
      }
      const created = await apiClient.createEvent(eventPayload)
      await apiClient.publishEvent(created.id)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Event creation failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="page-stack">
      <form className="event-builder" aria-label="Create event" onSubmit={submit}>
        <div className="form-hero-card">
          <p className="eyebrow">Organizer setup</p>
          <h1>Create event</h1>
          <p>Set the basics first. You can add stall packages with prices after the event is created.</p>
        </div>
        {authLoading ? <p className="alert">Checking authentication...</p> : null}
        {!authLoading && !canCreate ? <p className="alert error">Please login before creating events.</p> : null}
        {error ? <p className="alert error">{error}</p> : null}
        {success ? <p className="alert success">{success}</p> : null}
        <section className="form-step-card">
          <div className="step-heading"><span>1</span><div><h2>Event basics</h2><p>Name, location, date and audience details.</p></div></div>
          <div className="responsive-form-grid">
            <label className="span-2">Title<input value={form.title} onChange={(event) => update('title', event.target.value)} required minLength={2} placeholder="Example: Chennai Thrift Fest" /></label>
            <label className="span-2">Description<textarea value={form.description ?? ''} onChange={(event) => update('description', event.target.value)} placeholder="Tell vendors what makes this event worth joining" /></label>
            <label>City<select value={form.city} onChange={(event) => update('city', event.target.value)} required><option value="">Select city</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
            <label>Venue name<input value={form.venue_name} onChange={(event) => update('venue_name', event.target.value)} required minLength={2} placeholder="Venue / mall / ground name" /></label>
            <label className="span-2">Venue address<textarea value={form.venue_address ?? ''} onChange={(event) => update('venue_address', event.target.value)} placeholder="Full address for vendors" /></label>
            <label>Start date<input type="date" value={form.start_date} onChange={(event) => update('start_date', event.target.value)} required /></label>
            <label>End date<input type="date" value={form.end_date} onChange={(event) => update('end_date', event.target.value)} required /></label>
            <label>Crowd type<select value={form.crowd_type} onChange={(event) => update('crowd_type', event.target.value)} required><option value="">Select crowd</option>{crowdTypes.map((crowdType) => <option key={crowdType} value={crowdType}>{crowdType}</option>)}</select></label>
            <label>Expected footfall<input type="number" min="0" value={form.expected_footfall ?? ''} onChange={(event) => update('expected_footfall', event.target.value)} placeholder="Example: 5000" /></label>
          </div>
        </section>
        <section className="form-step-card">
          <div className="step-heading"><span>2</span><div><h2>Event type</h2><p>Choose what kind of event this is. This helps vendors discover it.</p></div></div>
          <fieldset className="chip-fieldset">
            <legend className="sr-only">Event categories</legend>
            <div className="category-chip-grid">
              {visibleCategoryOptions.map((category) => <label key={category} className="category-chip"><input type="checkbox" checked={form.categories.includes(category)} onChange={() => toggleListValue('categories', category)} /><span>{category}</span></label>)}
            </div>
            <div className="custom-category-row">
              <label>Add custom event category<input value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="Example: Vintage sneaker meetup" /></label>
              <button className="ghost-button" type="button" onClick={addCustomCategory}>Add category</button>
            </div>
          </fieldset>
        </section>
        <div className="form-submit-bar">
          <div><strong>Ready to publish?</strong><p>You can create stall packages on the event page next.</p></div>
          <button className="primary-button" type="submit" disabled={authLoading || submitting}>{submitting ? 'Creating...' : 'Create event'}</button>
        </div>
      </form>
    </section>
  )
}

type StallPackageGroup = {
  key: string
  title: string
  description: string | null
  size: string | null
  zone: string | null
  price: number
  amenities: string | null
  stalls: Stall[]
  availableStalls: Stall[]
}

function groupStalls(stalls: Stall[]): StallPackageGroup[] {
  const groups = new Map<string, StallPackageGroup>()
  stalls.forEach((stall) => {
    const key = `${stall.title}-${stall.zone ?? 'General zone'}-${stall.price}`
    const existing = groups.get(key)
    if (existing) {
      existing.stalls.push(stall)
      if (stall.status === 'available') existing.availableStalls.push(stall)
      return
    }
    groups.set(key, {
      key,
      title: stall.title,
      description: stall.description,
      size: stall.size,
      zone: stall.zone,
      price: stall.price,
      amenities: stall.amenities,
      stalls: [stall],
      availableStalls: stall.status === 'available' ? [stall] : [],
    })
  })
  return [...groups.values()]
}

function EventDetailPage({ user, authLoading }: { user: User | null; authLoading: boolean }) {
  const params = useParams()
  const navigate = useNavigate()
  const eventId = Number(params.eventId)
  const isValidEventId = Number.isInteger(eventId) && eventId > 0
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [selectedStall, setSelectedStall] = useState<Stall | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const isOwner = Boolean(user && event && (event.organizer_id === user.id || user.role === 'super_admin'))

  useEffect(() => {
    if (!isValidEventId) return
    apiClient.eventDetail(eventId)
      .then(setEvent)
      .catch((err: Error) => setError(err.message))
  }, [eventId, isValidEventId])

  useEffect(() => {
    // Close an open booking form when logout clears the authenticated user.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!user) setSelectedStall(null)
  }, [user])

  if (!isValidEventId) return <p className="alert error">Invalid event link. Please choose an event from the listing.</p>
  if (error) return <p className="alert error">{error}</p>
  if (!event) return <p className="empty-state">Loading event detail...</p>

  const stallGroups = groupStalls(event.stalls)
  const refreshEvent = (updatedStalls: Stall[]) => {
    setEvent((current) => current ? { ...current, stalls: [...current.stalls, ...updatedStalls] } : current)
  }

  return (
    <section className="page-stack detail-page">
      <Link to="/" className="back-link">← Back to events</Link>
      <section className="detail-hero">
        <div>
          <p className="eyebrow">{event.city} · {event.category}</p>
          <h1>{event.title}</h1>
          <p className="hero-copy">{event.description ?? 'Explore available stalls and request booking from the organizer.'}</p>
          <div className="meta-grid">
            <span><CalendarDays size={17} />{formatDateRange(event.start_date, event.end_date)}</span>
            <span><MapPin size={17} />{event.venue_name}</span>
            <span><Users size={17} />{event.expected_footfall === null ? 'Expected visitors TBA' : `${compactNumber(event.expected_footfall)} expected visitors`}</span>
          </div>
        </div>
      </section>

      {success ? <section className="simple-page-card success-card" aria-live="polite"><div className="success-tick">✅</div><h2>Booking request submitted</h2><p>{success}</p></section> : null}
      {isOwner ? <StallPackageForm eventId={event.id} onGenerated={(stalls) => { refreshEvent(stalls); setSuccess(`Generated ${stalls.length} stalls.`) }} /> : null}
      <div className="section-heading"><h2>Available stall packages</h2><p>{isOwner ? 'Generate packages once and assign exact stall codes while approving bookings.' : 'Choose a package. Exact stall code can be assigned by the organizer after approval.'}</p></div>
      <div className="stall-grid">
        {stallGroups.map((group) => <StallPackageCard key={group.key} group={group} isOwner={isOwner} onSelect={setSelectedStall} />)}
      </div>
      {selectedStall ? <BookingForm eventId={event.id} stall={selectedStall} user={user} authLoading={authLoading} onSuccess={(booking) => { setSelectedStall(null); sessionStorage.setItem(LAST_BOOKING_KEY, JSON.stringify(booking)); sessionStorage.setItem('bys_last_booking_reference', booking.booking_reference); setSuccess(`Reference ${booking.booking_reference} is under review. Redirecting to your conducted events...`); navigate('/my-events') }} /> : null}
    </section>
  )
}

function StallPackageCard({ group, isOwner, onSelect }: { group: StallPackageGroup; isOwner: boolean; onSelect: (stall: Stall) => void }) {
  const firstAvailable = group.availableStalls[0]
  const availableCodes = group.availableStalls.slice(0, 4).map((stall) => stall.stall_code).join(', ')
  const buttonText = isOwner ? `Add customer booking for ${group.title}` : 'Request booking'
  return (
    <article className="stall-card" data-testid={`stall-package-${group.key}`}>
      <div><p className="eyebrow">{group.zone ?? 'General zone'} · {group.availableStalls.length} available of {group.stalls.length}</p><h3>{group.title}</h3></div>
      <p>{group.description ?? 'Good visibility stall space'}</p>
      <p>{group.size ?? 'Size TBA'} · {group.amenities ?? 'Amenities TBA'}</p>
      <p>Available codes: {availableCodes || 'None currently available'}</p>
      <strong>{formatINR(group.price)}</strong>
      <button className="primary-button" disabled={!firstAvailable} onClick={() => firstAvailable && onSelect(firstAvailable)}>{firstAvailable ? buttonText : 'Fully booked'}</button>
    </article>
  )
}

function StallPackageForm({ eventId, onGenerated }: { eventId: number; onGenerated: (stalls: Stall[]) => void }) {
  const [form, setForm] = useState<StallPackageCreate>({ title: '', description: '', size: '', zone: '', price: 0, amenities: '', layout_image_url: null, code_prefix: '', start_number: 1, quantity: 0 })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const update = (field: keyof StallPackageCreate, value: string) => setForm((current) => ({ ...current, [field]: ['price', 'start_number', 'quantity'].includes(field) ? Number(value) : value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    try {
      setSubmitting(true)
      setError(null)
      const generated = await apiClient.createStallPackage(eventId, { ...form, description: form.description || null, size: form.size || null, zone: form.zone || null, amenities: form.amenities || null })
      setForm({ title: '', description: '', size: '', zone: '', price: 0, amenities: '', layout_image_url: null, code_prefix: '', start_number: 1, quantity: 0 })
      onGenerated(generated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stall package generation failed')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <form className="booking-form package-form" onSubmit={submit}>
      <div className="section-heading"><h2>Generate stall package</h2><p>Create 10, 50, or 100 stalls from one package instead of adding cards one by one.</p></div>
      {error ? <p className="alert error">{error}</p> : null}
      <label>Package name<input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Budget Stall" required minLength={2} /></label>
      <label>Description<textarea value={form.description ?? ''} onChange={(event) => update('description', event.target.value)} placeholder="Best for thrift, accessories, handmade" /></label>
      <label>Size<input value={form.size ?? ''} onChange={(event) => update('size', event.target.value)} placeholder="8x8 ft" /></label>
      <label>Zone<input value={form.zone ?? ''} onChange={(event) => update('zone', event.target.value)} placeholder="Zone B" /></label>
      <label>Price<input type="number" min="0" value={form.price || ''} onChange={(event) => update('price', event.target.value)} required /></label>
      <label>Quantity<input type="number" min="1" max="500" value={form.quantity || ''} onChange={(event) => update('quantity', event.target.value)} required /></label>
      <label>Code prefix<input value={form.code_prefix} onChange={(event) => update('code_prefix', event.target.value)} placeholder="B" required maxLength={20} /></label>
      <label>Includes<textarea value={form.amenities ?? ''} onChange={(event) => update('amenities', event.target.value)} placeholder="table, chair, basic lighting" /></label>
      <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Generating...' : 'Generate stalls'}</button>
    </form>
  )
}

function BookingForm({ eventId, stall, user, authLoading, onSuccess }: { eventId: number; stall: Stall; user: User | null; authLoading: boolean; onSuccess: (booking: BookingRead) => void }) {
  const [form, setForm] = useState({ business_name: '', contact_name: '', contact_phone: '', notes: '' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const canSubmit = Boolean(user)

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (authLoading) {
      setError(null)
      return
    }
    if (!canSubmit) {
      setError('Please login before booking this stall.')
      return
    }
    const payload: BookingCreate = { event_id: eventId, stall_id: stall.id, ...form }
    try {
      setSubmitting(true)
      setError(null)
      const booking = await apiClient.createBooking(payload)
      onSuccess(booking)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="booking-panel" aria-label="Request stall booking" onSubmit={submit}>
      <div className="booking-summary-card">
        <p className="eyebrow">Selected package</p>
        <div className="booking-summary-main">
          <div>
            <h2>Request {stall.title}</h2>
            <p>{stall.zone ?? 'General zone'} · {stall.size ?? 'Size shared by organizer'}</p>
          </div>
          <strong>{formatINR(stall.price)}</strong>
        </div>
        <div className="summary-note">Pending organizer approval. After you submit, the organizer can contact you directly.</div>
      </div>
      {authLoading ? <p className="alert">Checking authentication...</p> : null}
      {error ? <p className="alert error">{error}</p> : null}
      <section className="booking-detail-card">
        <div className="step-heading compact"><span>1</span><div><h2>Your business details</h2><p>Share the contact the organiser should call or WhatsApp.</p></div></div>
        <div className="responsive-form-grid">
          <label>Business name<input value={form.business_name} onChange={(event) => update('business_name', event.target.value)} required minLength={2} placeholder="Example: Yuneekway" /></label>
          <label>Contact name<input value={form.contact_name} onChange={(event) => update('contact_name', event.target.value)} required minLength={2} placeholder="Person to contact" /></label>
          <label className="span-2">Contact phone<input value={form.contact_phone} onChange={(event) => update('contact_phone', event.target.value)} required minLength={5} placeholder="Mobile / WhatsApp number" /></label>
          <label className="span-2">Notes<textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Products, stall needs, timing questions" /></label>
        </div>
      </section>
      <div className="form-submit-bar booking-submit-bar">
        <div><strong>Submit request</strong><p>Your number will be shared with the organiser for faster connection.</p></div>
        <button className="primary-button" type="submit" disabled={authLoading || submitting}>{authLoading ? 'Checking authentication...' : submitting ? 'Submitting...' : 'Submit booking request'}</button>
      </div>
    </form>
  )
}

function LoginPage({ setUser }: { setUser: (user: User | null) => void }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const response = await apiClient.requestOtp({ email: normalizedEmail })
      setEmail(normalizedEmail)
      setChallengeId(response.challenge_id)
      setOtpSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send login code')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault()
    if (!challengeId) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.verifyOtp({ challenge_id: challengeId, email, otp })
      setUser(response.user)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login code verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="auth-card otp-auth-card">
      <p className="eyebrow">Email login</p>
      <h1>Login or create account</h1>
      <p className="helper-text">We’ll send a secure login code to your email address and keep your session active after verification.</p>
      {error ? <p className="alert error">{error}</p> : null}
      {!otpSent ? (
        <form onSubmit={requestOtp} className="otp-auth-form">
          <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Sending code…' : 'Send login code'}</button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="otp-auth-form">
          <p className="success-note">Login code sent to {email}</p>
          <label>Enter login code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="6-digit code" required minLength={4} maxLength={8} /></label>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify & continue'}</button>
          <button className="ghost-button" type="button" onClick={() => { setOtpSent(false); setOtp(''); setChallengeId(null) }}>Change email</button>
        </form>
      )}
      <Link to="/register">Use password registration instead</Link>
    </section>
  )
}

function RegisterPage({ setUser }: { setUser: (user: User | null) => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await apiClient.register({ name, email, phone, password })
      await apiClient.login({ email, password })
      const me = await apiClient.me()
      setUser(me)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <h1>Create account</h1>
      {error ? <p className="alert error">{error}</p> : null}
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
      <button className="primary-button" type="submit">Register</button>
      <Link to="/login">Already have an account?</Link>
    </form>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(() => Boolean(authStorage.getToken()))
  const hasToken = useMemo(() => Boolean(authStorage.getToken()), [])

  useEffect(() => {
    if (!hasToken) return
    apiClient.me()
      .then(setUser)
      .catch(() => authStorage.clearToken())
      .finally(() => setAuthLoading(false))
  }, [hasToken])

  return (
    <BrowserRouter>
      <Shell user={user} authLoading={authLoading} setUser={setUser} />
    </BrowserRouter>
  )
}

export default App
