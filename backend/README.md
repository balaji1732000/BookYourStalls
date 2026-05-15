# Book Your Stall Backend

FastAPI backend for an event stall booking platform.

## Current MVP scope

- Auth with email/password
- Roles: super_admin, organizer, vendor
- Organizer can create/publish events and manage stalls
- Vendors can browse published events, send enquiries, and request bookings
- Organizer can approve/reject bookings
- SQLite database for development
- No payment table in current development scope

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Test

```bash
pytest -q
```
