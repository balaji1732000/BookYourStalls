from datetime import date
from decimal import Decimal
import json

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Event, EventStatus, Stall, User
from app.schemas import EventCreate, EventDetailRead, EventList, EventRead, EventUpdate

router = APIRouter(prefix="/events", tags=["events"])


def _get_event_or_404(event_id: int, db: DbSession) -> Event:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _ensure_owner(event: Event, user: User) -> None:
    if user.role != "super_admin" and event.organizer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only event owner can perform this action")


def _normalize_list(values: list[str] | None, fallback: str | None = None) -> list[str]:
    normalized = []
    for value in values or []:
        cleaned = value.strip() if isinstance(value, str) else ""
        if cleaned and cleaned not in normalized:
            normalized.append(cleaned)
    if not normalized and fallback:
        normalized.append(fallback.strip())
    return normalized


def _json_list(values: list[str]) -> str:
    return json.dumps(values, ensure_ascii=False)


def _loads_json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return [value]


def _event_matches_list_field(event: Event, field_name: str, expected: str) -> bool:
    values = _loads_json_list(getattr(event, field_name))
    return expected in values


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end_date must be after start_date")
    categories = _normalize_list(payload.categories, payload.category)
    if not categories:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one event category is required")
    event_data = payload.model_dump(exclude={"categories", "allowed_vendor_categories"})
    event_data["category"] = categories[0]
    event_data["categories"] = _json_list(categories)
    event_data["allowed_vendor_categories"] = _json_list(_normalize_list(payload.allowed_vendor_categories))
    event = Event(**event_data, organizer_id=current_user.id)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=EventList)
def list_events(
    db: DbSession,
    city: str | None = None,
    crowd_type: str | None = None,
    category: str | None = None,
    vendor_category: str | None = None,
    start_date_from: date | None = None,
    start_date_to: date | None = None,
    min_footfall: int | None = Query(default=None, ge=0),
    max_footfall: int | None = Query(default=None, ge=0),
    min_stall_price: Decimal | None = Query(default=None, ge=0),
    max_stall_price: Decimal | None = Query(default=None, ge=0),
    include_drafts: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    query = select(Event)
    if not include_drafts:
        query = query.where(Event.status == EventStatus.PUBLISHED.value)
    if city:
        query = query.where(Event.city == city)
    if crowd_type:
        query = query.where(Event.crowd_type == crowd_type)
    if category:
        pass
    if start_date_from:
        query = query.where(Event.start_date >= start_date_from)
    if start_date_to:
        query = query.where(Event.start_date <= start_date_to)
    if min_footfall is not None:
        query = query.where(Event.expected_footfall >= min_footfall)
    if max_footfall is not None:
        query = query.where(Event.expected_footfall <= max_footfall)
    if min_stall_price is not None or max_stall_price is not None:
        query = query.join(Stall)
        if min_stall_price is not None:
            query = query.where(Stall.price >= min_stall_price)
        if max_stall_price is not None:
            query = query.where(Stall.price <= max_stall_price)
        query = query.distinct()
    all_items = list(db.scalars(query.order_by(Event.start_date.asc())).all())
    if category:
        all_items = [event for event in all_items if event.category == category or _event_matches_list_field(event, "categories", category)]
    if vendor_category:
        all_items = [event for event in all_items if _event_matches_list_field(event, "allowed_vendor_categories", vendor_category)]
    return EventList(items=all_items[offset : offset + limit], total=len(all_items))


@router.get("/mine", response_model=EventList)
def list_my_events(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    query = select(Event).where(Event.organizer_id == current_user.id).order_by(Event.start_date.asc())
    all_items = list(db.scalars(query).all())
    return EventList(items=all_items[offset : offset + limit], total=len(all_items))


@router.get("/{event_id}/detail", response_model=EventDetailRead)
def get_event_detail(event_id: int, db: DbSession):
    event = _get_event_or_404(event_id, db)
    if event.status != EventStatus.PUBLISHED.value:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: int, db: DbSession):
    event = _get_event_or_404(event_id, db)
    if event.status != EventStatus.PUBLISHED.value:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.patch("/{event_id}", response_model=EventRead)
def update_event(event_id: int, payload: EventUpdate, db: DbSession, current_user: CurrentUser):
    event = _get_event_or_404(event_id, db)
    _ensure_owner(event, current_user)
    update_data = payload.model_dump(exclude_unset=True)
    if "categories" in update_data or "category" in update_data:
        categories = _normalize_list(update_data.pop("categories", None), update_data.get("category"))
        if not categories:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one event category is required")
        update_data["category"] = categories[0]
        update_data["categories"] = _json_list(categories)
    if "allowed_vendor_categories" in update_data:
        update_data["allowed_vendor_categories"] = _json_list(_normalize_list(update_data["allowed_vendor_categories"]))
    for key, value in update_data.items():
        setattr(event, key, value)
    if event.end_date < event.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="end_date must be after start_date")
    db.commit()
    db.refresh(event)
    return event


@router.post("/{event_id}/publish", response_model=EventRead)
def publish_event(event_id: int, db: DbSession, current_user: CurrentUser):
    event = _get_event_or_404(event_id, db)
    _ensure_owner(event, current_user)
    event.status = EventStatus.PUBLISHED.value
    db.commit()
    db.refresh(event)
    return event


@router.post("/{event_id}/cancel", response_model=EventRead)
def cancel_event(event_id: int, db: DbSession, current_user: CurrentUser):
    event = _get_event_or_404(event_id, db)
    _ensure_owner(event, current_user)
    event.status = EventStatus.CANCELLED.value
    db.commit()
    db.refresh(event)
    return event
