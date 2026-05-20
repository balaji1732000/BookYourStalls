from __future__ import annotations

import html
from typing import Protocol

import resend
from fastapi import HTTPException, status

from app.config import settings


class OtpProvider(Protocol):
    def request_otp(self, email: str, otp: str) -> str: ...


class ResendEmailOtpProvider:
    def __init__(self, api_key: str | None = None, from_email: str | None = None):
        self.api_key = api_key or settings.resend_api_key
        self.from_email = from_email or settings.resend_from_email

    def request_otp(self, email: str, otp: str) -> str:
        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email OTP provider is not configured",
            )
        resend.api_key = self.api_key
        resend.default_http_client = resend.RequestsClient(timeout=10)
        safe_otp = html.escape(otp)
        params: resend.Emails.SendParams = {
            "from": self.from_email,
            "to": [email],
            "subject": "Your BookYourStall login code",
            "html": (
                "<div style='font-family:Arial,sans-serif;line-height:1.5'>"
                "<h2>BookYourStall login code</h2>"
                "<p>Use this code to login or create your BookYourStall account:</p>"
                f"<p style='font-size:28px;font-weight:700;letter-spacing:6px'>{safe_otp}</p>"
                f"<p>This code is valid for {settings.otp_expire_minutes} minutes. Do not share it with anyone.</p>"
                "</div>"
            ),
        }
        try:
            email_response = resend.Emails.send(params)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Email OTP provider failed to send code",
            ) from exc
        if not isinstance(email_response, dict) or not email_response.get("id"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Email OTP provider returned an invalid response",
            )
        return str(email_response["id"])


def get_configured_otp_provider() -> OtpProvider:
    return ResendEmailOtpProvider()
