# Expense Tracker – Web App (Frontend + Backend, no AWS)

This is a **standalone full‑stack web app** you can run locally and push to GitHub.
It uses **SQLite** for storage, **JWT** for auth, and saves uploads (receipts/avatars) to a local `uploads/` folder.
Later, you can replace adapters with AWS (Cognito/DynamoDB/S3) without changing the UI.

## Tech
- **Frontend:** React + Vite + Tailwind + React Router + React Query + Recharts
- **Backend:** Node.js (Express), SQLite (better-sqlite3), JWT auth, bcrypt, Multer for local uploads
- **Auth flow:** Email/password signup → login → JWT in sessionStorage → Authorization header on API calls

## Quick start (local)
1) Copy envs:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
2) Install deps & run:
   ```bash
   # backend
   cd backend && npm i && npm run dev
   # in another terminal (frontend)
   cd ../frontend && npm i && npm run dev
   ```
   - Backend: http://localhost:8081
   - Frontend: http://localhost:5173

3) First use:
   - Open http://localhost:5173
   - Click “Sign Up”, create account (name, email, password, monthly income).
   - You’ll be logged in and can add expenses, view dashboard, edit profile.

## Project structure
```
expense-tracker-web-only/
├─ backend/            # Express API (SQLite, JWT)
└─ frontend/           # React app
```

## Notes
- Database file is created at `backend/database.sqlite` automatically.
- Uploaded files go into `backend/uploads/` (served at `/uploads/<filename>`).
- To reset data, delete `backend/database.sqlite`.
- Later, swap the backend persistence/auth modules with AWS adapters (DynamoDB/Cognito/S3).
