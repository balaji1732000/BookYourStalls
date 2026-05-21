export type UserRole = 'member' | 'super_admin'

export interface User {
  id: number
  name: string
  email: string | null
  email_verified_at?: string | null
  phone: string | null
  phone_verified_at?: string | null
  city?: string | null
  onboarding_intent?: string | null
  business_name?: string | null
  business_category?: string | null
  profile_completed_at?: string | null
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface EventItem {
  id: number
  organizer_id: number
  title: string
  description: string | null
  city: string
  venue_name: string
  venue_address: string | null
  start_date: string
  end_date: string
  crowd_type: string
  expected_footfall: number | null
  category: string
  categories: string[]
  allowed_vendor_categories: string[]
  banner_image_url: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface EventCreate {
  title: string
  description?: string | null
  city: string
  venue_name: string
  venue_address?: string | null
  start_date: string
  end_date: string
  crowd_type: string
  expected_footfall?: number | null
  category?: string | null
  categories: string[]
  allowed_vendor_categories?: string[]
  banner_image_url?: string | null
}

export interface EventListResponse {
  items: EventItem[]
  total: number
}

export interface Stall {
  id: number
  event_id: number
  stall_code: string
  title: string
  description: string | null
  size: string | null
  zone: string | null
  price: number
  amenities: string | null
  layout_image_url: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface EventDetail extends EventItem {
  stalls: Stall[]
}

export interface StallPackageCreate {
  title: string
  description?: string | null
  size?: string | null
  zone?: string | null
  price: number
  amenities?: string | null
  layout_image_url?: string | null
  code_prefix: string
  start_number: number
  quantity: number
}

export interface BookingCreate {
  event_id: number
  stall_id: number
  business_name: string
  contact_name: string
  contact_phone: string
  notes?: string
}

export interface BookingRead extends BookingCreate {
  id: number
  vendor_id: number
  booking_reference: string
  status: string
  total_amount: number
  organizer_contact_name?: string | null
  organizer_contact_phone?: string | null
  vendor_contact_name?: string | null
  vendor_contact_phone?: string | null
  created_at: string
  updated_at: string
}
