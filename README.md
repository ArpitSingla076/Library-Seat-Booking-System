# BookMySeat: Library Seat Booking System

A full-stack web app where students book library seats (or group rooms) for a date and time, check in when they arrive, and are fined for no-shows. Librarians (admins) manage seats, students, fines and the rules, and watch live usage.

**Stack:** React 19 + Vite · Node.js + Express · MongoDB (Mongoose) · Socket.io · JWT login
**Hosting used:** MongoDB Atlas (database) · Render (server) · Vercel (website)

---


## What it does

| Role | What they can do |
|---|---|
| **Student** | Book a seat or room for a time, check in and out, extend, pay fines, get emails and notifications |
| **Admin / librarian** | Manage seats, sections and students, see live usage, handle fines, print QR stickers, change the rules |

**A student's day:** log in, pick a date and time on the seat map, book a green seat, arrive and check in (button or scan the QR sticker on the seat), study, check out. If the student never checks in, the booking is cancelled automatically and a fine is added. Unpaid fines block new bookings until paid.

---

## Features

### Students
- Register and log in with **email or student ID**; forgot / reset / change password; email verification; optional **two-factor login** (authenticator app)
- **Seat map** for any date and time: green = free, red = booked, blue = yours, yellow = maintenance. Updates live.
- Book **single seats or group rooms** (with group size) for 30 minutes up to the configured maximum
- **Weekly repeat** (up to 8 weeks) and several bookings at once (limits are configurable)
- **Waiting list:** ask to be notified when a booked seat becomes free
- **Check in** with the button, or by **scanning the QR sticker** on the seat (in-app camera, phone camera, or pasted link); **check out** early; **extend** a running booking
- **Notification centre** with unread badge and live pop-ups
- **Fines page:** pay one or all fines, payment history, printable receipts
- Dark / light mode, English / Hindi / Punjabi navigation and main screens, installable as an app (PWA)

### Admins
- **Dashboard:** current occupancy, bookings per day, peak hours, occupancy per section, fines, no-show leaderboard
- **Bookings:** search and filter, cancel with a reason (student is told), manual check-in, CSV export
- **Seats:** add (seat or room), bulk add, drag-and-drop layout editor, maintenance mode (upcoming bookings are cancelled and students notified)
- **Sections:** add, edit, close, delete
- **QR codes:** printable sheet with one code per seat, copy / open links for testing
- **Users:** search, block / unblock, booking history, **CSV bulk import** (students get a set-password email)
- **Fines:** review, filter, waive with a reason, **mark paid (cash at the desk)**, export CSV
- **Audit log** of every admin action
- **Settings:** grace period, fines, booking limits, reminders, opening hours, weekly closures, holidays, time zone, QR requirement, verified-email requirement, auto-block after repeated no-shows, site address, email test

### Automatic (runs every minute on the server)
- Check-in reminder before a booking starts (email + pop-up)
- Check-out reminder before a checked-in booking ends (email + pop-up)
- No-show: booking cancelled, fine added, seat freed
- Overstay: fine added if a student checked in but never checked out
- Waiting-list alerts, optional auto-block of repeat offenders

### Default rules (all changeable in Admin > Settings)
Check-in opens 10 min before the start · check in within 15 min of the start · no-show fine ₹50 · overstay fine ₹100 · max 3 hours per booking · 3 active bookings and 3 per day · book up to 7 days ahead · reminders 15 min before start and 10 min before end.

---

## How it works

```
 React website (Vercel)  ──HTTPS /api──▶  Express server (Render)  ──▶  MongoDB Atlas
        ▲                                   │  cron job every minute
        └────────── Socket.io (live) ◀──────┘  sends emails (Gmail relay / Brevo / ...)
```

- **No double booking.** Time is split into 30-minute slots. Every booking stores the slots it covers, and MongoDB has *unique indexes* on (seat, slot) and (user, slot) for active bookings. If two students book the same seat at the same moment, the database rejects the second one. No replica set or locking needed.
- **Login.** Short-lived access token (1 hour) plus a rotating refresh token (7 days). The login is stored per role, so an admin tab and a student tab can be open side by side.
- **Fines and payments.** The server calculates every amount; the browser never sends a price. Real payments are only accepted after Razorpay's signature is verified.
- **Times** in emails and rules use the library time zone (default `Asia/Kolkata`), not the server's time zone.

---

## Project structure

```
client/                      React website
  src/pages/                 Login, Register, Profile, ... 
  src/pages/student/         SeatsPage, MyBookingsPage, FinesPage, CheckInPage, NotificationsPage
  src/pages/admin/           Dashboard, Bookings, Seats, Sections, QrCodes, Users, Fines, Audit, Settings
  src/components/            QrScanner, shared UI (modals, chips, pagination)
  src/context/               Auth, Socket, Settings, Theme
  src/services/              api.js (all server calls), session.js (per-role login)
  public/                    manifest + service worker (installable app)
server/
  src/models/                User, Seat, Section, Booking, Payment, PaymentOrder, Settings, Waitlist, Notification, AuditLog
  src/routes/                auth, seats, bookings, waitlist, notifications, settings, admin
  src/services/              bookingService, paymentService, emailService, emailTemplates, settingsService, ...
  src/jobs/                  bookingJobs.js (the every-minute tasks)
  src/utils/                 seed.js, slots.js, totp.js, timeUtil.js, logger.js
  src/tests/                 automated tests
docs/gmail-relay.gs          free Gmail sender (Google Apps Script)
render.yaml                  Render server settings
client/vercel.json           Vercel settings (single-page-app rewrite)
docker-compose.yml           run everything with one command
.github/workflows/ci.yml     automatic tests and build on every push
```

---

## Run it on your computer

Needs **Node.js 18 or newer** and **MongoDB** (a local install, or a free Atlas cluster, see below).

```bash
# 1. Server
cd server
npm install
copy .env.example .env        # on Mac/Linux: cp .env.example .env   (then edit .env)
npm run seed                  # demo data (see warning below)
npm run dev                   # http://localhost:5000

# 2. Website (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

**Demo logins** (created by `npm run seed`)

| Role | Login | Password |
|---|---|---|
| Admin | `admin@library.edu` | `Admin@1234` |
| Student | `student@library.edu` or `STU001` | `Student@1234` |

These demo addresses are fake, so emails sent to them bounce. Register a real student account to see emails arrive. **Change the admin password on any real deployment.**

`npm run dev` also prints a **Network** address (for example `http://192.168.1.5:5173`). Open it on your phone, on the same Wi-Fi, to test from a phone.

---

## Settings (environment variables)

### Server (`server/.env` locally, "Environment" tab on Render)

| Name | Required | Meaning |
|---|---|---|
| `MONGO_URI` | yes | Database address. Local: `mongodb://localhost:27017/library_booking`. Atlas: `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/library_booking?retryWrites=true&w=majority` |
| `JWT_SECRET` | yes | Long random text used to sign logins. Make one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRE` | no | Login lifetime, default `1h` |
| `NODE_ENV` | no | Use `production` when deployed |
| `CLIENT_URL` | deployed | Address of your website, for example `https://my-library.vercel.app` (no `/` at the end) |
| `PORT` | no | Default 5000 (Render sets it for you) |
| `MAIL_WEBHOOK_URL`, `MAIL_WEBHOOK_SECRET` | email | Free Gmail sender, see [Email](#email) |
| `BREVO_API_KEY` / `RESEND_API_KEY` | email | Alternative email services |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | email | Classic SMTP (not usable on Render's free plan) |
| `MAIL_FROM` | email | Sender shown on emails, for example `BookMySeat <you@gmail.com>` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | optional | Turns on real payments |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | optional | Used only by `npm run seed:safe` to create your first admin |

### Website (set on Vercel, or `client/.env` locally)

| Name | Meaning |
|---|---|
| `VITE_API_URL` | Server address ending in `/api`, for example `https://my-api.onrender.com/api` |
| `VITE_SOCKET_URL` | Server address without `/api`, for example `https://my-api.onrender.com` |

Both are baked in when the site is built: after changing them, redeploy on Vercel. Locally you can leave them empty.

---

## Database and demo data

Data lives in **MongoDB**. Locally the default address points to a MongoDB installed on your computer. A `mongodb+srv://` address means **MongoDB Atlas** (cloud). You can browse the data in Atlas under **Database > Browse Collections**.

**To use Atlas:** create a free M0 cluster, create a database user (use only letters and numbers in the password), under **Network Access** allow `0.0.0.0/0`, copy the connection string from **Connect > Drivers**, replace `<password>`, add `/library_booking` before the `?`, and put it in `MONGO_URI`.

| Command | What it does |
|---|---|
| `npm run seed` | **Deletes everything**, then creates demo admin, demo student, 4 sections with seats, and 3 group rooms. Use only on a test database. |
| `npm run seed:safe` | **Deletes nothing.** Creates the settings, the first admin and the starter seats only if they do not exist. Use this on a live database. |

> The server on your PC and the live server share the same database if both use the same Atlas address. Settings you change on one show up on the other.

---

## Email

Students get an email when they **book a seat** (date, time, duration, check-in deadline, fine if missed; one summary email for weekly repeats), before **check-in** (reminder), before **check-out** (reminder), and when a **fine** is added (reason, amount, booking details, pay button). Also: payment receipts, admin cancellations, password reset and verification.

### Pick one way to send

> **Important:** Render's free plan blocks the SMTP ports (25, 465, 587). Gmail-over-SMTP works on your own computer but fails on Render with "Connection timeout". Use one of the HTTPS options.

1. **Your own Gmail through a small Google script (free, no domain needed).**
   1. Go to script.google.com, create a project, paste `docs/gmail-relay.gs`, and change `SECRET` on the first line.
   2. **Deploy > New deployment > Web app**, *Execute as: Me*, *Who has access: Anyone*, then allow the permissions.
   3. Put the Web app URL in `MAIL_WEBHOOK_URL`, the same secret in `MAIL_WEBHOOK_SECRET`, and your Gmail in `MAIL_FROM`.
   4. Limit: about 100 recipients per day on a normal Gmail account.
2. **Brevo API** (free, 300 per day): `BREVO_API_KEY`, and verify your sender in Brevo. Works best with your own domain.
3. **Resend API:** `RESEND_API_KEY` plus your own verified domain.
4. **SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. Fine locally or on a paid Render instance. For Gmail use an *App password* (needs 2-Step Verification), not your normal password.

### Check that it works
Log in as admin, open **Settings > Email notifications**, type your real email and press **Send test email**. The page shows the real error if something is wrong. With no provider set, emails are only written to the server log.

### Make the buttons in emails open your website
Buttons such as "View my bookings" and "Pay fine" open the **site address**. If they open `localhost`, fix it in either place:
- **Admin > Settings > Email notifications:** the page shows a yellow warning and a **Fix it** button when run on your live site, or
- set `CLIENT_URL` on the server to your Vercel address, or
- set **Site address** in Admin > Settings or Admin > QR Codes (this one takes priority).

If a student is not logged in, the link first asks them to log in and then opens the right page.

---

## QR check-in

1. **Admin > QR Codes:** set the **Site address** to your live website (a phone cannot open `localhost`), then **Print**. Stick each code on its own seat.
2. A student books a seat. **Check-in opens 10 minutes before the start** and closes 15 minutes after it.
3. The student scans the sticker on the seat: with the phone camera (opens the site and checks in), or in the app via **My Bookings > Scan seat QR** (the in-app camera needs HTTPS or localhost; the live site has HTTPS).
4. The code is secret per seat. Students never see it unless they are at the seat.

Turn **Require QR check-in** on in Admin > Settings to hide the plain Check in button. For testing without a printed sticker, use **Copy link** on the QR page and paste it into the scan box.

---

## Payments

- **Demo checkout (default):** a realistic checkout (UPI, card, net banking, wallet). No money moves, but the fine is cleared and a receipt is created.
- **Real payments with Razorpay:** create a Razorpay account (free test keys), put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the server and restart. Students then pay in Razorpay's window; the server accepts a payment only after verifying Razorpay's signature. Going live needs Razorpay KYC for live keys.
- **Cash at the desk:** admins press **Paid (cash)** on Admin > Fines. A receipt is created and the student is notified.
- Students can print receipts from the Fines page.

---

## Deploy (GitHub, Atlas, Render, Vercel)

1. **GitHub.** Create a *private* empty repository. In the project folder run `git init`, `git add .`, `git status` (check that no `.env` file is listed), `git commit -m "first version"`, `git branch -M main`, `git remote add origin <your repo address>`, `git push -u origin main`. The included `.gitignore` keeps `.env` files out.
2. **Atlas.** Set up the database as described above. Run `npm run seed:safe` once from your PC with `MONGO_URI` pointing at Atlas.
3. **Render (server).** New > Web Service > your repo. Root Directory `server`, Build `npm install`, Start `npm start`. Add the environment variables (`NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRE=1h`, `CLIENT_URL`, and your email settings). Check `https://YOUR-SERVER.onrender.com/api/health`.
4. **Vercel (website).** New Project > same repo. Root Directory `client`. Add `VITE_API_URL` and `VITE_SOCKET_URL`, then deploy.
5. **Connect them.** Set `CLIENT_URL` on Render to your Vercel address and save.
6. **First-time setup on the live site:** change the admin password; Admin > Settings: set the time zone, press **Send test email**, and click **Fix it** if the email-link warning shows; Admin > QR Codes: set the site address and print; block the demo student.

**Updating later:** `git add .`, `git commit -m "what changed"`, `git push`. Render and Vercel redeploy by themselves.

**Render free plan:** the server sleeps after about 15 minutes without visits (the first visit then takes up to a minute), and while asleep the every-minute jobs (reminders, no-show fines) do not run. Keep it awake with a free monitor such as uptimerobot.com that opens `/api/health` every 5 minutes, or use a paid always-on instance.

---

## Docker

```bash
docker compose up --build
docker compose exec server node src/utils/seed.js --safe
```
Website on http://localhost:8080 (includes its own MongoDB). Pass `JWT_SECRET` and the email / Razorpay variables through your shell or an `.env` file next to `docker-compose.yml`.

---

## Tests

```bash
cd server
npm test
```
Covers time-slot logic, the two-factor code generator (standard test vectors), email contents and time zones, every email provider (with a fake network), and the email link address check. To include the **double-booking concurrency test**, point it at a throw-away database:
```bash
TEST_MONGO_URI=mongodb://localhost:27017/library_test npm test
```
GitHub Actions (`.github/workflows/ci.yml`) runs the tests and builds the website on every push.

---

## API overview

All routes start with `/api`. Everything except login, register, forgot/reset password and email verification needs a login token.

| Area | Routes |
|---|---|
| `/auth` | `register`, `login` (email or student ID, optional `otp`), `refresh`, `logout`, `me`, `forgot-password`, `reset-password`, `change-password`, `verify-email`, `resend-verification`, `2fa/setup`, `2fa/enable`, `2fa/disable` |
| `/seats` | `GET /` (availability for `startTime`/`endTime`), `GET /sections`, `POST/PUT/DELETE` for seats and sections (admin), `POST /bulk` |
| `/bookings` | `POST /` (also weekly repeat), `GET /my`, `GET /active`, `GET /fines/my`, `GET /payments/my`, `POST /payments/create-order`, `POST /payments/verify`, `POST /checkin-by-qr`, `POST /:id/checkin`, `POST /:id/checkout`, `POST /:id/extend`, `DELETE /:id` |
| `/waitlist` | join, list, leave |
| `/notifications` | list, read, read-all, clear |
| `/settings` | rules the website needs |
| `/admin` | `bookings`, `fines`, `users`, `users/import`, `analytics`, `audit`, `settings`, `email/status`, `email/test`, `export/bookings`, `bookings/:id/checkin`, `.../mark-paid`, `.../waive-fine` |
| `/health` | server check (used by Render and uptime monitors) |

---

## Security notes
- Passwords are hashed (bcrypt). Reset and verification tokens and refresh tokens are stored hashed.
- Rate limits on all routes, and stricter on login and register. Input is cleaned against database injection. CSV exports are protected against spreadsheet formulas. User text in emails is escaped.
- Never commit `.env`. If a secret leaks, change it (Atlas password, Gmail app password, `JWT_SECRET`) and redeploy.
- Change the demo admin password before real use, and turn on two-factor login for admins (Profile page).

---

## Troubleshooting

| What you see | What to do |
|---|---|
| Seat map says "No seats have been set up yet" | The database is empty. Run `npm run seed:safe` once. |
| "Cannot reach the server" on the live site | `VITE_API_URL` is wrong or missing `/api`, or the Render server is asleep. After changing it, redeploy Vercel. |
| Red CORS error in the browser console | `CLIENT_URL` on Render does not match your website address (use https, no `/` at the end). |
| Render log: Mongo connection error | Atlas Network Access must allow `0.0.0.0/0`; avoid special characters in the Atlas password. |
| Emails: "Connection timeout" on Render | SMTP is blocked on Render's free plan. Use the Gmail relay or Brevo. |
| Emails arrive but the buttons open `localhost` | Fix the site address (see [Make the buttons in emails open your website](#make-the-buttons-in-emails-open-your-website)). |
| Test email shows "bounced / address not found" | You sent it to the fake demo admin address. Type your real email in the test box. |
| Live updates show offline | `VITE_SOCKET_URL` is missing on Vercel. |
| Refreshing a page gives 404 on Vercel | Vercel Root Directory must be `client`. |
| Camera does not open | The in-app camera needs HTTPS or localhost. Use the live site, or the "paste link" box. |
| Check-in says "Too early" | Check-in opens 10 minutes before the start time (change in Settings). |

---

## Not included
SMS / WhatsApp reminders, Razorpay webhooks (payments are confirmed by the checkout callback), error monitoring (Sentry), Redis for several servers, a screen to create more admin accounts, and student editing of their own name or student ID.
