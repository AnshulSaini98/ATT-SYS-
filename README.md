# QR Based Attendance System

A full-stack attendance system where an admin/teacher creates a session QR, students scan it, and attendance is marked in MongoDB with duplicate prevention and timestamps.

## Tech Stack

- Frontend: React.js (Vite)
- Backend: Node.js + Express.js
- Database: MongoDB + Mongoose
- Auth: JWT (admin)

## Features

- Admin register/login
- Create attendance session with QR expiry time
- Unique QR payload per session
- Student QR scan/manual paste to mark attendance
- Duplicate protection: one student can mark only once per session
- Session-wise attendance table
- CSV export for attendance records

## Project Structure

```text
.
├─ backend/
│  ├─ .env.example
│  ├─ package.json
│  └─ src/
│     ├─ config/db.js
│     ├─ middleware/auth.js
│     ├─ models/{Admin,Session,Attendance}.js
│     ├─ routes/{authRoutes,sessionRoutes,attendanceRoutes}.js
│     ├─ utils/{jwt,qrPayload}.js
│     └─ server.js
├─ frontend/
│  ├─ .env.example
│  ├─ package.json
│  ├─ vite.config.js
│  └─ src/
│     ├─ App.jsx
│     ├─ styles.css
│     ├─ lib/api.js
│     └─ pages/{AdminDashboard,StudentAttendance}.jsx
└─ README.md
```

## Setup

## 1) Backend

```bash
cd backend
npm install
copy .env.example .env
```

Update `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/att_sys
JWT_SECRET=change_this_secret
CLIENT_URL=http://localhost:5173
```

Run backend:

```bash
npm run dev
```

## 2) Frontend

Open another terminal:

```bash
cd frontend
npm install
copy .env.example .env
```

Run frontend:

```bash
npm run dev
```

Open `http://localhost:5173`.

## How It Works

1. Admin logs in and creates a session (`className`, `subject`, validity duration).
2. Backend generates a secure `qrToken` and returns QR payload.
3. Admin shows QR code in dashboard.
4. Student scans QR on `/mark`, enters ID + name, and submits.
5. Backend validates token + session expiry and inserts attendance.
6. Duplicate entries are blocked by unique index (`session + studentId`).

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/sessions` (auth)
- `GET /api/sessions` (auth)
- `POST /api/attendance/mark`
- `GET /api/attendance/session/:sessionId` (auth)
- `GET /api/attendance/session/:sessionId/export` (auth)

## Submission Notes

- Use CSV export as attendance proof.
- Add 5-10 screenshots:
  - Admin login/register
  - Create session form
  - Generated QR and student link
  - Student mark page scanner
  - Duplicate error case
  - Attendance table
  - CSV output
