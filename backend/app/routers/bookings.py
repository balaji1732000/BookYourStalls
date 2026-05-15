from datetime import date
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select

from app.deps import CurrentUser, DbSession
from app.models import Booking, BookingStatus, Event, Stall, StallStatus, User
from app.schemas import BookingCreate, BookingRead

router = APIRouter(prefix="/bookings", tags=["bookings"])

ACTIVE_BOOKING_STATUSES = [BookingStatus.PENDING.value, BookingStatus.APPROVED.value, BookingStatus.CONFIRMED.value]


def _booking_or_404(booking_id: int, db: DbSession) -> Booking:
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking


def _ensure_booking_visible(booking: Booking, user: User) -> None:
    if user.role == "super_admin":
        return
    if booking.vendor_id == user.id:
        return
    if booking.event.organizer_id == user.id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _ensure_organizer_can_manage(booking: Booking, user: User) -> None:
    if user.role != "super_admin" and booking.event.organizer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only organizer can manage this booking")


@router.post("", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    event = db.get(Event, payload.event_id)
    stall = db.get(Stall, payload.stall_id)
    if not event or not stall or stall.event_id != event.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid event or stall")
    if event.status != "published":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bookings are allowed only for published events")
    if event.end_date < date.today():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bookings are closed for past events")
    if stall.status != StallStatus.AVAILABLE.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stall is not available")
    active_booking = db.scalar(
        select(Booking).where(
            Booking.stall_id == stall.id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
    )
    if active_booking:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stall already has an active booking")
    booking = Booking(
        **payload.model_dump(),
        vendor_id=current_user.id,
        total_amount=stall.price,
        booking_reference=f"BYS-{uuid4().hex[:10].upper()}",
        status=BookingStatus.PENDING.value,
    )
    stall.status = StallStatus.ON_HOLD.value
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@router.get("", response_model=list[BookingRead])
def list_bookings(
    db: DbSession,
    current_user: CurrentUser,
    search: str | None = Query(default=None, min_length=1),
):
    if current_user.role == "super_admin":
        query = select(Booking).join(User, Booking.vendor_id == User.id)
    else:
        query = (
            select(Booking)
            .join(Event)
            .join(User, Booking.vendor_id == User.id)
            .where(or_(Booking.vendor_id == current_user.id, Event.organizer_id == current_user.id))
        )
    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                Booking.booking_reference.ilike(term),
                Booking.business_name.ilike(term),
                Booking.contact_name.ilike(term),
                User.name.ilike(term),
                User.email.ilike(term),
            )
        )
    return list(db.scalars(query.order_by(Booking.created_at.desc())).all())


@router.get("/{booking_id}", response_model=BookingRead)
def get_booking(booking_id: int, db: DbSession, current_user: CurrentUser):
    booking = _booking_or_404(booking_id, db)
    _ensure_booking_visible(booking, current_user)
    return booking


@router.post("/{booking_id}/approve", response_model=BookingRead)
def approve_booking(booking_id: int, db: DbSession, current_user: CurrentUser):
    booking = _booking_or_404(booking_id, db)
    _ensure_organizer_can_manage(booking, current_user)
    if booking.status not in [BookingStatus.PENDING.value, BookingStatus.CONFIRMED.value]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking cannot be approved")
    booking.status = BookingStatus.APPROVED.value
    booking.stall.status = StallStatus.BOOKED.value
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/reject", response_model=BookingRead)
def reject_booking(booking_id: int, db: DbSession, current_user: CurrentUser):
    booking = _booking_or_404(booking_id, db)
    _ensure_organizer_can_manage(booking, current_user)
    if booking.status not in [BookingStatus.PENDING.value]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking cannot be rejected")
    booking.status = BookingStatus.REJECTED.value
    booking.stall.status = StallStatus.AVAILABLE.value
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/cancel", response_model=BookingRead)
def cancel_booking(booking_id: int, db: DbSession, current_user: CurrentUser):
    booking = _booking_or_404(booking_id, db)
    _ensure_booking_visible(booking, current_user)
    if booking.status in [BookingStatus.REJECTED.value, BookingStatus.CANCELLED.value]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking cannot be cancelled")
    booking.status = BookingStatus.CANCELLED.value
    booking.stall.status = StallStatus.AVAILABLE.value
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/confirm", response_model=BookingRead)
def confirm_booking(booking_id: int, db: DbSession, current_user: CurrentUser):
    booking = _booking_or_404(booking_id, db)
    _ensure_organizer_can_manage(booking, current_user)
    if booking.status != BookingStatus.PENDING.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking cannot be confirmed")
    booking.status = BookingStatus.CONFIRMED.value
    booking.stall.status = StallStatus.BOOKED.value
    db.commit()
    db.refresh(booking)
    return booking
