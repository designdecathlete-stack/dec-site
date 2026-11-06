# LP QA Checklist

## 1. Strategy And Offer

- The FV answers: who this is for, what they get, and why it matters now.
- The first 2 screens match the ad/query/referral promise.
- The page has one main conversion goal.
- The CTA wording is action-oriented and not misleading.
- Different variants have clearly different hooks, not only swapped headlines.

## 2. CTA And Tracking

- All primary CTAs use the correct destination for that page variant.
- Secondary CTAs do not accidentally replace conversion CTAs.
- External CTAs have `target="_blank"` and `rel="noopener"` when appropriate.
- Sticky/bottom CTAs do not hide important text on mobile.
- Phone, LINE, form, reservation, map, and tracking links are tested on the public URL.

## 3. Copy Quality

- No typos, broken Japanese, garbled characters, placeholder copy, or old meeting notes.
- No contradiction between FV, reasons, FAQ, salary, and募集要項.
- Salary, guarantees, benefits, holidays, working hours, and requirements are consistent.
- Claims are specific enough to be credible and not over-promising.
- Tone matches the audience: reassuring for beginners, practical for parents, respectful for experienced/blank-return candidates.
- Staff voice/customer voice/source labels are accurate.

## 4. Visual And Layout

- No image, badge, decoration, or card overlaps readable text.
- No text is clipped or too close to page edges.
- Long Japanese strings wrap cleanly on mobile.
- Photos support the section's message and are not reused in the same LP unless intentional.
- Generated images do not contain weird skin texture, distorted hands, fake unreadable text, or inconsistent faces.
- FV text and image composition still work at 375px, 390px, 430px, and desktop widths.

## 5. Structure And HTML

- Every referenced image/script/CSS file exists.
- Every meaningful image has useful `alt` text.
- Title and meta description match the page variant.
- Section IDs are unique.
- Internal anchors point to existing IDs.
- No duplicate IDs, invalid nested anchors, or leftover hidden sections from old drafts.

## 6. SEO And Sharing

- Page title is unique and specific.
- Meta description is natural and includes the main offer.
- Open Graph image/title/description are present when the page is shared publicly.
- Canonical handling is intentional for variant pages.
- The page does not depend on image-only text unless that is acceptable for the campaign.

## 7. Performance And Assets

- Images are WebP or otherwise intentionally optimized.
- Raster FV/banner images are not needlessly huge.
- Unused generated source PNGs are not referenced accidentally.
- No local file paths, temp paths, or private machine paths appear in HTML/CSS/JS.
- Public URL returns expected status and fresh content after deploy.

## 8. Publication Gate

- Review local files.
- Verify mobile screenshots.
- Commit only relevant files.
- Push to the correct branch.
- Deploy or wait for CI/CD.
- Verify the public URLs with cache-busting.
- Report exact URLs and any remaining risk.
