import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { Bell, CalendarDays, Heart, Home, LogIn, MapPin, Menu, Plus, Search, Store, UserPlus, Users } from 'lucide-react'
import { apiClient, authStorage, type EventFilters } from './lib/api'
import { compactNumber, formatDateParts, formatDateRange, formatINR } from './lib/format'
import type { BookingCreate, EventCreate, EventDetail, EventItem, Stall, StallPackageCreate, User } from './types'

const cities = ['Chennai', 'Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Coimbatore']
const eventCategoryOptions = ['Shopping expo', 'Fashion pop-up', 'Thrift/vintage market', 'Food festival', 'Business expo', 'Handicrafts market']
const vendorCategoryOptions = ['Clothing', 'Thrift/vintage clothing', 'Accessories', 'Food & beverages', 'Home decor', 'Handmade products']
const crowdTypes = ['Families', 'Students', 'Corporate', 'Fashion shoppers', 'Collectors', 'General public']

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
          <Route path="/notifications" element={<NotificationsPage />} />
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
      {sessionStorage.getItem('bys_last_booking_reference') ? <section className="simple-page-card success-card" aria-live="polite"><div className="success-tick">✅</div><h2>Booking request submitted</h2><p>Reference {sessionStorage.getItem('bys_last_booking_reference')} is under review.</p></section> : null}
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

function NotificationsPage() {
  return (
    <section className="page-stack">
      <section className="simple-page-card">
        <p className="eyebrow">Updates</p>
        <h1>Notifications</h1>
        <p className="hero-copy">No new notifications. Booking updates and organizer replies will appear here.</p>
        <Link className="primary-link" to="/">Back to events</Link>
      </section>
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

  return (
    <section className="page-stack">
      <section className="hero-section">
        <div>
          <p className="eyebrow">India’s stall booking marketplace</p>
          <h1>Book your perfect stall</h1>
          <p className="hero-copy">Discover exhibitions, flea markets, expos and pop-ups by city, crowd, category and stall price.</p>
        </div>
        <div className="search-card">
          <label htmlFor="search-city">Find events by city</label>
          <div className="search-row"><Search size={18} /><input id="search-city" placeholder="Try Chennai" value={filters.city ?? ''} onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value.trim() || undefined }))} /></div>
        </div>
      </section>

      <section className="filter-panel" aria-label="Event filters">
        <div className="city-strip">
          {cities.map((city) => (
            <button key={city} className={filters.city === city ? 'city-chip active' : 'city-chip'} onClick={() => setFilters((current) => ({ ...current, city: current.city === city ? undefined : city }))}>
              <span>{city.slice(0, 1)}</span>{city}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <select aria-label="Category" onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value || undefined }))}>
            <option value="">All categories</option>
            {eventCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select aria-label="Price" onChange={(event) => setFilters((current) => ({ ...current, min_stall_price: event.target.value ? Number(event.target.value) : undefined }))}>
            <option value="">Any price</option>
            <option value="10000">From ₹10,000</option>
            <option value="25000">From ₹25,000</option>
          </select>
        </div>
      </section>

      <div className="section-heading">
        <h2>{eventCountText}</h2>
        <p>{loading ? 'Loading fresh events...' : 'Tap any card to view stalls and request booking.'}</p>
      </div>

      {error ? <p className="alert error">{error}</p> : null}
      {!loading && events.length === 0 ? <p className="empty-state">No events found. Try another city or category.</p> : null}
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
  const [form, setForm] = useState<EventCreate>({ title: '', description: '', city: '', venue_name: '', venue_address: '', start_date: '', end_date: '', crowd_type: '', expected_footfall: null, category: null, categories: [], allowed_vendor_categories: [] })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const canCreate = Boolean(user)
  const update = (field: keyof EventCreate, value: string) => setForm((current) => ({ ...current, [field]: field === 'expected_footfall' ? (value ? Number(value) : null) : value }))
  const toggleListValue = (field: 'categories' | 'allowed_vendor_categories', value: string) => {
    setForm((current) => {
      const selected = current[field]
      return { ...current, [field]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] }
    })
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
    if (form.allowed_vendor_categories.length === 0) {
      setError('Select at least one allowed vendor category.')
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      setSuccess(null)
      const created = await apiClient.createEvent({
        ...form,
        category: form.categories[0],
        description: form.description || null,
        venue_address: form.venue_address || null,
        expected_footfall: form.expected_footfall ?? null,
      })
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
      <form className="auth-card event-form" onSubmit={submit}>
        <h1>Create event</h1>
        {authLoading ? <p className="alert">Checking authentication...</p> : null}
        {!authLoading && !canCreate ? <p className="alert error">Please login before creating events.</p> : null}
        {error ? <p className="alert error">{error}</p> : null}
        {success ? <p className="alert success">{success}</p> : null}
        <label>Title<input value={form.title} onChange={(event) => update('title', event.target.value)} required minLength={2} /></label>
        <label>Description<textarea value={form.description ?? ''} onChange={(event) => update('description', event.target.value)} /></label>
        <label>City<select value={form.city} onChange={(event) => update('city', event.target.value)} required><option value="">Select city</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
        <label>Venue name<input value={form.venue_name} onChange={(event) => update('venue_name', event.target.value)} required minLength={2} /></label>
        <label>Venue address<textarea value={form.venue_address ?? ''} onChange={(event) => update('venue_address', event.target.value)} /></label>
        <label>Start date<input type="date" value={form.start_date} onChange={(event) => update('start_date', event.target.value)} required /></label>
        <label>End date<input type="date" value={form.end_date} onChange={(event) => update('end_date', event.target.value)} required /></label>
        <label>Crowd type<select value={form.crowd_type} onChange={(event) => update('crowd_type', event.target.value)} required><option value="">Select crowd</option>{crowdTypes.map((crowdType) => <option key={crowdType} value={crowdType}>{crowdType}</option>)}</select></label>
        <label>Expected footfall<input type="number" min="0" value={form.expected_footfall ?? ''} onChange={(event) => update('expected_footfall', event.target.value)} /></label>
        <fieldset className="option-fieldset"><legend>Event categories</legend>{eventCategoryOptions.map((category) => <label key={category} className="checkbox-option"><input type="checkbox" checked={form.categories.includes(category)} onChange={() => toggleListValue('categories', category)} />{category}</label>)}</fieldset>
        <fieldset className="option-fieldset"><legend>Allowed vendor categories</legend>{vendorCategoryOptions.map((category) => <label key={category} className="checkbox-option"><input type="checkbox" checked={form.allowed_vendor_categories.includes(category)} onChange={() => toggleListValue('allowed_vendor_categories', category)} />{category}</label>)}</fieldset>
        <button className="primary-button" type="submit" disabled={authLoading || submitting}>{submitting ? 'Creating...' : 'Create event'}</button>
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
      {selectedStall ? <BookingForm eventId={event.id} stall={selectedStall} user={user} authLoading={authLoading} onSuccess={(reference) => { setSelectedStall(null); sessionStorage.setItem('bys_last_booking_reference', reference ?? 'created'); setSuccess(`Reference ${reference ?? 'created'} is under review. Redirecting to your conducted events...`); navigate('/my-events') }} /> : null}
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

function BookingForm({ eventId, stall, user, authLoading, onSuccess }: { eventId: number; stall: Stall; user: User | null; authLoading: boolean; onSuccess: (reference?: string) => void }) {
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
      onSuccess(booking.booking_reference)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="booking-form" onSubmit={submit}>
      <div className="section-heading"><h2>Request {stall.title}</h2><p>{formatINR(stall.price)} · pending organizer approval</p></div>
      {authLoading ? <p className="alert">Checking authentication...</p> : null}
      {error ? <p className="alert error">{error}</p> : null}
      <label>Business name<input value={form.business_name} onChange={(event) => update('business_name', event.target.value)} required minLength={2} /></label>
      <label>Contact name<input value={form.contact_name} onChange={(event) => update('contact_name', event.target.value)} required minLength={2} /></label>
      <label>Contact phone<input value={form.contact_phone} onChange={(event) => update('contact_phone', event.target.value)} required minLength={5} /></label>
      <label>Notes<textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Products, stall needs, timing questions" /></label>
      <button className="primary-button" type="submit" disabled={authLoading || submitting}>{authLoading ? 'Checking authentication...' : submitting ? 'Submitting...' : 'Submit booking request'}</button>
    </form>
  )
}

function LoginPage({ setUser }: { setUser: (user: User | null) => void }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await apiClient.login({ email, password })
      const me = await apiClient.me()
      setUser(me)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return <AuthForm title="Login" error={error} onSubmit={submit} email={email} setEmail={setEmail} password={password} setPassword={setPassword} />
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

function AuthForm({ title, error, onSubmit, email, setEmail, password, setPassword }: { title: string; error: string | null; onSubmit: (event: FormEvent) => void; email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void }) {
  return (
    <form className="auth-card" onSubmit={onSubmit}>
      <h1>{title}</h1>
      {error ? <p className="alert error">{error}</p> : null}
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button className="primary-button" type="submit">Login</button>
      <Link to="/register">Create vendor or organizer account</Link>
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
