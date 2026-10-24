# BookMySeat - Library Seat Booking System

Full-stack MERN app: students book library seats (or group rooms) for a date and time, check in by scanning the QR code on the seat, and are fined for no-shows. Admins manage seats, sections, users, fines and rules.

**Stack:** React 19 + Vite · Express · MongoDB (Mongoose) · Socket.io · JWT access + refresh tokens

## Quick start

Requirements: Node 18+, MongoDB running locally (or an Atlas URI, see below).

```bash
# 1. Backend
cd server
npm install
npm run seed        # demo data: admin, student, sections, seats, 3 group rooms
npm run dev         # http://localhost:5000

# 2. Frontend (new terminal)
cd client
npm install
npm run dev         # http://localhost:5173
```

Or with Docker: `docker compose up --build`, then `docker compose exec server node src/utils/seed.js` (app on http://localhost:8080).

| Role | Login | Password |
|---|---|---|
| Admin | admin@library.edu | Admin@1234 |
| Student | student@library.edu or STU001 | Student@1234 |

`server/.env` is included for local use. Change `JWT_SECRET` before deploying.

## Student and admin at the same time
Logins are stored per role: pages under `/admin` use the admin login, all other pages use the student login. You can keep an admin tab and a student tab open side by side and refresh either one without them affecting each other.

## Where is the data stored?
In **MongoDB**. The address is `MONGO_URI` in `server/.env`:
- `mongodb://localhost:27017/library_booking` (default): a MongoDB installed **on your own computer**, database name `library_booking`. Look at it with **MongoDB Compass** (connect to `mongodb://localhost:27017`).
- A `mongodb+srv://...` address means **MongoDB Atlas** (cloud). To switch: create a free Atlas cluster, add a database user, allow your IP under *Network Access*, copy the connection string into `MONGO_URI`, restart the server and run `npm run seed` once. For Render/other hosting, set `MONGO_URI` as an environment variable there.

Collections: `users`, `sections`, `seats`, `bookings`, `payments`, `settings`, `notifications`, `waitlists`, `auditlogs`.

## Features

**Students**
- Register / login with email **or student ID**; forgot, reset and change password; email verification; optional two-factor login (authenticator app)
- Pick date, start time and duration; availability shown for exactly that window; book single seats or **group rooms** (group size)
- **Weekly repeat** bookings (up to 8 weeks), several bookings at once (limits configurable), no overlaps
- **Waiting list**: get notified when a booked seat becomes free
- Check in by **scanning the seat QR code with the in-app camera** (or the check-in button if QR is not required); check out early; extend a running booking
- **Notification centre** with unread badge, live toasts (reminders, fines, waitlist, cancellations)
- Fines page: pay one or all, receipts; dark mode; English / Hindi / Punjabi navigation and main screens; installable as an app (PWA)

**Admins**
- Dashboard: occupancy, bookings per day, peak hours, section occupancy, fines, **no-show leaderboard**
- Bookings: search, date and status filters, manual check-in, cancel with reason, CSV export
- Seats: add (seat or room), **bulk add**, **drag-and-drop layout editor**, maintenance mode, delete; sections: add / edit / close / delete
- Printable QR codes for every seat
- Users: search, block / unblock, booking **history**, **CSV bulk import** (students get a set-password email)
- Fines: review, filter, waive with reason, export CSV
- **Audit log** of every admin action
- Settings: grace period, fines, limits, reminders, **opening hours, weekly closures, holidays, time zone**, require QR check-in, require verified email, **auto-block after N no-shows**

**Automation (every minute):** reminders · no-show cancel + fine · overstay fine · seat release · waitlist alerts · auto-block

## How double booking is prevented
Each booking stores the 30-minute slots it covers. Unique partial indexes on `(seat, slots)` and `(user, slots)` for active bookings make MongoDB itself reject overlaps. Safe under concurrent requests, no replica set needed. Tests: `cd server && npm test` (set `TEST_MONGO_URI=mongodb://localhost:27017/library_test` to include the concurrency test).

## Payments (fines)
- **Demo mode (default):** a realistic checkout (UPI / card / net banking / wallet). No real money moves; a receipt is still created.
- **Real payments with Razorpay:** create a Razorpay account (test keys are free), then put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `server/.env` and restart. The checkout then opens Razorpay's payment window and a payment is only accepted after the server verifies Razorpay's signature. The amount is always calculated on the server.
- **Cash at the desk:** admins can press "Paid (cash)" on the Fines page; a receipt is created and the student is notified.
- Students can print receipts from the Fines page.

## QR check-in
1. Admin -> **QR Codes**: set the *site address* the QR should open (a phone cannot open `localhost`). Use your deployed site, or this computer's Wi-Fi address shown as "Network" when you run `npm run dev` (for example `http://192.168.1.5:5173`). Print the codes.
2. A student books a seat. **Check-in opens 10 minutes before the start time** (change in Settings).
3. The student scans the sticker: with the phone camera (opens the site and checks in), or in the app via My Bookings -> *Scan seat QR* (camera needs HTTPS or localhost). No camera? Paste the link into the box, or use the *Copy link* button on the QR page to test.

## Dark mode
The sun / moon button in the sidebar switches themes and remembers your choice.

## Email
Students get an email when they:
- **book a seat** (date, time, duration, check-in deadline, fine if missed; one summary email for weekly repeats),
- are about to **check in** (reminder before the start time),
- are about to **check out** (reminder before the booking ends, with the option to extend),
- get a **fine** (reason, amount, booking details, pay link),
plus payment receipts, admin cancellations, password reset and email verification.
All times are shown in the library time zone set in Admin > Settings.

Set it up with Gmail (free): turn on 2-Step Verification on the Google account, create an **App password** (Google Account > Security > App passwords), then put in `server/.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=the16letterapppassword
MAIL_FROM=BookMySeat <yourname@gmail.com>
```
Restart the server, open **Admin > Settings > Email notifications** and press **Send me a test email**. Without SMTP settings, emails are only written to the server log.

## Deploy
`render.yaml` (API), `client/vercel.json` (frontend) or Docker (`docker-compose.yml`). Set `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` on the server and `VITE_API_URL` (+ `VITE_SOCKET_URL`) on the client. GitHub Actions CI is in `.github/workflows/ci.yml`.

## Not included (needs paid accounts or a bigger redesign)
SMS / WhatsApp reminders, Razorpay webhooks (payments are confirmed by the checkout callback), Sentry error monitoring, Redis for multi-server sockets, and cookie-based refresh tokens.
