# Phase 2: Waiting List

Add a signup form so visitors can join your waiting list. This is a production-ready feature — data persists in SQLite, duplicates are prevented, and the experience feels like a real product launch.

## Live Counter

- Before the form, show a live count: "Join X+ others on the waitlist"
- Fetch from `GET /api/waitlist/count` on page load
- Update the count after a successful signup without refreshing

## Form Component

- `<section id="waiting-list">` with a compelling heading (e.g. "Get Early Access")
- Form fields:
  - **Email** input (required, must be valid email) with a label
  - **Name** input (optional) with a label
  - **"What excites you most?"** dropdown with 3 options matching your feature cards from the strategy brief
  - Submit button
- Client-side validation: show inline error for invalid email
- Use Tailwind — match the look and feel of the rest of the page, respect the design archetype

## Post-Signup Experience

On successful submission, replace the form with:
1. **Celebration animation** — confetti burst or Framer Motion particle effect
2. **Queue position** — "You're #48 on the waitlist" (returned from the API)
3. **Share prompt** — "Move up the list by sharing" with pre-filled share buttons:
   - Twitter/X: "I just joined the waitlist for [Startup Name] — [tagline]. [URL]"
   - LinkedIn: similar message
   - Copy link button

On server error (e.g. duplicate email), show a friendly message: "Looks like you're already on the list!"

## Backend

### Database

- Use SQLite via Python's built-in `sqlite3` module (no extra dependencies)
- Create a `waitlist.db` file in the project root
- Table schema:
  ```sql
  CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    interest TEXT,
    signed_up_at TEXT DEFAULT (datetime('now'))
  )
  ```
- Initialize the database on app startup (create table if not exists)
- Add `waitlist.db` to `.gitignore`

### Pydantic Models (`backend/models.py`)

- `WaitlistRequest`: email (required, valid email), name (optional), interest (optional)
- `WaitlistResponse`: success (bool), message (str), position (int)
- `WaitlistCount`: count (int)

### API Endpoints (`backend/server.py`)

- `POST /api/waitlist`:
  - Validates input via Pydantic
  - Checks for duplicate email — if exists, return `{ "success": false, "message": "You're already on the list!" }` with 409
  - Inserts into SQLite
  - Returns `{ "success": true, "message": "You're on the list!", "position": <number> }`
  - Returns 422 for invalid data (FastAPI handles this automatically)
- `GET /api/waitlist/count`:
  - Returns `{ "count": <number> }` from SQLite
- `GET /api/waitlist/export`:
  - Returns all signups as JSON array (name, email, interest, signed_up_at)
  - This is your admin view — useful for the demo

## Security

### API Key for Admin Endpoints

- Generate a random API key on first run and store it in `.env` as `ADMIN_API_KEY`
- Protect `GET /api/waitlist/export` with an `X-API-Key` header check
- If the key is missing or wrong, return 401
- Load the key with `os.environ` — never hardcode it
- The `/api/waitlist/count` endpoint stays public (it only returns a number)

### Rate Limiting

- Limit `POST /api/waitlist` to 5 requests per minute per IP
- Use a simple in-memory dict tracking IP → timestamps (no extra dependencies)
- Return 429 with `{ "detail": "Too many requests. Try again in a minute." }` when exceeded

### CORS

- Add FastAPI's `CORSMiddleware` to `backend/server.py`
- In development: allow `http://localhost:5173` (Vite dev server)
- Keep the allowed origins list configurable via `.env` for production

### Privacy

- Add a short privacy note below the form: "We'll only use your email to notify you when we launch. No spam, unsubscribe anytime."
- This is a `<p>` with small, muted text — not a checkbox or modal

## Submit Flow

1. User sees "Join X+ others" counter
2. Fills in email, optionally name and interest dropdown
3. Client validates email format before sending
4. Submit button shows loading state (disabled, text changes)
5. `fetch` POST to `/api/waitlist` with JSON body
6. On success: confetti, queue position, share buttons
7. On duplicate: friendly "already signed up" message
8. On error: form stays visible, error message shown
