from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password


def seed_super_admin(db: Session, email: str | None, password: str | None, name: str = "Super Admin") -> User | None:
    if not email or not password:
        return None
    normalized_email = email.lower()
    existing = db.scalar(select(User).where(User.email == normalized_email))
    if existing:
        return existing
    user = User(
        name=name,
        email=normalized_email,
        phone=None,
        password_hash=hash_password(password),
        role="super_admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
