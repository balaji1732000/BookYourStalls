from decimal import Decimal

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Booking, BookingStatus, Enquiry, Event, Stall, StallStatus

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _status_count(items, status: str) -> int:
    return len([item for item in items if item.status == status])


@router.get("/organizer")
def organizer_dashboard(db: DbSession, current_user: CurrentUser):
    event_query = select(Event)
    booking_query = select(Booking)
    stall_query = select(Stall)
    enquiry_query = select(Enquiry)
    if current_user.role != "super_admin":
        event_query = event_query.where(Event.organizer_id == current_user.id)
        booking_query = booking_query.join(Event).where(Event.organizer_id == current_user.id)
        stall_query = stall_query.join(Event).where(Event.organizer_id == current_user.id)
        enquiry_query = enquiry_query.join(Event).where(Event.organizer_id == current_user.id)
    events = list(db.scalars(event_query).all())
    bookings = list(db.scalars(booking_query).all())
    stalls = list(db.scalars(stall_query).all())
    enquiries = list(db.scalars(enquiry_query).all())
    approved_revenue = sum(
        (b.total_amount for b in bookings if b.status in [BookingStatus.APPROVED.value, BookingStatus.CONFIRMED.value]),
        Decimal("0"),
    )
    return {
        "events_count": len(events),
        "published_events_count": _status_count(events, "published"),
        "draft_events_count": _status_count(events, "draft"),
        "bookings_count": len(bookings),
        "pending_bookings_count": _status_count(bookings, BookingStatus.PENDING.value),
        "approved_bookings_count": _status_count(bookings, BookingStatus.APPROVED.value),
        "confirmed_bookings_count": _status_count(bookings, BookingStatus.CONFIRMED.value),
        "rejected_bookings_count": _status_count(bookings, BookingStatus.REJECTED.value),
        "cancelled_bookings_count": _status_count(bookings, BookingStatus.CANCELLED.value),
        "stalls_count": len(stalls),
        "available_stalls_count": _status_count(stalls, StallStatus.AVAILABLE.value),
        "on_hold_stalls_count": _status_count(stalls, StallStatus.ON_HOLD.value),
        "booked_stalls_count": _status_count(stalls, StallStatus.BOOKED.value),
        "unavailable_stalls_count": _status_count(stalls, StallStatus.UNAVAILABLE.value),
        "enquiries_count": len(enquiries),
        "new_enquiries_count": _status_count(enquiries, "new"),
        "approved_revenue": float(approved_revenue),
    }


@router.get("/admin")
def admin_dashboard(db: DbSession, current_user: CurrentUser):
    if current_user.role != "super_admin":
        return organizer_dashboard(db, current_user)
    return organizer_dashboard(db, current_user)
