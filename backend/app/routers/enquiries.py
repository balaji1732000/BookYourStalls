from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Enquiry, Event, Stall, User
from app.schemas import EnquiryCreate, EnquiryRead, EnquiryUpdate

router = APIRouter(prefix="/enquiries", tags=["enquiries"])


@router.post("", response_model=EnquiryRead, status_code=status.HTTP_201_CREATED)
def create_enquiry(
    payload: EnquiryCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    event = db.get(Event, payload.event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if payload.stall_id:
        stall = db.get(Stall, payload.stall_id)
        if not stall or stall.event_id != payload.event_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Stall does not belong to event")
    enquiry = Enquiry(**payload.model_dump(), vendor_id=current_user.id)
    db.add(enquiry)
    db.commit()
    db.refresh(enquiry)
    return enquiry


@router.get("", response_model=list[EnquiryRead])
def list_enquiries(db: DbSession, current_user: CurrentUser):
    if current_user.role == "super_admin":
        query = select(Enquiry)
    else:
        query = select(Enquiry).join(Event).where((Enquiry.vendor_id == current_user.id) | (Event.organizer_id == current_user.id))
    return list(db.scalars(query.order_by(Enquiry.created_at.desc())).all())


@router.get("/{enquiry_id}", response_model=EnquiryRead)
def get_enquiry(enquiry_id: int, db: DbSession, current_user: CurrentUser):
    enquiry = db.get(Enquiry, enquiry_id)
    if not enquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    if current_user.role != "super_admin" and enquiry.vendor_id != current_user.id and enquiry.event.organizer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return enquiry


@router.patch("/{enquiry_id}", response_model=EnquiryRead)
def update_enquiry(enquiry_id: int, payload: EnquiryUpdate, db: DbSession, current_user: CurrentUser):
    enquiry = db.get(Enquiry, enquiry_id)
    if not enquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    if current_user.role != "super_admin" and enquiry.event.organizer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only organizer can update enquiry")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(enquiry, key, value)
    db.commit()
    db.refresh(enquiry)
    return enquiry
