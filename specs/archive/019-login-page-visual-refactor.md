# Login Page Reference-Parity Refactor Spec

## Status

Implemented on 2026-07-29.

The immutable reference is committed with the spec, the login presentation and admin-safe CTA
variant are implemented, focused behavior and accessibility tests are in place, and the baseline
was reviewed with both a pixel diff and a semi-transparent overlay. A persistent full-page
screenshot runner and the extended browser/assistive-mode matrix remain follow-up verification
because this repository does not currently provide a screenshot-regression harness.

Responsive correction completed on 2026-07-29: the complete desktop foreground now scales as one
uniform 1536-by-1024 scene, while the decorative artwork scales independently with cover behavior
and remains anchored to the lower-right edge. Narrow, portrait, and short viewports retain the
readable document-flow layout instead of shrinking the desktop scene below usable text sizes.

## Goal

Refactor the signed-out `/login` experience so its default desktop rendering is visually
indistinguishable from the supplied 1536-by-1024 reference image. The reference image is the
normative source of truth for composition, artwork, copy, typography, color, spacing, borders,
shadows, and cropping. Measurements in this spec are implementation aids; when a measurement and
the reference appear to disagree, the reference wins.

## Reference and Fidelity Contract

- Reference baseline: [`../assets/019-login-page-reference.png`](../assets/019-login-page-reference.png).
- Baseline state: signed out, `/login`, no error query parameter, 1536-by-1024 CSS-pixel viewport,
  100% browser zoom, and device scale factor 1.
- The whole frame is in scope, including the page background, gold arcs, brand lockup, card, icons,
  text, and empty space. Matching only the card is insufficient.
- There are no intentional visual deviations from the reference at the baseline viewport. Visual
  regression tolerance may ignore only browser text antialiasing and subpixel rasterization.
- Major bounding boxes and shared centerlines must be within 2px of the reference; internal spacing
  and text baselines must be within 3px. No coherent color, geometry, shadow, or artwork difference
  may be hidden behind a broad percentage threshold.
- The implementation must use deterministic local assets and font fallbacks so the captured page
  has no layout shift or dependency on a third-party network request.

## Current Repo Findings

- `apps/web/src/app/login/page.tsx` keeps `/login` dynamic, redirects an authenticated user to
  `/workspace`, and maps `?error=microsoft_sign_in_failed` to the existing error message.
- The route renders `WorkspaceExperience`, which also renders `LoginScreen` when client-side session
  restoration fails. The refactored login presentation must work in both entry paths.
- `apps/web/src/app/login/LoginScreen.tsx` currently renders an eyebrow, heading, description,
  optional `role="alert"`, and the Microsoft sign-in link inside a small generic panel.
- `apps/web/src/app/login/MicrosoftSignInLink.tsx` owns the Microsoft start URL and optional encoded
  `returnTo`. `AdminDashboard` reuses this component with `returnTo="/admin"`.
- `apps/web/src/app/login/auth.css` is imported globally and the sign-in link also inherits
  `.primary-button` and global anchor rules. New login styling therefore needs login-scoped selectors
  and must not unintentionally redesign the admin sign-in control.
- The repository has the brand mark in `apps/web/src/app/icon.png` and a favicon, but it does not
  have approved standalone assets for the full brand lockup, people icon, security icon, or sweeping
  background. Every candidate asset must be checked against the reference before reuse.
- Existing automated coverage checks the Microsoft URL and error text. There is no configured
  screenshot regression test for `/login`.

## Non-Goals

- Change Microsoft OIDC, session, cookie, user, audit, or redirect behavior.
- Add password login, registration, another identity provider, or new account actions.
- Redesign the workspace, admin dashboard, admin login surface, or shared button system.
- Add content, controls, footer links, animation, or branding that is absent from the reference.
- Treat approximate CSS values in this document as permission to differ visibly from the reference.
- Implement the refactor as part of writing this specification.

## Requirements

### 1. Baseline Geometry

All coordinates below are measured from the upper-left corner of the 1536-by-1024 reference and are
approximate until confirmed by overlay comparison.

| Element              | Target bounds or position                            |
| -------------------- | ---------------------------------------------------- |
| Page                 | `x: 0`, `y: 0`, `1536 x 1024`; no scrollbar          |
| Brand lockup         | `x: 599`, `y: 72`, approximately `339 x 119`         |
| Login card           | `x: 436`, `y: 237`, approximately `662 x 655`        |
| People-icon circle   | `x: 709`, `y: 287`, `112 x 112`                      |
| Microsoft CTA        | `x: 497`, `y: 585`, approximately `538 x 94`         |
| Divider rules        | `x: 497–664` and `x: 869–1035`, centered at `y: 733` |
| Security-icon circle | `x: 563`, `y: 779`, approximately `54 x 54`          |

- The page, brand lockup, card, people icon, heading, subtitle, CTA, and divider share the same
  horizontal centerline as the reference.
- The gap from the brand lockup to the card is approximately 46px.
- The card has approximately 60px horizontal padding. Its key vertical gaps are about 50px from the
  card top to the people icon, 22px from the icon to the heading, 34px from the subtitle to the CTA,
  44px from the CTA to the divider, and 39px from the divider to the security row.
- The baseline must not use responsive scaling, browser scrolling, or content compression to make
  the geometry fit.

### 2. Full-Viewport Background

- Fill the viewport with the reference's near-white lavender wash, including its warmer cream tone
  toward the lower-right. Representative colors are `#faf9ff` and `#f5f3fb`, but overlay matching
  decides the final stops and opacity.
- Reproduce the large concentric gold sweeps originating beyond the lower-right edge. Preserve the
  exact curve paths, widths, white/cream gaps, cropping, soft grain, and gold progression from pale
  `#f7d27a` through `#e9a91b` to deep `#d99100`.
- The artwork may be an optimized local raster, SVG, or carefully constructed CSS only if its
  reference overlay is indistinguishable. Do not substitute generic circles or a flat gradient.
- Anchor the artwork to the bottom-right without tiling. It must not cause page overflow or a seam
  at the viewport edges.

### 3. Brand Lockup

- Render the checklist/arrow mark and two-line `Onboarding Accelerator` wordmark as the exact
  reference lockup at its measured size and aspect ratio.
- `Onboarding` is dark charcoal and `Accelerator` is warm gold. Their weight, line spacing, and
  alignment with the mark must match the supplied artwork.
- Prefer an approved transparent local lockup asset. If the existing brand mark and live text are
  used, first prove through overlay comparison that their crop, color, font metrics, and alignment
  are identical. Do not ship a checkerboard, matte, or other unintended asset background.
- Expose one useful accessible brand name and hide any duplicate decorative image or wordmark text
  from assistive technology.

### 4. Card and Primary Content

- The card is approximately 662-by-655px with a 25px radius, a translucent/off-white surface,
  subtle 1px light edge, and a soft shadow close to `0 10px 32px rgba(20, 25, 55, 0.08)`.
- Render a 112px pale-lavender circular medallion near the card top. Its indigo outline people icon
  must match the reference; no emoji, font glyph, or materially different stock icon is acceptable.
- Render `Welcome back.` as the only visible `h1`, centered in dark navy near `#0b1027`, at roughly
  48–50px, weight 700–750, and a 58px line height. Tune actual values against the reference font
  metrics.
- Render the subtitle centered in exactly two lines at the baseline viewport, approximately
  21–22px with a 31px line height and slate color near `#4b5677`:

  ```text
  Sign in with your company Microsoft account
  to access Onboarding Accelerator.
  ```

- Preserve the reference's visual hierarchy and exact punctuation. Do not retain the current
  `Onboarding` eyebrow or `Sign in to your workspace` copy.

### 5. Microsoft Sign-In CTA

- Render one 538-by-94px anchor at the baseline viewport with a white fill, approximately 12px
  radius, 1.5px pale-lavender border near `#c5c0ff`, and the reference's restrained indigo shadow.
- Use the four-color Microsoft square mark at approximately 42-by-42px. Preserve the exact red,
  green, blue, and yellow arrangement, square size, and gaps shown in the reference.
- Render `Continue with Microsoft` on one line at approximately 26–27px, weight 650–700, in dark
  navy. Match the reference's icon-to-label gap and the visual centering of the complete group.
- Keep the control a real anchor with a minimum 44px pointer target and a visible keyboard focus
  state. Hover, focus, active, and visited styles must remain within the same visual language and
  must not add an underline or shift the layout.
- Preserve `/api/auth/microsoft/start` and the optional URL-encoded `returnTo` behavior exactly.

### 6. Trust Divider and Security Row

- Place `Secure and trusted` at the reference position in approximately 19px slate text, with two
  1px light-gray rules of the measured lengths and gaps.
- Render the security row below it with a roughly 54px pale-lavender medallion and the exact indigo
  shield/lock outline treatment from the reference.
- Align the following two lines to the left of one copy block while keeping the full row centered:

  ```text
  Secure sign-in with Microsoft
  Your organization’s data is protected.
  ```

- The title is approximately 20px/600 in dark navy. The description is approximately 18px/400 in
  slate. Preserve the curly apostrophe and exact punctuation.

### 7. Authentication and Error Behavior

- Preserve the authenticated redirect to `/workspace`, the Microsoft callback failure mapping, and
  the client-side fallback that can render `LoginScreen` from `WorkspaceExperience`.
- Preserve the existing accessible `role="alert"` error message when sign-in fails. The reference
  defines the no-error baseline only; the error state may expand or reflow the card as needed rather
  than overlapping or hiding reference content.
- Style the error state as part of the same visual system, keep its copy readable at all supported
  widths, and do not reserve visible empty space for it in the no-error baseline.
- Keep `MicrosoftSignInLink` reusable by the admin surface. Login-specific layout and appearance
  must be applied through an explicit variant, wrapper, or scoped selector so `/admin` does not
  inherit the full-screen login design.

### 8. Responsive and Accessibility Behavior

- Exact parity is required at 1536-by-1024. No mobile reference is supplied, so smaller viewports
  must preserve the same hierarchy rather than inventing a different design.
- Below the desktop width, use a card width no greater than
  `min(662px, calc(100vw - 32px))`, keep the CTA full width, scale the brand lockup proportionally,
  and reduce internal padding and type only as needed to prevent clipping.
- On short viewports, allow vertical page scrolling and preserve safe top and bottom spacing; do not
  squash or overlap the card contents. Never create horizontal scrolling.
- Keep the background anchored bottom-right as the viewport changes. Decorative arcs may crop, but
  may not obscure the copy or control.
- Maintain semantic reading order, an identifiable `main`, one `h1`, a real sign-in link, and the
  existing alert semantics. Decorative icons and divider rules must be hidden from assistive
  technology.
- Maintain WCAG AA text and control contrast, visible `:focus-visible` treatment, 200% zoom
  usability, and Windows high-contrast/forced-colors usability without changing the unfocused
  baseline screenshot.
- Do not add motion. If an implementation detail introduces a transition, disable it under
  `prefers-reduced-motion` and during visual-regression capture.

## Expected Implementation Areas

- `apps/web/src/app/login/LoginScreen.tsx`
- `apps/web/src/app/login/MicrosoftSignInLink.tsx`
- `apps/web/src/app/login/auth.css`
- `apps/web/src/app/login/page.tsx` only if presentation composition requires a route-level change
- `apps/web/src/app/workspace/WorkspaceExperience.tsx` only if the existing login entry contract
  cannot be preserved without a focused adjustment
- `apps/web/src/app/admin/admin.css` and its tests only to protect the shared admin sign-in use
- Local image or SVG assets under an appropriate web asset directory
- Focused login component tests and a deterministic visual-regression fixture or route

## Verification Plan

### Automated

- Add a screenshot assertion at exactly 1536-by-1024, 100% zoom, and device scale factor 1. Compare
  the complete page with the supplied reference after local fonts and assets finish loading.
- Configure the screenshot comparison to tolerate antialiasing only. Use a diff image and overlay
  to reject visible shifts, artwork changes, gradient differences, incorrect text wrapping, and
  missing shadows.
- Add focused component tests for the exact visible copy, semantic heading, decorative icon
  treatment, Microsoft start href, encoded `returnTo`, and optional alert.
- Keep the authenticated redirect and existing login presentation coverage passing.
- Run `npm run format:check`, `npm run lint`, `npm test`, and `npm run build`.

### Manual

- Compare the implementation and reference with a 50% opacity overlay at 1536-by-1024 and inspect
  every major edge, centerline, text baseline, curve, border, and shadow.
- Verify normal, hover, keyboard focus, active, authentication failure, and admin `returnTo` states.
- Verify 1536-by-1024, common laptop widths, narrow mobile widths, short viewports, 200% zoom,
  reduced-motion mode, and forced colors without clipping or unintended scrollbars.
- Perform visual QA with authentication enabled or through a direct component fixture because the
  local `AUTH_DISABLED=true` default may redirect `/login` to `/workspace`.

## Implementation Todo List

### Reference and Assets

- [x] Preserve the supplied 1536-by-1024 image as the immutable visual-regression baseline.
- [x] Measure and confirm all baseline bounding boxes, centerlines, text baselines, and color stops.
- [x] Source or create an exact transparent brand lockup that matches the reference.
- [x] Source or create exact people, Microsoft, and shield/lock artwork with no generic substitutes.
- [x] Reproduce the complete lavender/cream background and bottom-right gold sweeps as a local,
      deterministic asset or an overlay-proven SVG/CSS composition.
- [x] Optimize assets without introducing visible compression, matte, crop, or scaling artifacts.

### Structure and Styling

- [x] Replace the current eyebrow, heading, and description with the exact reference copy.
- [x] Build the full-viewport login composition and match the measured brand/card placement.
- [x] Match the card size, surface opacity, border, radius, and shadow.
- [x] Match the people medallion, heading, two-line subtitle, and all vertical gaps.
- [x] Match the Microsoft CTA size, border, radius, shadow, mark, label, and alignment.
- [x] Match the trust divider and security row geometry, artwork, type, and colors.
- [x] Scope every new selector or component variant so the admin sign-in surface is not redesigned.
- [x] Remove or override obsolete login-only styles without changing unrelated global controls.

### Behavior, Responsive Layout, and Accessibility

- [x] Preserve Microsoft start routing and encoded `returnTo` behavior.
- [x] Preserve authenticated redirect, callback error mapping, client fallback, and alert semantics.
- [x] Add reference-consistent hover, focus-visible, active, and visited CTA states without layout
      shift or link underlining.
- [x] Mark decorative artwork correctly and expose one useful accessible brand name.
- [x] Implement narrow- and short-viewport reflow with no overlap or horizontal scrollbar.
- [ ] Verify 200% zoom, keyboard use, contrast, reduced motion, and forced colors.

### Tests and Release Verification

- [x] Add focused login structure, copy, href, `returnTo`, error, and accessibility tests.
- [ ] Add the deterministic 1536-by-1024 full-page visual-regression test.
- [x] Generate and review both a pixel diff and semi-transparent overlay against the reference.
- [x] Confirm all major geometry is within 2px and internal spacing/baselines are within 3px.
- [ ] Confirm there are no intentional visual differences and remaining diff is antialiasing only.
- [x] Manually verify desktop, narrow viewport, error, and admin reuse states.
- [ ] Manually verify short viewport, interaction, and mobile states across the browser matrix.
- [x] Verify `npm run format:check`.
- [x] Verify `npm run lint`.
- [x] Verify `npm test`.
- [x] Verify `npm run build`.

## Acceptance Criteria

- At the baseline viewport, the full rendered page is visually indistinguishable from the supplied
  reference; all remaining visual-diff pixels are attributable only to rasterization or text
  antialiasing.
- The background artwork, brand lockup, card, icons, copy, text wrapping, geometry, colors, borders,
  radii, and shadows match the reference with the defined positional tolerances.
- The default page contains exactly the reference content and no eyebrow, extra controls, footer,
  debugging overlay, loading shift, or unintended scrollbar.
- The CTA remains a keyboard-accessible link to the existing Microsoft start route, including
  encoded `returnTo` support, and the admin reuse is unchanged.
- Authentication redirects and the failure alert continue to work without changing the no-error
  baseline.
- Narrow and short viewports remain readable, operable, and free of overlap or horizontal overflow.
- Focus, semantics, contrast, zoom, reduced-motion, and forced-colors checks pass.
- Formatting, lint, tests, production build, automated screenshot comparison, and manual overlay
  review all pass.
