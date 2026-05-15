from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    MEMBER = "member"


class EventStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class StallStatus(StrEnum):
    AVAILABLE = "available"
    ON_HOLD = "on_hold"
    BOOKED = "booked"
    UNAVAILABLE = "unavailable"


class EnquiryStatus(StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    CONVERTED = "converted"
    CLOSED = "closed"


class BookingStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    CONFIRMED = "confirmed"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), index=True)
    is_active: Mapped[bool] = mapped_column(default=True)

    events: Mapped[list["Event"]] = relationship(back_populates="organizer")
    enquiries: Mapped[list["Enquiry"]] = relationship(back_populates="vendor")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="vendor")
    organizer_profile: Mapped["OrganizerProfile | None"] = relationship(back_populates="user", uselist=False)
    vendor_profile: Mapped["VendorProfile | None"] = relationship(back_populates="user", uselist=False)


class OrganizerProfile(Base, TimestampMixin):
    __tablename__ = "organizer_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    company_name: Mapped[str] = mapped_column(String(200))
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    user: Mapped[User] = relationship(back_populates="organizer_profile")


class VendorProfile(Base, TimestampMixin):
    __tablename__ = "vendor_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    business_name: Mapped[str] = mapped_column(String(200))
    business_category: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    gst_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    user: Mapped[User] = relationship(back_populates="vendor_profile")


class Event(Base, TimestampMixin):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    organizer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(100), index=True)
    venue_name: Mapped[str] = mapped_column(String(200))
    venue_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date, index=True)
    crowd_type: Mapped[str] = mapped_column(String(100), index=True)
    expected_footfall: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[str] = mapped_column(String(100), index=True)
    categories: Mapped[str] = mapped_column(Text, default="[]")
    allowed_vendor_categories: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(30), default=EventStatus.DRAFT.value, index=True)
    banner_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    organizer: Mapped[User] = relationship(back_populates="events")
    stalls: Mapped[list["Stall"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    enquiries: Mapped[list["Enquiry"]] = relationship(back_populates="event")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="event")


class Stall(Base, TimestampMixin):
    __tablename__ = "stalls"
    __table_args__ = (UniqueConstraint("event_id", "stall_code", name="uq_event_stall_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    stall_code: Mapped[str] = mapped_column(String(50), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    size: Mapped[str | None] = mapped_column(String(100), nullable=True)
    zone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    amenities: Mapped[str | None] = mapped_column(Text, nullable=True)
    layout_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=StallStatus.AVAILABLE.value, index=True)

    event: Mapped[Event] = relationship(back_populates="stalls")
    enquiries: Mapped[list["Enquiry"]] = relationship(back_populates="stall")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="stall")


class Enquiry(Base, TimestampMixin):
    __tablename__ = "enquiries"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    stall_id: Mapped[int | None] = mapped_column(ForeignKey("stalls.id"), nullable=True, index=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default=EnquiryStatus.NEW.value, index=True)
    organizer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    event: Mapped[Event] = relationship(back_populates="enquiries")
    stall: Mapped[Stall | None] = relationship(back_populates="enquiries")
    vendor: Mapped[User] = relationship(back_populates="enquiries")


class Booking(Base, TimestampMixin):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    stall_id: Mapped[int] = mapped_column(ForeignKey("stalls.id"), index=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    booking_reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default=BookingStatus.PENDING.value, index=True)
    business_name: Mapped[str] = mapped_column(String(200))
    contact_name: Mapped[str] = mapped_column(String(120))
    contact_phone: Mapped[str] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    event: Mapped[Event] = relationship(back_populates="bookings")
    stall: Mapped[Stall] = relationship(back_populates="bookings")
    vendor: Mapped[User] = relationship(back_populates="bookings")
