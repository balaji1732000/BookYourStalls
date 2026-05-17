import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.deps import get_db
from app.routers.auth import get_otp_provider
from app.main import app


@pytest.fixture()
def otp_provider():
    class FakeOtpProvider:
        def __init__(self):
            self.sent = []
            self.valid_codes = {}

        def request_otp(self, phone: str) -> str:
            session_id = f"fake-session-{len(self.sent) + 1}"
            self.sent.append({"phone": phone, "session_id": session_id})
            self.valid_codes[session_id] = "123456"
            return session_id

        def verify_otp(self, session_id: str, otp: str) -> bool:
            return self.valid_codes.get(session_id) == otp

    provider = FakeOtpProvider()
    app.dependency_overrides[get_otp_provider] = lambda: provider
    try:
        yield provider
    finally:
        app.dependency_overrides.pop(get_otp_provider, None)


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
