You are helping a hackathon participant scope a realistic MVP for their startup. They have already built a landing page and waiting list. Now they want to build the actual product — your job is to make sure they scope it small enough to finish in ~2 hours.

## Step 1: Read context

Read `docs/00_project/01_overview.md` and `docs/00_project/03_strategy.md` (if it exists) to understand their startup.

## Step 2: Reality check

Tell the participant:

**"You've got about 2 hours left. That's enough time for ONE core feature — not a full product. Let's figure out the one thing that would make investors say 'wow, it actually works.'"**

## Step 3: Identify the core action

Use AskUserQuestion:

**"If a user could only do ONE thing in your product, what would it be? Not a feature list — the single action that delivers your core value."**

Help them sharpen it. Push back on anything that sounds like multiple features. Examples of good answers:
- "Upload a receipt and get it categorized automatically"
- "Enter a mood and get a personalized playlist"
- "Paste a job description and get a tailored cover letter"
- "See all my subscriptions in one dashboard"

If they're stuck, suggest 2-3 options based on their startup overview.

## Step 4: Scope the MVP

Use AskUserQuestion to walk through these constraints ONE AT A TIME:

1. **What's the input?** (What does the user provide? A form? A file upload? A selection?)
2. **What's the output?** (What do they get back? A result page? A download? A visualization?)
3. **Where does the logic live?** (Can it be done with a simple API call? Does it need an external API like OpenAI? Can you fake it with hardcoded data for the demo?)

## Step 5: Pick the simplest implementation

Based on their answers, decide on the technical approach. Prefer this order:
1. **Hardcoded/mock data** — if the demo just needs to look real (e.g. a dashboard with fake data)
2. **Simple backend logic** — if it's a calculation, filter, or transformation (Python can handle it)
3. **External API** — if they need AI/ML (use OpenAI API), data lookup, etc. Only if truly necessary.

Tell the participant your recommendation and why. Be honest: "We could call the OpenAI API for real results, or we can mock it with realistic fake data — the mock will be faster to build and more reliable for the demo. Which do you prefer?"

## Step 6: Write the spec

Create `docs/03_mvp/spec.md` with this structure:

```markdown
# Phase 3: MVP — [Feature Name]

[One sentence describing what this feature does]

## What the user sees

- [Step-by-step user flow, max 4 steps]
- [What the input looks like — form fields, upload button, etc.]
- [What the output looks like — results card, chart, dashboard, etc.]

## Frontend

- [New React component(s) needed]
- [Where it lives in the page — new route? new section? modal?]
- [Key UI elements]

## Backend

- [New API endpoint(s) — method, path, request/response shape]
- [Where the logic lives — simple Python? external API call?]
- [What data to store (if any)]

## What we're NOT building

- [Explicitly list 2-3 things that are out of scope]
- [e.g. "No user accounts", "No real payment processing", "No file storage"]

## Demo script

- [3-4 bullet points: exactly what to show during the final presentation]
- [The exact flow from input to output that will impress]
```

## Step 7: Confirm and go

Show the spec summary to the participant. Use AskUserQuestion:

**"Here's your MVP scope. This is tight enough to build in 2 hours. Ready to go, or want to adjust anything?"**

After confirmation, tell them:

**"Your MVP is scoped. The spec is at `docs/03_mvp/spec.md`. Tell me: 'Build the MVP' and I'll start with tests."**
