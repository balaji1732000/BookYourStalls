from __future__ import annotations

import json
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException, status

from app.config import settings


class OtpProvider(Protocol):
    def request_otp(self, phone: str) -> str: ...

    def verify_otp(self, session_id: str, otp: str) -> bool: ...


class TwoFactorOtpProvider:
    base_url = "https://2factor.in/API/V1"

    def __init__(self, api_key: str | None = None, template_name: str | None = None):
        self.api_key = api_key or settings.twofactor_api_key
        self.template_name = template_name or settings.twofactor_template_name

    def _format_sms_phone(self, phone: str) -> str:
        """2Factor's Indian SMS OTP route expects a 10-digit mobile number.

        We store Indian phones internally in normalized 91XXXXXXXXXX format so one
        user cannot create duplicate accounts with +91/0/local variants. For the
        provider call, strip the country code for Indian numbers only.
        """
        digits = "".join(char for char in phone if char.isdigit())
        if len(digits) == 12 and digits.startswith("91"):
            return digits[2:]
        if len(digits) == 11 and digits.startswith("0"):
            return digits[1:]
        return digits

    def _request_json(self, path: str) -> dict:
        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OTP provider is not configured",
            )
        url = f"{self.base_url}/{quote(self.api_key, safe='')}/{path}"
        try:
            with urlopen(url, timeout=10) as response:  # noqa: S310 - fixed trusted provider URL
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = "OTP provider request failed"
            try:
                payload = json.loads(exc.read().decode("utf-8"))
                detail = payload.get("Details") or detail
            except Exception:
                pass
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="OTP provider is unavailable",
            ) from exc

    def request_otp(self, phone: str) -> str:
        sms_phone = self._format_sms_phone(phone)
        path = f"SMS/{quote(sms_phone, safe='')}/AUTOGEN"
        if self.template_name:
            path = f"{path}/{quote(self.template_name, safe='')}"
        payload = self._request_json(path)
        if payload.get("Status") != "Success" or not payload.get("Details"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=payload.get("Details") or "OTP provider failed to send OTP",
            )
        return str(payload["Details"])

    def verify_otp(self, session_id: str, otp: str) -> bool:
        path = f"SMS/VERIFY/{quote(session_id, safe='')}/{quote(otp, safe='')}"
        try:
            payload = self._request_json(path)
        except HTTPException as exc:
            if str(exc.detail).lower() in {"otp mismatch", "session expired", "invalid session", "otp expired"}:
                return False
            raise
        return payload.get("Status") == "Success" and payload.get("Details") == "OTP Matched"

class Msg91OtpProvider:
    send_url = "https://control.msg91.com/api/v5/otp"
    verify_url = "https://control.msg91.com/api/v5/otp/verify"

    def __init__(self, authkey: str | None = None, template_id: str | None = None):
        self.authkey = authkey or settings.msg91_authkey
        self.template_id = template_id or settings.msg91_template_id

    def _format_mobile(self, phone: str) -> str:
        digits = "".join(char for char in phone if char.isdigit())
        if len(digits) == 10:
            return f"91{digits}"
        if len(digits) == 11 and digits.startswith("0"):
            return f"91{digits[1:]}"
        return digits

    def _request_json(self, url: str, *, method: str = "GET", body: dict | None = None, headers: dict | None = None) -> dict:
        if not self.authkey:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OTP provider is not configured",
            )
        request_headers = {"authkey": self.authkey, **(headers or {})}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        request = Request(url, data=data, headers=request_headers, method=method)
        try:
            with urlopen(request, timeout=10) as response:  # noqa: S310 - fixed trusted provider URL
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = "OTP provider request failed"
            try:
                payload = json.loads(exc.read().decode("utf-8"))
                detail = payload.get("message") or payload.get("error") or detail
            except Exception:
                pass
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="OTP provider is unavailable",
            ) from exc

    def request_otp(self, phone: str) -> str:
        if not self.template_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="MSG91 template ID is not configured",
            )
        mobile = self._format_mobile(phone)
        query = urlencode({
            "template_id": self.template_id,
            "mobile": mobile,
            "otp_expiry": settings.otp_expire_minutes,
            "otp_length": 6,
        })
        payload = self._request_json(f"{self.send_url}?{query}", method="POST", headers={"authkey": self.authkey})
        if payload.get("type") != "success":
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=payload.get("message") or "OTP provider failed to send OTP",
            )
        return mobile

    def verify_otp(self, session_id: str, otp: str) -> bool:
        mobile = self._format_mobile(session_id)
        query = urlencode({"otp": otp, "mobile": mobile})
        try:
            payload = self._request_json(f"{self.verify_url}?{query}", headers={"authkey": self.authkey})
        except HTTPException as exc:
            if "invalid" in str(exc.detail).lower() or "mismatch" in str(exc.detail).lower():
                return False
            raise
        return payload.get("type") == "success"



def get_configured_otp_provider() -> OtpProvider:
    provider = settings.otp_provider.lower()
    if provider == "2factor":
        return TwoFactorOtpProvider()
    if provider == "msg91":
        return Msg91OtpProvider()
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unsupported OTP provider")
