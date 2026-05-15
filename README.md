# BookYourStalls

Monorepo containing both the frontend and backend for the BookYourStalls project.

## Project Structure

```text
BookYourStalls/
  frontend/   # React + TypeScript + Vite
  backend/    # FastAPI backend
```

## Frontend

Path: `frontend/`

```bash
cd frontend
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run test
npm run lint
```

## Backend

Path: `backend/`

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Run tests:

```bash
cd backend
pytest -q
```

## Notes

- The frontend and backend are kept in a single repository for easier deployment and version tracking.
- Generated files like `node_modules`, build output, and the local SQLite database are excluded from git.