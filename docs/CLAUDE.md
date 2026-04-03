# How to Work with Specs

## Order matters

- Folders are numbered: `00_project/` → `01_landing_page/` → `02_waiting_list/`. Always work in order.
- Within a spec, sections are ordered top to bottom. Complete each section before moving to the next.
- Within a section, bullet points are ordered by priority. Start at the top.
- Don't skip ahead — later requirements often depend on earlier ones.

## From spec to code

- Each bullet point in a spec is one testable requirement. Write one test per bullet.
- Specs define **what** to build, not **how**. Let the participant make implementation and design choices.
- If a requirement is ambiguous, ask the participant — don't guess.
- If a requirement contradicts a passing test, the test wins.

## Context

- Read `docs/00_project/01_overview.md` before building anything — use the participant's startup name, colors, and tone in all code and copy.
- If a strategy brief exists at `docs/00_project/03_strategy.md`, use it for feature card content and CTA copy.
