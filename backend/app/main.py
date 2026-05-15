from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal, init_db
from app.routers import auth, bookings, dashboard, enquiries, events, profiles, stalls
from app.seed import seed_super_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_super_admin(
            db,
            email=settings.seed_super_admin_email,
            password=settings.seed_super_admin_password,
            name=settings.seed_super_admin_name,
        )
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

allowed_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(events.router, prefix=settings.api_v1_prefix)
app.include_router(stalls.router, prefix=settings.api_v1_prefix)
app.include_router(enquiries.router, prefix=settings.api_v1_prefix)
app.include_router(bookings.router, prefix=settings.api_v1_prefix)
app.include_router(profiles.router, prefix=settings.api_v1_prefix)
app.include_router(dashboard.router, prefix=settings.api_v1_prefix)
