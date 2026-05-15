from datetime import date, timedelta

from tests.test_api_flow import login, register


def create_published_event_with_stall(client, org_headers, *, title="Chennai Expo", start_date="2026-10-01", end_date="2026-10-02"):
    event = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": title,
            "description": "Public expo",
            "city": "Chennai",
            "venue_name": "Trade Centre",
            "venue_address": "Nandambakkam",
            "start_date": start_date,
            "end_date": end_date,
            "crowd_type": "families",
            "expected_footfall": 15000,
            "category": "shopping",
            "banner_image_url": "https://cdn.example.com/event-banner.jpg",
        },
    )
    assert event.status_code == 201, event.text
    event_id = event.json()["id"]
    client.post(f"/api/v1/events/{event_id}/publish", headers=org_headers)
    stall = client.post(
        f"/api/v1/events/{event_id}/stalls",
        headers=org_headers,
        json={
            "stall_code": "A1",
            "title": "Entrance Stall",
            "description": "Near entrance",
            "size": "10x10",
            "price": 12000,
            "layout_image_url": "https://cdn.example.com/layout-a1.jpg",
        },
    )
    assert stall.status_code == 201, stall.text
    return event.json(), stall.json()


def test_event_and_stall_image_urls_are_saved_and_returned(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    org_headers = login(client, "org@example.com")

    event, stall = create_published_event_with_stall(client, org_headers)

    event_response = client.get(f"/api/v1/events/{event['id']}")
    assert event_response.status_code == 200
    assert event_response.json()["banner_image_url"] == "https://cdn.example.com/event-banner.jpg"

    stall_response = client.get(f"/api/v1/stalls/{stall['id']}")
    assert stall_response.status_code == 200
    assert stall_response.json()["layout_image_url"] == "https://cdn.example.com/layout-a1.jpg"


def test_public_event_detail_includes_available_stalls(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    org_headers = login(client, "org@example.com")
    event, stall = create_published_event_with_stall(client, org_headers)

    response = client.get(f"/api/v1/events/{event['id']}/detail")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == event["id"]
    assert body["stalls"][0]["id"] == stall["id"]
    assert body["stalls"][0]["status"] == "available"


def test_organizer_can_search_bookings_by_reference_business_and_vendor(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    register(client, "Vendor One", "vendor@example.com", "vendor")
    org_headers = login(client, "org@example.com")
    vendor_headers = login(client, "vendor@example.com")
    event, stall = create_published_event_with_stall(client, org_headers)

    booking = client.post(
        "/api/v1/bookings",
        headers=vendor_headers,
        json={
            "event_id": event["id"],
            "stall_id": stall["id"],
            "business_name": "Yuneekway Vintage",
            "contact_name": "Balaji",
            "contact_phone": "9999999999",
        },
    )
    assert booking.status_code == 201, booking.text
    reference = booking.json()["booking_reference"]

    by_reference = client.get(f"/api/v1/bookings?search={reference}", headers=org_headers)
    assert by_reference.status_code == 200
    assert len(by_reference.json()) == 1

    by_business = client.get("/api/v1/bookings?search=Yuneekway", headers=org_headers)
    assert by_business.status_code == 200
    assert by_business.json()[0]["business_name"] == "Yuneekway Vintage"

    by_vendor_email = client.get("/api/v1/bookings?search=vendor@example.com", headers=org_headers)
    assert by_vendor_email.status_code == 200
    assert by_vendor_email.json()[0]["booking_reference"] == reference


def test_dashboard_returns_status_counts(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    register(client, "Vendor One", "vendor@example.com", "vendor")
    org_headers = login(client, "org@example.com")
    vendor_headers = login(client, "vendor@example.com")
    event, stall = create_published_event_with_stall(client, org_headers)
    booking = client.post(
        "/api/v1/bookings",
        headers=vendor_headers,
        json={
            "event_id": event["id"],
            "stall_id": stall["id"],
            "business_name": "Yuneekway",
            "contact_name": "Balaji",
            "contact_phone": "9999999999",
        },
    ).json()
    client.post(
        "/api/v1/enquiries",
        headers=vendor_headers,
        json={"event_id": event["id"], "stall_id": stall["id"], "message": "Need details"},
    )
    client.post(f"/api/v1/bookings/{booking['id']}/approve", headers=org_headers)

    response = client.get("/api/v1/dashboard/organizer", headers=org_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["approved_bookings_count"] == 1
    assert body["pending_bookings_count"] == 0
    assert body["enquiries_count"] == 1
    assert body["booked_stalls_count"] == 1


def test_booking_requires_published_future_event(client):
    register(client, "Organizer One", "org@example.com", "organizer")
    register(client, "Vendor One", "vendor@example.com", "vendor")
    org_headers = login(client, "org@example.com")
    vendor_headers = login(client, "vendor@example.com")

    draft = client.post(
        "/api/v1/events",
        headers=org_headers,
        json={
            "title": "Draft Expo",
            "city": "Chennai",
            "venue_name": "Hall",
            "start_date": "2026-11-01",
            "end_date": "2026-11-02",
            "crowd_type": "families",
            "category": "shopping",
        },
    ).json()
    draft_stall = client.post(
        f"/api/v1/events/{draft['id']}/stalls",
        headers=org_headers,
        json={"stall_code": "D1", "title": "Draft Stall", "size": "10x10", "price": 10000},
    ).json()

    draft_booking = client.post(
        "/api/v1/bookings",
        headers=vendor_headers,
        json={
            "event_id": draft["id"],
            "stall_id": draft_stall["id"],
            "business_name": "Yuneekway",
            "contact_name": "Balaji",
            "contact_phone": "9999999999",
        },
    )
    assert draft_booking.status_code == 409

    yesterday = date.today() - timedelta(days=2)
    past_event, past_stall = create_published_event_with_stall(
        client,
        org_headers,
        title="Past Expo",
        start_date=yesterday.isoformat(),
        end_date=yesterday.isoformat(),
    )
    past_booking = client.post(
        "/api/v1/bookings",
        headers=vendor_headers,
        json={
            "event_id": past_event["id"],
            "stall_id": past_stall["id"],
            "business_name": "Yuneekway",
            "contact_name": "Balaji",
            "contact_phone": "9999999999",
        },
    )
    assert past_booking.status_code == 409
