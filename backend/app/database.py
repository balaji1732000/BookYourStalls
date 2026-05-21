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




def _sqlite_column_nullable(db_engine: Engine, table_name: str, column_name: str) -> bool | None:
    inspector = inspect(db_engine)
    for column in inspector.get_columns(table_name):
        if column["name"] == column_name:
            return bool(column["nullable"])
    return None


def _sqlite_rebuild_users_for_email_otp(connection) -> None:
    connection.execute(text("""
        CREATE TABLE users_new (
            id INTEGER NOT NULL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(255),
            email_verified_at DATETIME,
            phone VARCHAR(30),
            phone_verified_at DATETIME,
            password_hash VARCHAR(255),
            role VARCHAR(30) NOT NULL,
            city VARCHAR(100),
            onboarding_intent VARCHAR(40),
            business_name VARCHAR(200),
            business_category VARCHAR(120),
            profile_completed_at DATETIME,
            is_active BOOLEAN NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
    """))
    connection.execute(text("""
        INSERT INTO users_new (
            id, name, email, email_verified_at, phone, phone_verified_at, password_hash,
            role, city, onboarding_intent, business_name, business_category,
            profile_completed_at, is_active, created_at, updated_at
        )
        SELECT
            id, name, email,
            CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('users') WHERE name='email_verified_at') THEN email_verified_at ELSE NULL END,
            phone,
            CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('users') WHERE name='phone_verified_at') THEN phone_verified_at ELSE NULL END,
            password_hash, role,
            CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('users') WHERE name='city') THEN city ELSE NULL END,
            CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('users') WHERE name='onboarding_intent') THEN onboarding_intent ELSE NULL END,
            CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('users') WHERE name='business_name') THEN business_name ELSE NULL END,
            CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('users') WHERE name='business_category') THEN business_category ELSE NULL END,
            CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('users') WHERE name='profile_completed_at') THEN profile_completed_at ELSE NULL END,
            is_active, created_at, updated_at
        FROM users
    """))
    connection.execute(text("DROP TABLE users"))
    connection.execute(text("ALTER TABLE users_new RENAME TO users"))
    connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))
    connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone ON users (phone)"))


def _sqlite_rebuild_otp_challenges_for_email_otp(connection) -> None:
    connection.execute(text("""
        CREATE TABLE otp_challenges_new (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(30),
            provider_session_id VARCHAR(255) NOT NULL,
            otp_hash VARCHAR(255),
            expires_at DATETIME NOT NULL,
            consumed_at DATETIME,
            attempt_count INTEGER NOT NULL,
            max_attempts INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
    """))
    connection.execute(text("""
        INSERT INTO otp_challenges_new (
            id, email, phone, provider_session_id, otp_hash, expires_at, consumed_at,
            attempt_count, max_attempts, created_at, updated_at
        )
        SELECT
            id,
            COALESCE(
                CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('otp_challenges') WHERE name='email') THEN email ELSE NULL END,
                phone,
                ''
            ) AS email,
            phone,
            provider_session_id,
            CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('otp_challenges') WHERE name='otp_hash') THEN otp_hash ELSE NULL END,
            expires_at, consumed_at, attempt_count, max_attempts, created_at, updated_at
        FROM otp_challenges
    """))
    connection.execute(text("DROP TABLE otp_challenges"))
    connection.execute(text("ALTER TABLE otp_challenges_new RENAME TO otp_challenges"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_otp_challenges_email ON otp_challenges (email)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_otp_challenges_phone ON otp_challenges (phone)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_otp_challenges_provider_session_id ON otp_challenges (provider_session_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_otp_challenges_expires_at ON otp_challenges (expires_at)"))


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
        if user_columns and "email_verified_at" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN email_verified_at DATETIME"))
        if user_columns and "city" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN city VARCHAR(100)"))
        if user_columns and "onboarding_intent" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN onboarding_intent VARCHAR(40)"))
        if user_columns and "business_name" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN business_name VARCHAR(200)"))
        if user_columns and "business_category" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN business_category VARCHAR(120)"))
        if user_columns and "profile_completed_at" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN profile_completed_at DATETIME"))
        if user_columns and (
            _sqlite_column_nullable(db_engine, "users", "email") is False
            or _sqlite_column_nullable(db_engine, "users", "password_hash") is False
        ):
            _sqlite_rebuild_users_for_email_otp(connection)

        challenge_columns = _sqlite_column_names(db_engine, "otp_challenges")
        if challenge_columns and "email" not in challenge_columns:
            connection.execute(text("ALTER TABLE otp_challenges ADD COLUMN email VARCHAR(255)"))
        if challenge_columns and "otp_hash" not in challenge_columns:
            connection.execute(text("ALTER TABLE otp_challenges ADD COLUMN otp_hash VARCHAR(255)"))
        if challenge_columns and (
            _sqlite_column_nullable(db_engine, "otp_challenges", "phone") is False
            or _sqlite_column_nullable(db_engine, "otp_challenges", "email") is not False
        ):
            _sqlite_rebuild_otp_challenges_for_email_otp(connection)

        stall_columns = _sqlite_column_names(db_engine, "stalls")
        if stall_columns and "layout_image_url" not in stall_columns:
            connection.execute(text("ALTER TABLE stalls ADD COLUMN layout_image_url VARCHAR(500)"))


def init_db() -> None:
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    apply_sqlite_dev_migrations(engine)
