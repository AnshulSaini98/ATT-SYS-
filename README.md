# Smart Attendance System using Dynamic QR Codes

A web-based attendance system I built for managing student attendance in lectures using time-limited QR codes. Teachers generate QR codes at the start of class, students scan them to mark themselves present, and the system prevents proxy attendance by refreshing codes frequently.

## The Problem

Manual attendance in large classes is slow and error-prone. Students often sign proxy sheets for absent classmates. Teachers spend time at the end of lectures taking attendance instead of reviewing. We needed something faster and more reliable.

## Features

- **QR-based marking**: Teachers generate session QR codes that students scan with their phones
- **Time-limited codes**: Each session has an expiry time, preventing late arrivals from marking attendance hours later
- **Role-based access**: Separate dashboards for students, teachers, and admins
- **Attendance reports**: Teachers can see who attended, who didn't, and download CSVs
- **Manual override**: Teachers can manually mark students present/absent if needed
- **Subject-wise tracking**: Students see attendance percentage per subject
- **Admin dashboard**: Add users, assign teachers to subjects, manage the system

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Frontend**: React 18 + Vite
- **QR**: html5-qrcode for scanning, qrcode for generation
- **Auth**: JWT tokens

## How It Works

1. **Teacher starts session**: Opens the dashboard and clicks "Start Session" for a subject. The backend generates a unique session token and creates a QR code

2. **Students scan**: Students open the scanner page and point their phone camera at the QR code. The app decodes it and sends the token to the backend

3. **Backend validates**:
   - Checks if the student belongs to that session's class
   - Verifies the session hasn't expired
   - Prevents duplicate attendance (one student can't mark twice)

4. **Attendance is recorded**: If everything checks out, the attendance record is created in the database

5. **Teacher ends session**: Clicks "End Session" to stop accepting new attendance marks. Teachers can still manually adjust attendance for 1 hour after the session ends

## Getting Started

### Prerequisites

- Node.js (v14+ recommended)
- MongoDB (local or Atlas)

### Installation

1. Clone the repo:
```bash
git clone <repo-url>
cd smart-attendance-system
```

2. Set up environment variables:
```bash
# Copy the example file
cp .env.example .env

# Edit .env with your MongoDB URI and JWT secret
nano .env
```

3. Install dependencies:
```bash
npm install
```

### Running Locally

```bash
# Start both backend and frontend together
npm run dev

# Or run them separately:
# Terminal 1 - Backend
cd backend
npm install
npm start

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

The frontend will be at `http://localhost:5173` and backend at `http://localhost:5000`.

### Demo Setup

```bash
# Seed the database with demo data
cd backend
npm run seed:demo
```

Demo credentials:
- **Admin**: admin@example.com / 123456789@
- **Teacher**: rahul.sharma@demo.edu / 123456789@
- **Student**: Any student from the seeded data / 123456789@

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login, returns JWT token

### Sessions (QR attendance)
- `POST /api/sessions/start` - Start a new session
- `POST /api/sessions/end` - End a session
- `POST /api/attendance/mark` - Student marks attendance via QR/token
- `GET /api/attendance/summary/:sessionId` - Get attendance for a session

### Student Dashboard
- `GET /api/attendance/profile` - Student's own profile
- `GET /api/attendance/subject-summary` - Attendance per subject
- `GET /api/attendance/summary/:sessionId` - Check if they marked for a session

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `PATCH /api/admin/users/:id` - Edit user
- `DELETE /api/admin/users/:id` - Delete user

See `backend/routes/` for complete API specs.

## For Mobile Devices

Most mobile browsers require HTTPS to access the camera for QR scanning. For local testing, use ngrok:

```bash
# Terminal 1
ngrok http 5000

# Terminal 2
ngrok http 5173

# Update frontend .env with ngrok backend URL
VITE_API_BASE_URL=https://your-ngrok-backend-url.ngrok.io
```

Then access the ngrok frontend URL from your phone.

## Project Structure

```
.
├── backend/
│   ├── config/           # Database config
│   ├── controllers/      # Route logic
│   ├── middleware/       # Auth, error handling
│   ├── models/           # MongoDB schemas
│   ├── routes/           # API endpoints
│   ├── utils/            # Helpers, validators, response formatting
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components (dashboards)
│   │   ├── services/     # API client
│   │   ├── utils/        # Helpers
│   │   └── App.jsx
│   └── vite.config.js
├── .env.example          # Environment template
└── README.md
```

## Important Notes

- **Security**: JWT tokens expire after 7 days. Inactive users are blocked at login
- **Database indexes**: Unique indexes on `Attendance(studentId, sessionId)` prevent duplicates
- **Session expiry**: Sessions auto-expire server-side; QR codes can't be used after expiry
- **Class validation**: Students can only mark attendance for sessions in their section/year

## Future Improvements

- Biometric verification for higher security
- Geolocation checking to prevent attendance from outside classroom
- Attendance analytics and trends (which classes have low attendance)
- Email notifications for teachers about low attendance
- Mobile app instead of web
- Support for multiple sessions per teacher (backend ready, just needs UI)
- Attendance data export to institutional system

## License

MIT

---

**Questions or bugs?** Feel free to open an issue. This was built as a department project, so it's designed around BCA department needs but can be adapted for any course.
