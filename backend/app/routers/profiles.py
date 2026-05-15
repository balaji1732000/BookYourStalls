from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import OrganizerProfile, VendorProfile
from app.schemas import (
    OrganizerProfileRead,
    OrganizerProfileUpsert,
    VendorProfileRead,
    VendorProfileUpsert,
)

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/organizer/me", response_model=OrganizerProfileRead)
def get_my_organizer_profile(
    db: DbSession,
    current_user: CurrentUser,
):
    profile = db.scalar(select(OrganizerProfile).where(OrganizerProfile.user_id == current_user.id))
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organizer profile not found")
    return profile


@router.put("/organizer/me", response_model=OrganizerProfileRead)
def upsert_my_organizer_profile(
    payload: OrganizerProfileUpsert,
    db: DbSession,
    current_user: CurrentUser,
):
    profile = db.scalar(select(OrganizerProfile).where(OrganizerProfile.user_id == current_user.id))
    if profile:
        for key, value in payload.model_dump().items():
            setattr(profile, key, value)
    else:
        profile = OrganizerProfile(**payload.model_dump(), user_id=current_user.id)
        db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/vendor/me", response_model=VendorProfileRead)
def get_my_vendor_profile(
    db: DbSession,
    current_user: CurrentUser,
):
    profile = db.scalar(select(VendorProfile).where(VendorProfile.user_id == current_user.id))
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor profile not found")
    return profile


@router.put("/vendor/me", response_model=VendorProfileRead)
def upsert_my_vendor_profile(
    payload: VendorProfileUpsert,
    db: DbSession,
    current_user: CurrentUser,
):
    profile = db.scalar(select(VendorProfile).where(VendorProfile.user_id == current_user.id))
    if profile:
        for key, value in payload.model_dump().items():
            setattr(profile, key, value)
    else:
        profile = VendorProfile(**payload.model_dump(), user_id=current_user.id)
        db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
