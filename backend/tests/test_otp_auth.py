def test_email_otp_request_sends_resend_email_without_exposing_code(client, otp_provider):
    response = client.post("/api/v1/auth/otp/request", json={"email": "Balaji@Example.COM"})

    assert response.status_code == 200
    body = response.json()
    assert body["challenge_id"]
    assert body["expires_in_seconds"] == 300
    assert body["resend_after_seconds"] == 45
    assert "otp" not in body
    assert otp_provider.sent == [{"email": "balaji@example.com", "session_id": "fake-session-1"}]


def test_resend_provider_sends_login_code_email(monkeypatch):
    from app.email_otp import ResendEmailOtpProvider

    captured = {}

    def fake_send(params):
        captured.update(params)
        return {"id": "email_123"}

    monkeypatch.setattr("app.email_otp.resend.Emails.send", fake_send)
    provider = ResendEmailOtpProvider(api_key="test-key", from_email="BookYourStall <login@example.com>")

    assert provider.request_otp("balaji@example.com", "123456") == "email_123"
    assert captured["from"] == "BookYourStall <login@example.com>"
    assert captured["to"] == ["balaji@example.com"]
    assert captured["subject"] == "Your BookYourStall login code"
    assert "123456" in captured["html"]
    assert "5 minutes" in captured["html"]


def test_email_otp_verify_creates_member_session_and_authenticates_me(client, otp_provider):
    request_response = client.post("/api/v1/auth/otp/request", json={"email": "Balaji@Example.COM"})
    challenge_id = request_response.json()["challenge_id"]

    verify_response = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": challenge_id, "email": "balaji@example.com", "otp": otp_provider.valid_codes["fake-session-1"]},
    )

    assert verify_response.status_code == 200, verify_response.text
    body = verify_response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["is_new_user"] is True
    assert body["requires_profile_completion"] is True
    assert body["user"]["email"] == "balaji@example.com"
    assert body["user"]["role"] == "member"
    assert body["user"]["phone"] is None
    assert body["user"]["city"] is None
    assert body["user"]["onboarding_intent"] is None
    assert body["user"]["profile_completed_at"] is None
    assert body["user"]["email_verified_at"]

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "balaji@example.com"
    assert me.json()["profile_completed_at"] is None


def test_email_otp_verify_rejects_wrong_code_and_allows_existing_user_login(client, otp_provider):
    first_request = client.post("/api/v1/auth/otp/request", json={"email": "vendor@example.com"})
    first_challenge_id = first_request.json()["challenge_id"]

    wrong = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": first_challenge_id, "email": "vendor@example.com", "otp": "000000"},
    )
    assert wrong.status_code == 401

    first_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": first_challenge_id, "email": "vendor@example.com", "otp": otp_provider.valid_codes["fake-session-1"]},
    )
    assert first_verify.status_code == 200
    user_id = first_verify.json()["user"]["id"]

    second_request = client.post("/api/v1/auth/otp/request", json={"email": "vendor@example.com"})
    second_challenge_id = second_request.json()["challenge_id"]
    second_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": second_challenge_id, "email": "vendor@example.com", "otp": otp_provider.valid_codes["fake-session-2"]},
    )

    assert second_verify.status_code == 200
    assert second_verify.json()["is_new_user"] is False
    assert second_verify.json()["user"]["id"] == user_id


def test_email_otp_verify_rejects_consumed_or_mismatched_challenge(client, otp_provider):
    request_response = client.post("/api/v1/auth/otp/request", json={"email": "member@example.com"})
    challenge_id = request_response.json()["challenge_id"]

    verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": challenge_id, "email": "member@example.com", "otp": otp_provider.valid_codes["fake-session-1"]},
    )
    assert verify.status_code == 200

    reused = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": challenge_id, "email": "member@example.com", "otp": otp_provider.valid_codes["fake-session-1"]},
    )
    assert reused.status_code == 400

    another_request = client.post("/api/v1/auth/otp/request", json={"email": "member@example.com"})
    another_challenge_id = another_request.json()["challenge_id"]
    mismatched = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": another_challenge_id, "email": "other@example.com", "otp": otp_provider.valid_codes["fake-session-2"]},
    )
    assert mismatched.status_code == 400


def test_complete_profile_updates_minimum_marketplace_details(client, otp_provider):
    request_response = client.post("/api/v1/auth/otp/request", json={"email": "newmember@example.com"})
    challenge_id = request_response.json()["challenge_id"]
    verify_response = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": challenge_id, "email": "newmember@example.com", "otp": otp_provider.valid_codes["fake-session-1"]},
    )
    token = verify_response.json()["access_token"]

    profile_response = client.put(
        "/api/v1/auth/me/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Sampath Balaji",
            "phone": "98765 43210",
            "city": "Chennai",
            "onboarding_intent": "book_stalls",
            "business_name": "Yuneekway",
            "business_category": "Fashion & apparel",
        },
    )

    assert profile_response.status_code == 200, profile_response.text
    body = profile_response.json()
    assert body["name"] == "Sampath Balaji"
    assert body["phone"] == "919876543210"
    assert body["city"] == "Chennai"
    assert body["onboarding_intent"] == "book_stalls"
    assert body["business_name"] == "Yuneekway"
    assert body["business_category"] == "Fashion & apparel"
    assert body["profile_completed_at"]

    second_request = client.post("/api/v1/auth/otp/request", json={"email": "newmember@example.com"})
    second_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": second_request.json()["challenge_id"], "email": "newmember@example.com", "otp": otp_provider.valid_codes["fake-session-2"]},
    )
    assert second_verify.status_code == 200
    assert second_verify.json()["is_new_user"] is False
    assert second_verify.json()["requires_profile_completion"] is False


def test_existing_incomplete_email_user_still_requires_profile_completion(client, otp_provider):
    first_request = client.post("/api/v1/auth/otp/request", json={"email": "partial@example.com"})
    first_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": first_request.json()["challenge_id"], "email": "partial@example.com", "otp": otp_provider.valid_codes["fake-session-1"]},
    )
    assert first_verify.status_code == 200
    assert first_verify.json()["requires_profile_completion"] is True

    second_request = client.post("/api/v1/auth/otp/request", json={"email": "partial@example.com"})
    second_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": second_request.json()["challenge_id"], "email": "partial@example.com", "otp": otp_provider.valid_codes["fake-session-2"]},
    )
    assert second_verify.status_code == 200
    assert second_verify.json()["is_new_user"] is False
    assert second_verify.json()["requires_profile_completion"] is True


def test_profile_completion_requires_authenticated_user_and_minimum_fields(client):
    unauthorized = client.put(
        "/api/v1/auth/me/profile",
        json={"name": "A", "phone": "12", "city": "C", "onboarding_intent": "book_stalls"},
    )
    assert unauthorized.status_code == 401
