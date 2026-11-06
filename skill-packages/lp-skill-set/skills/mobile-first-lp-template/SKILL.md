---
name: mobile-first-lp-template
description: Create landing pages using a mobile-first Japanese LP layout where the main content is a central smartphone-width page, desktop shows fixed left navigation and fixed right CTA/sidebar, and mobile shows only the LP body with a bottom fixed CTA. Use when the user asks for a スマホファーストテンプレート, Resole-like LP layout, central 480px LP, PC sidebars around a mobile LP, or wants a landing page based on this template.
---

# Mobile First LP Template

## Core Pattern

Build the LP as a static, mobile-width page first. On desktop, keep the central `.main` LP at about `480px` wide and add fixed sidebars:

- `.sb-left`: fixed desktop navigation with section anchors and active state.
- `.main`: the actual LP body, centered, smartphone-width, scrollable.
- `.sb-right`: fixed desktop offer/price/CTA card.
- `.float-cta`: bottom fixed CTA, visible only on mobile/tablet.

Use this skill together with the frontend design skill when creating or redesigning the page.

## Starting From The Asset

Copy `assets/template/` into the requested output folder, then edit the copied files:

```powershell
Copy-Item -Recurse "$env:USERPROFILE\.codex\skills\mobile-first-lp-template\assets\template\*" "<output-folder>"
```

The template includes:

- `index.html`: complete LP structure and placeholder Japanese copy.
- `style.css`: central mobile LP, fixed desktop sidebars, mobile bottom CTA.
- `script.js`: reveal animation, FAQ accordion, desktop nav active state.

Do not edit the skill asset directly for a client job. Copy it first, then customize the copy.

## LP Sections

Keep the section order unless the user gives a specific funnel:

1. Hero visual and first promise
2. CTA block
3. Problem / empathy
4. Offer / solution
5. Reason / features
6. Proof / results / testimonials
7. Flow / steps
8. FAQ
9. Closing CTA

For real businesses, replace generic copy with concrete service-specific copy. Keep each mobile paragraph short, usually 1-3 lines on a 375px viewport.

## Layout Rules

- Keep `--content-width` near `480px`.
- Hide `.sb-left` and `.sb-right` below the desktop breakpoint.
- Show `.float-cta` below the desktop breakpoint.
- Make all primary CTAs point to the same conversion destination unless the user asks otherwise.
- Preserve section IDs used by desktop nav or update both nav links and IDs together.
- Avoid building a wide desktop landing page; the point of this skill is a mobile LP displayed inside a desktop frame.

## Customization Checklist

Before finishing, update:

- Page title and meta description.
- Logo text and side navigation labels.
- Hero image, hero headline, and first CTA.
- Offer/price card in the right sidebar.
- CTA destination URLs.
- Proof numbers, testimonials, FAQ, and footer.

## Verification

Render and inspect at least:

- Mobile: `375x812`
- Desktop: `1366x900`

Confirm:

- Desktop shows left nav, central smartphone-width LP, and right CTA sidebar.
- Mobile hides sidebars and shows bottom fixed CTA.
- No horizontal overflow.
- Text does not overlap buttons, cards, or images.
- Hero and CTA are visible without awkward cropping.
