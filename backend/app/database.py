from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _sqlite_column_names(db_engine: Engine, table_name: str) -> set[str]:
    inspector = inspect(db_engine)
    return {column["name"] for column in inspector.get_columns(table_name)}


def apply_sqlite_dev_migrations(db_engine: Engine) -> None:
    if not str(db_engine.url).startswith("sqlite"):
        return
    with db_engine.begin() as connection:
        event_columns = _sqlite_column_names(db_engine, "events")
        if event_columns and "banner_image_url" not in event_columns:
            connection.execute(text("ALTER TABLE events ADD COLUMN banner_image_url VARCHAR(500)"))
        if event_columns and "categories" not in event_columns:
            connection.execute(text("ALTER TABLE events ADD COLUMN categories TEXT DEFAULT '[]'"))
            connection.execute(text("UPDATE events SET categories = json_array(category) WHERE category IS NOT NULL"))
        if event_columns and "allowed_vendor_categories" not in event_columns:
            connection.execute(text("ALTER TABLE events ADD COLUMN allowed_vendor_categories TEXT DEFAULT '[]'"))

        user_columns = _sqlite_column_names(db_engine, "users")
        if user_columns and "role" in user_columns:
            connection.execute(text("UPDATE users SET role = 'member' WHERE role IN ('organizer', 'vendor')"))
        if user_columns and "phone_verified_at" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN phone_verified_at DATETIME"))

        stall_columns = _sqlite_column_names(db_engine, "stalls")
        if stall_columns and "layout_image_url" not in stall_columns:
            connection.execute(text("ALTER TABLE stalls ADD COLUMN layout_image_url VARCHAR(500)"))


def init_db() -> None:
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    apply_sqlite_dev_migrations(engine)
