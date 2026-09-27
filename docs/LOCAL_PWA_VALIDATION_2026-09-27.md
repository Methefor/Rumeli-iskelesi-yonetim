# Local PWA and mobile validation - 2026-09-27

## Result

The V4 PWA foundation is prepared and validated locally. It is not deployed.
Real-device installation/update validation is still required before cutover.

## Implemented

- Rumeli lighthouse icons: 192px, 512px, maskable and Apple touch variants.
- Install manifest with root scope and standalone display.
- Build-generated Workbox service worker through `vite-plugin-pwa`.
- Visible offline notice; no claim that business data works offline.
- New-version notice with an explicit `Şimdi güncelle` action.
- Hourly update check while the application remains open.

## Cache boundary

The generated worker precaches only the versioned frontend bundle, navigation
shell, registration script and icons. There is no runtime cache rule for
Supabase database, Auth, Storage or Edge Function traffic. Sales and inventory
writes are never queued offline. A failed network write must continue through
the existing application error path.

## Validation evidence

- Typecheck: pass.
- Lint: pass.
- Application tests: 248/248 pass across 30 files, including two new PWA tests.
- Production build: pass; `registerSW.js`, `sw.js` and Workbox output generated.
- Generated precache: eight static shell/icon entries; no Supabase/API URL.
- Local HTTP: manifest, register script, worker and three icon endpoints all 200
  with the expected content type.
- Browser: 360x800 demo-mode cashier login and employee home pass; fixed bottom
  navigation, no horizontal overflow, no error overlay and no console errors.
- Performance follow-up: the main bundle is about 690 KB minified / 198 KB gzip.
  Route-based lazy loading and throttled-cellular measurement are recorded for
  completion before the mobile pilot.

## Distribution decision

Vercel remains suitable. Commit-specific Preview URLs are for review only.
Staff should install one stable production alias or custom domain so the home
screen icon always opens the supported release. iPhone installation uses Safari
`Add to Home Screen` with `Open as Web App`; Android uses the browser's install
or add-to-home-screen action.

## Open gate

Run a short real-device matrix before pilot:

1. Current iPhone/Safari: install, first login, relaunch, session restoration,
   update prompt, safe-area layout and logout.
2. Current Android/Chrome: install, same flow, back-button behavior and update.
3. At least one field phone on cellular data and one on branch Wi-Fi.
4. Confirm that loss of connectivity never reports a successful business write.
5. On a phone that has the legacy PWA installed, verify the same-origin service
   worker replacement and decide whether staff must remove the old shortcut.

## Scope guard

No commit or push was made. Vercel, hosted Supabase, production, `main` and old
stashes were untouched.
