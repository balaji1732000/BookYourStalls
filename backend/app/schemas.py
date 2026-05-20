from datetime import date, datetime
from decimal import Decimal
import json

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, field_validator


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = None
    password: str = Field(min_length=8)
    role: str = Field(default="member", pattern="^(member|organizer|vendor|super_admin)$")


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr | None
    email_verified_at: datetime | None = None
    phone: str | None
    phone_verified_at: datetime | None = None
    role: str
    is_active: bool
    created_at: datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class OtpRequest(BaseModel):
    email: EmailStr


class OtpRequestResponse(BaseModel):
    challenge_id: str
    expires_in_seconds: int
    resend_after_seconds: int


class OtpVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=8, max_length=80)
    email: EmailStr
    otp: str = Field(pattern="^[0-9]{4,8}$")


class OtpTokenResponse(TokenResponse):
    user: UserRead
    is_new_user: bool


class OrganizerProfileUpsert(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    website: str | None = Field(default=None, max_length=255)
    address: str | None = None
    city: str | None = Field(default=None, max_length=100)


class OrganizerProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    company_name: str
    website: str | None
    address: str | None
    city: str | None
    created_at: datetime
    updated_at: datetime


class VendorProfileUpsert(BaseModel):
    business_name: str = Field(min_length=2, max_length=200)
    business_category: str | None = Field(default=None, max_length=120)
    gst_number: str | None = Field(default=None, max_length=30)
    address: str | None = None
    city: str | None = Field(default=None, max_length=100)


class VendorProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    business_name: str
    business_category: str | None
    gst_number: str | None
    address: str | None
    city: str | None
    created_at: datetime
    updated_at: datetime


def _list_from_json_text(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return [value] if value else []
    return []


class EventCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    city: str = Field(min_length=2, max_length=100)
    venue_name: str = Field(min_length=2, max_length=200)
    venue_address: str | None = None
    start_date: date
    end_date: date
    crowd_type: str = Field(min_length=2, max_length=100)
    expected_footfall: int | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, min_length=2, max_length=100)
    categories: list[str] = Field(default_factory=list)
    allowed_vendor_categories: list[str] = Field(default_factory=list)
    banner_image_url: str | None = Field(default=None, max_length=500)


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    city: str | None = Field(default=None, min_length=2, max_length=100)
    venue_name: str | None = Field(default=None, min_length=2, max_length=200)
    venue_address: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    crowd_type: str | None = Field(default=None, min_length=2, max_length=100)
    expected_footfall: int | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, min_length=2, max_length=100)
    categories: list[str] | None = None
    allowed_vendor_categories: list[str] | None = None
    banner_image_url: str | None = Field(default=None, max_length=500)


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organizer_id: int
    title: str
    description: str | None
    city: str
    venue_name: str
    venue_address: str | None
    start_date: date
    end_date: date
    crowd_type: str
    expected_footfall: int | None
    category: str
    categories: list[str]
    allowed_vendor_categories: list[str]
    banner_image_url: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    @field_validator("categories", "allowed_vendor_categories", mode="before")
    @classmethod
    def parse_json_list_fields(cls, value):
        return _list_from_json_text(value)


class EventList(BaseModel):
    items: list[EventRead]
    total: int


class EventDetailRead(EventRead):
    stalls: list["StallRead"]


class StallCreate(BaseModel):
    stall_code: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    size: str | None = None
    zone: str | None = None
    price: Decimal = Field(ge=0)
    amenities: str | None = None
    layout_image_url: str | None = Field(default=None, max_length=500)


class StallPackageCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    size: str | None = None
    zone: str | None = None
    price: Decimal = Field(ge=0)
    amenities: str | None = None
    layout_image_url: str | None = Field(default=None, max_length=500)
    code_prefix: str = Field(min_length=1, max_length=20)
    start_number: int = Field(default=1, ge=0)
    quantity: int = Field(ge=1, le=500)


class StallUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    size: str | None = None
    zone: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    amenities: str | None = None
    layout_image_url: str | None = Field(default=None, max_length=500)
    status: str | None = Field(default=None, pattern="^(available|on_hold|booked|unavailable)$")


class StallRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    stall_code: str
    title: str
    description: str | None
    size: str | None
    zone: str | None
    price: Decimal
    amenities: str | None
    layout_image_url: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    @field_serializer("price")
    def serialize_price(self, value: Decimal):
        return float(value)


class EnquiryCreate(BaseModel):
    event_id: int
    stall_id: int | None = None
    message: str = Field(min_length=2)


class EnquiryUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(new|contacted|converted|closed)$")
    organizer_notes: str | None = None


class EnquiryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    stall_id: int | None
    vendor_id: int
    message: str
    status: str
    organizer_notes: str | None
    created_at: datetime
    updated_at: datetime


class BookingCreate(BaseModel):
    event_id: int
    stall_id: int
    business_name: str = Field(min_length=2, max_length=200)
    contact_name: str = Field(min_length=2, max_length=120)
    contact_phone: str = Field(min_length=5, max_length=30)
    notes: str | None = None


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    stall_id: int
    vendor_id: int
    booking_reference: str
    status: str
    business_name: str
    contact_name: str
    contact_phone: str
    notes: str | None
    total_amount: Decimal
    organizer_contact_name: str | None = None
    organizer_contact_phone: str | None = None
    vendor_contact_name: str | None = None
    vendor_contact_phone: str | None = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("total_amount")
    def serialize_total_amount(self, value: Decimal):
        return float(value)
