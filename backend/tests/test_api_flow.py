def register(client, name, email, role="member"):
    payload = {
        "name": name,
        "email": email,
        "phone": "9999999999",
        "password": "StrongPass123",
    }
    if role is not None:
        payload["role"] = role
    response = client.post(
        "/api/v1/auth/register",
        json=payload,
    )
    assert response.status_code == 201, response.text
    return response.json()


def login(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "StrongPass123"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_register_login_and_me_defaults_to_member(client):
    registered = register(client, "Balaji", "member@example.com", role=None)
    assert registered["role"] == "member"
    headers = login(client, "member@example.com")

    response = client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "member@example.com"
    assert body["role"] == "member"
    assert "password" not in body
    assert "password_hash" not in body


def test_member_creates_publishes_event_with_multi_categories_and_filters_it(client):
    member = register(client, "Member One", "member1@example.com", role=None)
    member_headers = login(client, "member1@example.com")

    create_response = client.post(
        "/api/v1/events",
        headers=member_headers,
        json={
            "title": "Chennai Summer Expo",
            "description": "High footfall shopping expo",
            "city": "Chennai",
            "venue_name": "Trade Centre",
            "venue_address": "Nandambakkam",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
            "crowd_type": "Families",
            "expected_footfall": 10000,
            "categories": ["Shopping expo", "Thrift/vintage market"],
            "allowed_vendor_categories": ["Clothing", "Thrift/vintage clothing", "Accessories"],
        },
    )
    assert create_response.status_code == 201, create_response.text
    event = create_response.json()
    event_id = event["id"]
    assert event["organizer_id"] == member["id"]
    assert event["status"] == "draft"
    assert event["categories"] == ["Shopping expo", "Thrift/vintage market"]
    assert "Thrift/vintage clothing" in event["allowed_vendor_categories"]

    publish_response = client.post(f"/api/v1/events/{event_id}/publish", headers=member_headers)
    assert publish_response.status_code == 200
    assert publish_response.json()["status"] == "published"

    by_category = client.get("/api/v1/events?category=Thrift%2Fvintage%20market")
    assert by_category.status_code == 200
    assert [item["id"] for item in by_category.json()["items"]] == [event_id]

    by_vendor_category = client.get("/api/v1/events?vendor_category=Accessories")
    assert by_vendor_category.status_code == 200
    assert [item["id"] for item in by_vendor_category.json()["items"]] == [event_id]

    my_events = client.get("/api/v1/events/mine", headers=member_headers)
    assert my_events.status_code == 200
    assert [item["id"] for item in my_events.json()["items"]] == [event_id]


def test_only_event_owner_can_create_stalls(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    register(client, "Other Organizer", "other@example.com", "organizer")
    org_headers = login(client, "org@example.com")
    other_headers = login(client, "other@example.com")

    event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Madurai Fest",
            "city": "Madurai",
            "venue_name": "Ground",
            "start_date": "2026-07-10",
            "end_date": "2026-07-11",
            "crowd_type": "youth",
            "category": "food",
        },
    ).json()

    forbidden = client.post(
        f"/api/v1/events/{event['id']}/stalls",
        headers=other_headers,
        json={"stall_code": "A1", "title": "Prime Stall", "size": "10x10", "price": 15000},
    )
    assert forbidden.status_code == 403

    created = client.post(
        f"/api/v1/events/{event['id']}/stalls",
        headers=org_headers,
        json={"stall_code": "A1", "title": "Prime Stall", "size": "10x10", "price": 15000, "zone": "Entrance"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "available"


def test_organizer_can_generate_stall_package_inventory(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    org_headers = login(client, "org@example.com")
    event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Bulk Stall Expo",
            "city": "Chennai",
            "venue_name": "Trade Hall",
            "start_date": "2026-09-01",
            "end_date": "2026-09-02",
            "crowd_type": "families",
            "category": "shopping",
        },
    ).json()

    generated = client.post(
        f"/api/v1/events/{event['id']}/stall-packages",
        headers=org_headers,
        json={
            "title": "Budget Stall",
            "description": "Best for thrift, accessories, handmade, small food counters",
            "size": "8x8 ft",
            "zone": "Zone B",
            "price": 8000,
            "amenities": "table, chair, basic lighting",
            "code_prefix": "B",
            "start_number": 1,
            "quantity": 3,
        },
    )

    assert generated.status_code == 201, generated.text
    stalls = generated.json()
    assert [stall["stall_code"] for stall in stalls] == ["B01", "B02", "B03"]
    assert all(stall["title"] == "Budget Stall" for stall in stalls)
    assert all(stall["status"] == "available" for stall in stalls)
    assert stalls[0]["amenities"] == "table, chair, basic lighting"


def test_stall_package_generation_rejects_duplicate_codes(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    org_headers = login(client, "org@example.com")
    event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Duplicate Stall Expo",
            "city": "Chennai",
            "venue_name": "Trade Hall",
            "start_date": "2026-09-01",
            "end_date": "2026-09-02",
            "crowd_type": "families",
            "category": "shopping",
        },
    ).json()
    payload = {
        "title": "Premium Stall",
        "size": "12x12 ft",
        "zone": "Entrance",
        "price": 25000,
        "amenities": "2 chairs, power, branding space",
        "code_prefix": "P",
        "start_number": 1,
        "quantity": 2,
    }
    first = client.post(f"/api/v1/events/{event['id']}/stall-packages", headers=org_headers, json=payload)
    assert first.status_code == 201, first.text

    duplicate = client.post(f"/api/v1/events/{event['id']}/stall-packages", headers=org_headers, json=payload)

    assert duplicate.status_code == 409


def test_organizer_can_create_booking_for_own_event_from_customer_details(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    org_headers = login(client, "org@example.com")

    event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Organizer Managed Expo",
            "city": "Chennai",
            "venue_name": "Trade Hall",
            "start_date": "2026-09-01",
            "end_date": "2026-09-02",
            "crowd_type": "families",
            "category": "shopping",
        },
    ).json()
    client.post(f"/api/v1/events/{event['id']}/publish", headers=org_headers)
    stall = client.post(
        f"/api/v1/events/{event['id']}/stalls",
        headers=org_headers,
        json={"stall_code": "O1", "title": "Budget Stall", "size": "8x8", "price": 8000},
    ).json()

    booking = client.post(
        "/api/v1/bookings",
        headers=org_headers,
        json={
            "event_id": event["id"],
            "stall_id": stall["id"],
            "business_name": "Yuneekway",
            "contact_name": "Balaji",
            "contact_phone": "6383954887",
            "notes": "Vintage thrifted clothes",
        },
    )

    assert booking.status_code == 201, booking.text
    body = booking.json()
    assert body["business_name"] == "Yuneekway"
    assert body["contact_phone"] == "6383954887"
    assert body["status"] == "pending"
    assert body["total_amount"] == 8000


def test_organizer_can_book_another_organizer_event_like_marketplace_user(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    register(client, "Other Organizer", "other@example.com", "organizer")
    org_headers = login(client, "org@example.com")
    other_headers = login(client, "other@example.com")

    event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Marketplace Expo",
            "city": "Chennai",
            "venue_name": "Trade Hall",
            "start_date": "2026-09-01",
            "end_date": "2026-09-02",
            "crowd_type": "families",
            "category": "shopping",
        },
    ).json()
    client.post(f"/api/v1/events/{event['id']}/publish", headers=org_headers)
    stall = client.post(
        f"/api/v1/events/{event['id']}/stalls",
        headers=org_headers,
        json={"stall_code": "O2", "title": "Budget Stall", "size": "8x8", "price": 8000},
    ).json()

    booking = client.post(
        "/api/v1/bookings",
        headers=other_headers,
        json={
            "event_id": event["id"],
            "stall_id": stall["id"],
            "business_name": "Yuneekway",
            "contact_name": "Balaji",
            "contact_phone": "6383954887",
        },
    )

    assert booking.status_code == 201, booking.text
    assert booking.json()["business_name"] == "Yuneekway"


def test_vendor_enquiry_and_booking_approval_flow(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    register(client, "Vendor One", "vendor@example.com", "vendor")
    org_headers = login(client, "org@example.com")
    vendor_headers = login(client, "vendor@example.com")

    event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Coimbatore Business Expo",
            "city": "Coimbatore",
            "venue_name": "CODISSIA",
            "start_date": "2026-08-01",
            "end_date": "2026-08-02",
            "crowd_type": "business owners",
            "category": "business",
        },
    ).json()
    client.post(f"/api/v1/events/{event['id']}/publish", headers=org_headers)
    stall = client.post(
        f"/api/v1/events/{event['id']}/stalls",
        headers=org_headers,
        json={"stall_code": "B2", "title": "Corner Stall", "size": "12x12", "price": 25000},
    ).json()

    enquiry = client.post(
        "/api/v1/enquiries",
        headers=vendor_headers,
        json={"event_id": event["id"], "stall_id": stall["id"], "message": "Need details for clothing brand"},
    )
    assert enquiry.status_code == 201, enquiry.text
    assert enquiry.json()["status"] == "new"

    booking = client.post(
        "/api/v1/bookings",
        headers=vendor_headers,
        json={
            "event_id": event["id"],
            "stall_id": stall["id"],
            "business_name": "Yuneekway",
            "contact_name": "Balaji",
            "contact_phone": "9999999999",
            "notes": "Vintage clothing stall",
        },
    )
    assert booking.status_code == 201, booking.text
    booking_id = booking.json()["id"]
    assert booking.json()["status"] == "pending"
    assert booking.json()["total_amount"] == 25000

    duplicate = client.post(
        "/api/v1/bookings",
        headers=vendor_headers,
        json={
            "event_id": event["id"],
            "stall_id": stall["id"],
            "business_name": "Another Brand",
            "contact_name": "Balaji",
            "contact_phone": "9999999999",
        },
    )
    assert duplicate.status_code == 409

    approved = client.post(f"/api/v1/bookings/{booking_id}/approve", headers=org_headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    stall_response = client.get(f"/api/v1/stalls/{stall['id']}")
    assert stall_response.status_code == 200
    assert stall_response.json()["status"] == "booked"
