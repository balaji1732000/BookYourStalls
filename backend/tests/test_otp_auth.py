def test_phone_otp_request_sends_sms_without_exposing_code(client, otp_provider):
    response = client.post("/api/v1/auth/otp/request", json={"phone": "98765 43210"})

    assert response.status_code == 200
    body = response.json()
    assert body["challenge_id"]
    assert body["expires_in_seconds"] == 300
    assert body["resend_after_seconds"] == 45
    assert "otp" not in body
    assert otp_provider.sent == [{"phone": "919876543210", "session_id": "fake-session-1"}]


def test_twofactor_provider_sends_indian_numbers_without_country_code(monkeypatch):
    from app.sms import TwoFactorOtpProvider

    captured = {}

    def fake_request_json(self, path):
        captured["path"] = path
        return {"Status": "Success", "Details": "provider-session"}

    monkeypatch.setattr(TwoFactorOtpProvider, "_request_json", fake_request_json)
    provider = TwoFactorOtpProvider(api_key="test-key")

    assert provider._format_sms_phone("919876543210") == "9876543210"
    assert provider._format_sms_phone("+91 98765 43210") == "9876543210"
    assert provider._format_sms_phone("09876543210") == "9876543210"
    assert provider._format_sms_phone("9876543210") == "9876543210"
    assert provider.request_otp("+91 98765 43210") == "provider-session"
    assert captured["path"] == "SMS/9876543210/AUTOGEN"


def test_twofactor_provider_treats_otp_mismatch_as_failed_verification(monkeypatch):
    from fastapi import HTTPException

    from app.sms import TwoFactorOtpProvider

    def fake_request_json(self, path):
        raise HTTPException(status_code=502, detail="OTP Mismatch")

    monkeypatch.setattr(TwoFactorOtpProvider, "_request_json", fake_request_json)
    provider = TwoFactorOtpProvider(api_key="test-key")

    assert provider.verify_otp("session-id", "000000") is False


def test_msg91_provider_sends_otp_with_template_and_mobile(monkeypatch):
    from app.sms import Msg91OtpProvider

    captured = {}

    def fake_request_json(self, url, *, method="GET", body=None, headers=None):
        captured["url"] = url
        captured["method"] = method
        captured["body"] = body
        captured["headers"] = headers
        return {"type": "success", "message": "OTP sent successfully"}

    monkeypatch.setattr(Msg91OtpProvider, "_request_json", fake_request_json)
    provider = Msg91OtpProvider(authkey="test-auth", template_id="template-123")

    assert provider.request_otp("+91 98765 43210") == "919876543210"
    assert "template_id=template-123" in captured["url"]
    assert "mobile=919876543210" in captured["url"]
    assert captured["headers"] == {"authkey": "test-auth"}


def test_msg91_provider_verifies_otp_with_authkey_header(monkeypatch):
    from app.sms import Msg91OtpProvider

    captured = {}

    def fake_request_json(self, url, *, method="GET", body=None, headers=None):
        captured["url"] = url
        captured["headers"] = headers
        return {"type": "success", "message": "OTP verified success"}

    monkeypatch.setattr(Msg91OtpProvider, "_request_json", fake_request_json)
    provider = Msg91OtpProvider(authkey="test-auth", template_id="template-123")

    assert provider.verify_otp("919876543210", "123456") is True
    assert "otp=123456" in captured["url"]
    assert "mobile=919876543210" in captured["url"]
    assert captured["headers"] == {"authkey": "test-auth"}


def test_phone_otp_verify_creates_member_session_and_authenticates_me(client, otp_provider):
    request_response = client.post("/api/v1/auth/otp/request", json={"phone": "+91 98765 43210"})
    challenge_id = request_response.json()["challenge_id"]

    verify_response = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": challenge_id, "phone": "+91 98765 43210", "otp": "123456"},
    )

    assert verify_response.status_code == 200, verify_response.text
    body = verify_response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["is_new_user"] is True
    assert body["user"]["phone"] == "919876543210"
    assert body["user"]["role"] == "member"
    assert body["user"]["email"] is None
    assert body["user"]["phone_verified_at"]

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["phone"] == "919876543210"


def test_phone_otp_verify_rejects_wrong_code_and_allows_existing_user_login(client, otp_provider):
    first_request = client.post("/api/v1/auth/otp/request", json={"phone": "9876543210"})
    first_challenge_id = first_request.json()["challenge_id"]

    wrong = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": first_challenge_id, "phone": "9876543210", "otp": "000000"},
    )
    assert wrong.status_code == 401

    first_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": first_challenge_id, "phone": "9876543210", "otp": "123456"},
    )
    assert first_verify.status_code == 200
    user_id = first_verify.json()["user"]["id"]

    second_request = client.post("/api/v1/auth/otp/request", json={"phone": "9876543210"})
    second_challenge_id = second_request.json()["challenge_id"]
    second_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": second_challenge_id, "phone": "9876543210", "otp": "123456"},
    )

    assert second_verify.status_code == 200
    assert second_verify.json()["is_new_user"] is False
    assert second_verify.json()["user"]["id"] == user_id


def test_phone_otp_verify_rejects_consumed_or_mismatched_challenge(client, otp_provider):
    request_response = client.post("/api/v1/auth/otp/request", json={"phone": "9876543210"})
    challenge_id = request_response.json()["challenge_id"]

    verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": challenge_id, "phone": "9876543210", "otp": "123456"},
    )
    assert verify.status_code == 200

    reused = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": challenge_id, "phone": "9876543210", "otp": "123456"},
    )
    assert reused.status_code == 400

    another_request = client.post("/api/v1/auth/otp/request", json={"phone": "9876543210"})
    another_challenge_id = another_request.json()["challenge_id"]
    mismatched = client.post(
        "/api/v1/auth/otp/verify",
        json={"challenge_id": another_challenge_id, "phone": "9123456789", "otp": "123456"},
    )
    assert mismatched.status_code == 400
