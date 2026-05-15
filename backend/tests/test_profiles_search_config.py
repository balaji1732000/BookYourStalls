from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base

from tests.test_api_flow import login, register


def test_organizer_and_vendor_can_upsert_and_read_profiles(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    register(client, "Vendor One", "vendor@example.com", "vendor")
    org_headers = login(client, "org@example.com")
    vendor_headers = login(client, "vendor@example.com")

    org_profile = client.put(
        "/api/v1/profiles/organizer/me",
        headers=org_headers,
        json={
            "company_name": "Expo Makers",
            "website": "https://expomakers.example",
            "address": "Anna Salai",
            "city": "Chennai",
        },
    )
    assert org_profile.status_code == 200, org_profile.text
    assert org_profile.json()["company_name"] == "Expo Makers"
    assert org_profile.json()["user_id"]

    fetched_org = client.get("/api/v1/profiles/organizer/me", headers=org_headers)
    assert fetched_org.status_code == 200
    assert fetched_org.json()["city"] == "Chennai"

    vendor_profile = client.put(
        "/api/v1/profiles/vendor/me",
        headers=vendor_headers,
        json={
            "business_name": "Yuneekway",
            "business_category": "Vintage thrift clothing",
            "gst_number": "33ABCDE1234F1Z5",
            "address": "T Nagar",
            "city": "Chennai",
        },
    )
    assert vendor_profile.status_code == 200, vendor_profile.text
    assert vendor_profile.json()["business_name"] == "Yuneekway"

    member_vendor_profile = client.put(
        "/api/v1/profiles/vendor/me",
        headers=org_headers,
        json={"business_name": "Expo Makers Merch"},
    )
    assert member_vendor_profile.status_code == 200
    assert member_vendor_profile.json()["business_name"] == "Expo Makers Merch"


def test_event_discovery_filters_by_stall_price_and_footfall(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    org_headers = login(client, "org@example.com")

    premium_event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Premium Chennai Expo",
            "city": "Chennai",
            "venue_name": "Trade Centre",
            "start_date": "2026-09-01",
            "end_date": "2026-09-03",
            "crowd_type": "families",
            "expected_footfall": 20000,
            "category": "shopping",
        },
    ).json()
    budget_event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Budget Chennai Market",
            "city": "Chennai",
            "venue_name": "Community Hall",
            "start_date": "2026-09-10",
            "end_date": "2026-09-11",
            "crowd_type": "students",
            "expected_footfall": 2000,
            "category": "shopping",
        },
    ).json()
    client.post(f"/api/v1/events/{premium_event['id']}/publish", headers=org_headers)
    client.post(f"/api/v1/events/{budget_event['id']}/publish", headers=org_headers)
    client.post(
        f"/api/v1/events/{premium_event['id']}/stalls",
        headers=org_headers,
        json={"stall_code": "P1", "title": "Premium", "size": "10x10", "price": 50000},
    )
    client.post(
        f"/api/v1/events/{budget_event['id']}/stalls",
        headers=org_headers,
        json={"stall_code": "B1", "title": "Budget", "size": "6x6", "price": 8000},
    )

    response = client.get("/api/v1/events?city=Chennai&max_stall_price=10000&min_footfall=1000&max_footfall=5000")

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["title"] for item in items] == ["Budget Chennai Market"]


def test_cors_allows_react_dev_origin(client):
    response = client.options(
        "/api/v1/events",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_seed_super_admin_creates_admin_user_once():
    from app.models import User
    from app.seed import seed_super_admin

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        seed_super_admin(db, email="admin@bookyourstall.test", password="StrongPass123", name="Root Admin")
        seed_super_admin(db, email="admin@bookyourstall.test", password="StrongPass123", name="Root Admin")
        users = list(db.scalars(select(User)).all())
    finally:
        db.close()

    assert len(users) == 1
    assert users[0].email == "admin@bookyourstall.test"
    assert users[0].role == "super_admin"
