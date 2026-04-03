# Phase 1: Landing Page

Get the server running and build a landing page that makes your startup feel real.

## Server Setup

- FastAPI app in `backend/server.py` (the `app` object must be importable)
- Health endpoint: `GET /api/health` returns `{ "status": "ok" }`
- Pydantic `HealthResponse` model in `backend/models.py`
- Server runs on port 3004 via `npm run dev:backend`

## React App

- Main component in `frontend/App.jsx`
- Must render `<header>`, `<main>`, and `<footer>` semantic elements
- Use Tailwind CSS classes for all styling — no custom CSS needed
- Use Framer Motion for scroll animations and micro-interactions
- Use Remotion (`@remotion/player`) for timeline-based compositions in the hero and How It Works sections
- Use Lucide React for icons throughout

## Navigation

- Sticky header with your startup name/logo on the left
- Navigation links to page sections (Features, How it Works, Waiting List)
- CTA button in the header that scrolls to the waiting list
- Header should have a subtle backdrop blur and border on scroll

## Hero Section

- Your startup name in an `<h1>` — large, bold, impossible to miss
- Tagline in a `<p>` — one sentence that communicates your value
- A secondary line of supporting text (2-3 sentences expanding on the tagline)
- Primary CTA button that scrolls to the waiting list section
- Secondary CTA (e.g. "Learn more") that scrolls to features
- Background: gradient or subtle pattern using your brand color — not a flat color

### Hero Remotion Composition

Embed a Remotion `<Player>` in the hero section alongside the text content. This is a looping, autoplay composition with no controls — it should feel like a premium animated visual, not a video player.

Build a Remotion composition that reinforces the startup's value prop. Ask the participant which style fits, then build it:
- **Animated product mockup** — a phone or browser frame with UI elements sliding into place
- **Orbiting icons** — icons representing features circling a central logo or element
- **Animated logo / brand mark** — the startup name or icon assembling itself
- **Live dashboard mockup** — numbers ticking up, charts drawing, status indicators lighting up
- **Data flow visualization** — nodes and connections animating to show how the product works

Player settings: `autoPlay`, `loop`, `controls={false}`, `style={{ width: '100%' }}`. Use `useCurrentFrame()` and `interpolate()` for all animations. Keep compositions to 150-200 frames at 30fps (5-7 second loops).

Place the composition in a split layout: text on the left, Remotion player on the right (stacked on mobile).

## Social Proof Bar

- A horizontal bar below the hero with 3 key metrics or trust signals
- Examples: "500+ early signups", "Featured in TechCrunch", "4.9/5 rating"
- Use placeholder numbers — the point is the visual pattern
- Subtle background (e.g. `gray-50`) to separate from the hero

## Features Section

- Section heading with a short subtitle
- At least 3 feature cards, each with:
  - A Lucide React icon (choose icons that match the feature)
  - A heading
  - A short paragraph (2-3 sentences)
- Grid layout: stacked on mobile, 3 columns on desktop
- Cards should have subtle hover effects (lift shadow, slight scale)
- Animate cards in on scroll with Framer Motion (stagger effect — cards appear one after another)

## How It Works — Animated Walkthrough

This section uses a second Remotion `<Player>` composition to turn "how it works" into an animated explainer sequence instead of static numbered steps.

Build a Remotion composition that plays through 3 steps in sequence:
- **Step 1** animates in (icon + heading + description appear), holds for ~2 seconds
- **Transition** — step 1 fades/slides out, step 2 animates in
- **Step 2** holds for ~2 seconds
- **Transition** to step 3
- **Step 3** holds, then the composition loops back

Each step should have:
- A step number or icon
- A heading
- A short description
- Visual elements that reinforce the step (e.g. an arrow, a checkmark appearing, a progress bar)

Use the startup's brand color for accents. The composition should be ~300 frames at 30fps (~10 seconds).

Player settings: `autoPlay`, `loop`, `controls={false}`. Place the player centered in the section with a max width. Add a heading above it (e.g. "How it works").

Alternating background from the previous section.

## Testimonials Section

- 2-3 testimonial cards with:
  - A quote (make up realistic placeholder quotes that match your target customer)
  - Name and role (e.g. "Sarah Chen, Product Manager")
- Use quote marks or a Lucide `Quote` icon as a visual accent
- Cards in a grid or horizontal scroll on mobile

## Final CTA Section

- A bold section before the footer that drives signups
- Headline like "Ready to get started?" or "Join the waitlist"
- Brief supporting text
- CTA button that scrolls to or duplicates the waiting list form
- Gradient or brand-colored background to make it stand out

## Footer

- Your startup name
- Links to sections on the page
- Copyright with current year
- Keep it simple and clean

## Design

- Use your primary brand color from `docs/00_project/01_overview.md`
- Follow the design principles in `CLAUDE.md`
- Responsive: test at 375px (mobile) and 1024px+ (desktop)
- Framer Motion for scroll reveals, hover effects, and micro-interactions
- Remotion for the two timeline compositions (hero + how it works)

## Pre-written Tests

Tests in `tests/phase1/` are already written. Make them all pass first, then build out the sections above in order.
