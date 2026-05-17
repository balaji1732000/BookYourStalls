from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Book Your Stall API"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./book_your_stall.db"
    secret_key: str = "dev-secret-change-before-production"
    access_token_expire_minutes: int = 60 * 24
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    seed_super_admin_email: str | None = None
    seed_super_admin_password: str | None = None
    seed_super_admin_name: str = "Super Admin"
    otp_provider: str = "2factor"
    twofactor_api_key: str | None = None
    twofactor_template_name: str | None = None
    otp_expire_minutes: int = 5
    otp_resend_after_seconds: int = 45

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
