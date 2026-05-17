import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.config import settings
from app.deps import CurrentUser, DbSession
from app.models import OtpChallenge, User
from app.schemas import (
    LoginRequest,
    OtpRequest,
    OtpRequestResponse,
    OtpTokenResponse,
    OtpVerifyRequest,
    TokenResponse,
    UserCreate,
    UserRead,
)
from app.security import create_access_token, hash_password, verify_password
from app.sms import OtpProvider, get_configured_otp_provider

router = APIRouter(prefix="/auth", tags=["auth"])


def get_otp_provider() -> OtpProvider:
    return get_configured_otp_provider()


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        digits = f"91{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        digits = f"91{digits[1:]}"
    if not (10 <= len(digits) <= 15):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid phone number")
    return digits


def _token_for_user(user: User) -> str:
    return create_access_token(str(user.id), timedelta(minutes=settings.access_token_expire_minutes))


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: DbSession):
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    role = "super_admin" if payload.role == "super_admin" else "member"
    user = User(
        name=payload.name,
        email=payload.email.lower(),
        phone=normalize_phone(payload.phone) if payload.phone else None,
        password_hash=hash_password(payload.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return TokenResponse(access_token=_token_for_user(user))


@router.post("/otp/request", response_model=OtpRequestResponse)
def request_phone_otp(
    payload: OtpRequest,
    db: DbSession,
    otp_provider: Annotated[OtpProvider, Depends(get_otp_provider)],
):
    phone = normalize_phone(payload.phone)
    provider_session_id = otp_provider.request_otp(phone)
    challenge = OtpChallenge(
        id=secrets.token_urlsafe(24),
        phone=phone,
        provider_session_id=provider_session_id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.otp_expire_minutes),
    )
    db.add(challenge)
    db.commit()
    return OtpRequestResponse(
        challenge_id=challenge.id,
        expires_in_seconds=settings.otp_expire_minutes * 60,
        resend_after_seconds=settings.otp_resend_after_seconds,
    )


@router.post("/otp/verify", response_model=OtpTokenResponse)
def verify_phone_otp(
    payload: OtpVerifyRequest,
    db: DbSession,
    otp_provider: Annotated[OtpProvider, Depends(get_otp_provider)],
):
    phone = normalize_phone(payload.phone)
    challenge = db.get(OtpChallenge, payload.challenge_id)
    now = datetime.now(timezone.utc)
    if not challenge or challenge.phone != phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP challenge")
    if challenge.consumed_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP challenge already used")
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP challenge expired")
    if challenge.attempt_count >= challenge.max_attempts:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many OTP attempts")

    challenge.attempt_count += 1
    if not otp_provider.verify_otp(challenge.provider_session_id, payload.otp):
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP")

    user = db.scalar(select(User).where(User.phone == phone))
    is_new_user = user is None
    if user is None:
        user = User(
            name=f"User {phone[-4:]}",
            email=None,
            phone=phone,
            phone_verified_at=now,
            password_hash=None,
            role="member",
        )
        db.add(user)
    else:
        user.phone_verified_at = user.phone_verified_at or now
    challenge.consumed_at = now
    db.commit()
    db.refresh(user)
    return OtpTokenResponse(access_token=_token_for_user(user), user=user, is_new_user=is_new_user)


@router.get("/me", response_model=UserRead)
def me(current_user: CurrentUser):
    return current_user
