---
name: lp-quality-checker
description: Audit landing pages before publication for copy quality, CTA consistency, image usage, broken asset references, HTML basics, mobile-first layout risks, and variant consistency. Use when Codex is asked to review, QA, polish, rebuild, or publish an LP, or to create a reusable LP checking agent/checklist.
---

# LP Quality Checker

Use this skill to audit an LP before publishing or after revisions. Check the page as a conversion asset, not only as HTML.

## Workflow

1. Identify the target LP files, variants, shared CSS/JS, image folders, and expected CTA URLs.
2. Run `scripts/check_static_lp.py` against the LP folder or specific HTML files.
3. Read `references/checklist.md` and complete a human editorial/design pass.
4. Fix high-impact issues first: wrong CTA, broken images, visible overlap, misleading copy, duplicate or irrelevant photos, garbled text, and inconsistent variant messaging.
5. Verify locally in desktop and mobile widths, then verify the public URL after deploy.

## Machine Check

Run:

```powershell
python C:\Users\kanat\.codex\skills\lp-quality-checker\scripts\check_static_lp.py .\path\to\lp
```

Useful options:

```powershell
python C:\Users\kanat\.codex\skills\lp-quality-checker\scripts\check_static_lp.py .\path\to\lp --expected-cta "index-mama.html=https://example.com"
python C:\Users\kanat\.codex\skills\lp-quality-checker\scripts\check_static_lp.py .\path\to\lp --json-out qa-report.json
```

Treat findings as prompts for judgment. Some issues, such as no `<h1>` when the first view is a single image banner, may be acceptable only when the image itself carries the FV text and the page has strong metadata.

## Human Pass

Read `references/checklist.md` when doing a full LP review. At minimum, check:

- Offer clarity: who the LP is for, what changes for them, and why now.
- CTA integrity: every primary CTA goes to the intended destination for that variant.
- Visual hierarchy: no photo, badge, decoration, or sticky CTA covers text.
- Image relevance: no customer voice where staff voice is needed, no repeated photo in the same LP unless intentional.
- Copy consistency: salary, benefits, experience requirements, training promises, and tone match across the FV, body, FAQ, and requirements section.
- Mobile reality: read at real mobile width, not only a desktop preview.

## Output Format

When reporting an LP audit, lead with:

1. Fixed items, if changes were made.
2. Remaining findings ordered by severity.
3. Public or local URLs checked.
4. Machine-check summary and any manual visual checks.

Keep the report concrete: file paths, line numbers when available, exact CTA URL, missing asset names, and which page variant is affected.
