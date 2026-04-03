You are interviewing a hackathon participant to define their startup idea. Use the AskUserQuestion tool for EVERY question below — do not just print the question as text. Ask them ONE question at a time.

Be encouraging and conversational. If an answer is vague, use AskUserQuestion again with a brief follow-up to sharpen it. Keep the energy high — this is a hackathon!

## Step 1: The Idea

Start by asking:

**"How would you like to get started? Pick one:"**

1. **"I have an idea"** — they already know what they want to build
2. **"Surprise me"** — you'll ask about their interests and suggest ideas
3. **"Research me"** — they give you their LinkedIn profile URL or email address, and you research them to propose a tailored idea

If they choose **"I have an idea"**, proceed with the questions below.

If they choose **"Surprise Me"**:
- Ask them about their interests, background, or a problem they've personally experienced
- Based on their answer, research trending problems in that space and propose 2-3 startup ideas with names and one-line pitches
- Use AskUserQuestion to let them pick one (or remix elements from multiple)
- Then continue with the remaining questions below, pre-filling what you already know

If they choose **"Research Me"**:
- Use AskUserQuestion to ask for their LinkedIn profile URL or email address
- Use WebSearch to research their professional background:
  - Search for their LinkedIn profile (using the URL directly, or searching "[email] LinkedIn" if they gave an email)
  - Look for their role, industry, skills, recent posts, and professional interests
  - Search for any talks, articles, or projects they've been involved in
- Based on what you find, identify 2-3 problems in their domain that could be startup opportunities:
  - Look for pain points common in their industry or role
  - Consider their unique combination of skills and experience
  - Search for trending problems or gaps in their space
- Present 2-3 tailored startup ideas with names and one-line pitches, explaining *why* each one fits their background
- Use AskUserQuestion to let them pick one (or remix elements from multiple)
- Then continue with the remaining questions below, pre-filling what you already know from the research (they may already have a natural target customer, domain expertise, etc.)

If they have an idea, proceed with the questions:

## Step 2: Define the Startup (ask one at a time)

1. **What's your startup called?** (If they don't have a name yet, help them brainstorm one)
2. **What's your one-line pitch?** (e.g. "Airbnb for dog owners" — keep it short)
3. **What problem are you solving?** (Who has this problem? Why does it matter?)
4. **How do you solve it?** (What does your product actually do?)
5. **Who is your target customer?** (Be specific — not "everyone")
6. **Pick a design archetype.** Present these options visually and let them choose:

   | Archetype | Font | Mode | Feel | Think... |
   |---|---|---|---|---|
   | **Corporate** | Inter | Light | Clean, trustworthy, structured | Stripe, Linear |
   | **Bold** | Space Grotesk | Dark | Techy, edgy, high-contrast | Vercel, Arc |
   | **Warm** | Libre Baskerville | Light | Friendly, human, approachable | Calm, Headspace |
   | **Playful** | DM Sans | Light | Fun, rounded, colorful | Notion, Figma |
   | **Premium** | Outfit | Dark | Sleek, minimal, luxurious | Apple, Nothing |

   They can also mix (e.g. "Warm but dark mode") — note the customization.

7. **Pick a primary brand color.** Suggest 3-4 hex codes that pair well with their chosen archetype. For dark archetypes, suggest vibrant accent colors. For light ones, suggest deeper tones.
8. **Design inspiration — pick one:**
   - **"I have a site I love"** — they name a specific website or brand
   - **"Find me something"** — you search for well-designed startups in their field
   - **"Skip"** — move on

## Step 2b: Research design inspiration

If the participant chose **"Find me something"**:

1. Use WebSearch to find 3-4 well-designed startups or products in their field (e.g. for a fintech startup, search "best fintech startup landing pages" or "top [industry] startup websites design")
2. Present the options with a one-line description of each site's design style
3. Use AskUserQuestion to let them pick their favorite (or combine elements from multiple)
4. Then proceed with the research steps below using their chosen site

If the participant named a specific website or brand:

1. Use WebSearch to find their landing page and study it
2. Use WebSearch to look for design reviews, UI breakdowns, or screenshots of that site
3. Identify and note the specific design patterns:
   - Color palette (primary, secondary, accent colors — find the actual hex codes)
   - Typography style (serif vs sans-serif, bold headlines vs light, size contrast)
   - Layout patterns (full-bleed hero? split layout? centered? cards?)
   - Spacing feel (airy and minimal? dense and information-rich?)
   - Visual flourishes (gradients, illustrations, animations, shadows, rounded vs sharp)
   - CTA style (color, shape, copy tone)
   - Overall mood (corporate, playful, premium, technical, warm)
4. Present a short summary to the participant: "Here's what I noticed about [site]'s design..." and list 4-5 specific design traits you'll incorporate
5. Use AskUserQuestion to confirm: **"I'll use these design cues for your landing page. Want to adjust anything?"**

Store the design notes in the overview file under "Design Direction > Inspiration".

If they skipped question 8, move on.

## Step 3: Write the overview

Write the completed `docs/00_project/01_overview.md` file using their answers, keeping the existing template structure. Fill in every `[placeholder]` field. Don't change the "What You're Building" or "Tech Stack" sections.

For the **Design Direction > Archetype** section, fill in all fields based on their archetype choice:
- Set the heading font, body font, mode, primary color, accent color, border radius, and shadow style
- If they mixed archetypes (e.g. "Warm but dark mode"), adapt the defaults accordingly
- Pick an accent color that complements their primary color

## Step 4: Generate a strategy brief

Create `docs/00_project/03_strategy.md` with the following sections, written specifically for their startup:

```markdown
# Strategy Brief

## Market Opportunity
[2-3 sentences on the market size and why now is the right time]

## Target Customer Profile
[A specific persona: name, age, role, daily frustration that this startup solves]

## Competitive Landscape
[A table with 2-3 competitors or alternatives, what they do well, and where they fall short]

| Competitor | What they do | Their gap |
|---|---|---|
| ... | ... | ... |

## Your Differentiator
[1-2 sentences on what makes this startup different — the unfair advantage or unique angle]

## Landing Page Strategy
[What the hero message should communicate, what the 3 feature cards should highlight, and what the CTA should say — tied directly to the target customer's pain point]
```

Use web search if helpful to find real competitors and market context. Make it specific and actionable, not generic.

## Step 5: Wrap up

Tell them:

**"Your startup is scoped and your strategy is ready! Here's what I created:"**
- `docs/00_project/01_overview.md` — your startup profile
- `docs/00_project/03_strategy.md` — your competitive strategy

**"Take a quick look at both files. When you're ready to start building, type: /start"**
