from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbSession
from app.models import Event, Stall, StallStatus
from app.schemas import StallCreate, StallPackageCreate, StallRead, StallUpdate

router = APIRouter(tags=["stalls"])


def ensure_event_owner(event: Event, user) -> None:
    if user.role != "super_admin" and event.organizer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only event owner can perform this action")


def get_stall_or_404(stall_id: int, db: DbSession) -> Stall:
    stall = db.get(Stall, stall_id)
    if not stall:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stall not found")
    return stall


@router.post("/events/{event_id}/stalls", response_model=StallRead, status_code=status.HTTP_201_CREATED)
def create_stall(event_id: int, payload: StallCreate, db: DbSession, current_user: CurrentUser):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    ensure_event_owner(event, current_user)
    stall = Stall(**payload.model_dump(), event_id=event_id, status=StallStatus.AVAILABLE.value)
    db.add(stall)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stall code already exists for this event")
    db.refresh(stall)
    return stall


@router.post("/events/{event_id}/stall-packages", response_model=list[StallRead], status_code=status.HTTP_201_CREATED)
def create_stall_package(event_id: int, payload: StallPackageCreate, db: DbSession, current_user: CurrentUser):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    ensure_event_owner(event, current_user)
    width = max(2, len(str(payload.start_number + payload.quantity - 1)))
    stall_codes = [f"{payload.code_prefix}{number:0{width}d}" for number in range(payload.start_number, payload.start_number + payload.quantity)]
    existing_code = db.scalar(select(Stall.stall_code).where(Stall.event_id == event_id, Stall.stall_code.in_(stall_codes)).limit(1))
    if existing_code:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stall code already exists for this event")
    stalls = [
        Stall(
            event_id=event_id,
            stall_code=stall_code,
            title=payload.title,
            description=payload.description,
            size=payload.size,
            zone=payload.zone,
            price=payload.price,
            amenities=payload.amenities,
            layout_image_url=payload.layout_image_url,
            status=StallStatus.AVAILABLE.value,
        )
        for stall_code in stall_codes
    ]
    db.add_all(stalls)
    db.commit()
    for stall in stalls:
        db.refresh(stall)
    return stalls


@router.get("/events/{event_id}/stalls", response_model=list[StallRead])
def list_event_stalls(event_id: int, db: DbSession):
    return list(db.scalars(select(Stall).where(Stall.event_id == event_id).order_by(Stall.stall_code)).all())


@router.get("/stalls/{stall_id}", response_model=StallRead)
def get_stall(stall_id: int, db: DbSession):
    return get_stall_or_404(stall_id, db)


@router.patch("/stalls/{stall_id}", response_model=StallRead)
def update_stall(stall_id: int, payload: StallUpdate, db: DbSession, current_user: CurrentUser):
    stall = get_stall_or_404(stall_id, db)
    ensure_event_owner(stall.event, current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(stall, key, value)
    db.commit()
    db.refresh(stall)
    return stall


@router.delete("/stalls/{stall_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stall(stall_id: int, db: DbSession, current_user: CurrentUser):
    stall = get_stall_or_404(stall_id, db)
    ensure_event_owner(stall.event, current_user)
    db.delete(stall)
    db.commit()
    return None
