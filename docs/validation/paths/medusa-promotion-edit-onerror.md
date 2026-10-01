# Path 3 — Medusa: promotion edit form silently swallows server errors

| | |
| --- | --- |
| Repository | [medusajs/medusa](https://github.com/medusajs/medusa) (TypeScript, commerce platform monorepo) |
| Pinned commit | `a9c14c09727d47440b2e6c9edda84b60f165a4d2` |
| Task | Issue [#17069](https://github.com/medusajs/medusa/issues/17069) — *Promotion edit form silently swallows server errors (no toast, drawer stays open)* |
| Task status at authoring | Open, unassigned, labeled `good first issue`, filed/updated 2026-09-30. No cross-referenced PRs at all. |
| Local scan | `codemaps/medusa-codemap.json` — 24,200 files, frameworks: express, react, vite |
| Time budget | ~12 min for 7 steps + exercise |

⚠️ **Structural note:** the issue text says "line 95 on `develop`" — at the pinned commit the file sits at the path below and `onSuccess` is still exactly line 95. Verified.

## Steps

### 1. Get oriented: 24k files, one route map (2 min)

Every admin screen is registered in [`packages/admin/dashboard/src/dashboard-app/routes/get-route.map.tsx#L502-L558`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/dashboard-app/routes/get-route.map.tsx#L502-L558) — find `/promotions` → `promotion-edit-details` there. This map is the fastest way to locate any screen in the dashboard.

### 2. Find the screen's directory (1 min)

- [`packages/admin/dashboard/src/routes/promotions/promotion-edit-details/`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/routes/promotions/promotion-edit-details) — nested `components/edit-promotion-form/` holds the form.

### 3. The bug site (3 min)

- [`edit-promotion-details-form.tsx#L71`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/routes/promotions/promotion-edit-details/components/edit-promotion-form/edit-promotion-details-form.tsx#L71) — `const { mutateAsync, isPending } = useUpdatePromotion(promotion.id)`.
- [`#L73-L101`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/routes/promotions/promotion-edit-details/components/edit-promotion-form/edit-promotion-details-form.tsx#L73-L101) — `handleSubmit` awaits `mutateAsync(payload, { onSuccess })` at [`L95`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/routes/promotions/promotion-edit-details/components/edit-promotion-form/edit-promotion-details-form.tsx#L95).

There is no `onError`, no `try/catch`, and `toast` is not imported. On a 4xx, the awaited promise rejects into… nothing. The drawer stays open; the rejection surfaces only in the browser console.

### 4. The house pattern for fixing it (2 min)

This codebase already answers "how should a form report mutation errors?" — the product edit form is the canonical example:

- [`routes/products/product-edit/components/edit-product-form/edit-product-form.tsx#L77-L80`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/routes/products/product-edit/components/edit-product-form/edit-product-form.tsx#L77-L80) — `onError: (e) => { toast.error(e.message) }`, with `toast` imported from `@medusajs/ui` at [`L1`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/routes/products/product-edit/components/edit-product-form/edit-product-form.tsx#L1).

Matching the house pattern is the whole fix.

### 5. What `useUpdatePromotion` actually is (1 min)

- [`packages/admin/dashboard/src/hooks/api/promotions.tsx#L206-L215`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/hooks/api/promotions.tsx#L206-L215) — a TanStack Query `useMutation` over `sdk.admin.promotion.update(id, payload)`. The rejection you must handle is the `FetchError` from that SDK call.

### 6. Notice the double `parseFloat` (30 sec, context)

At [`L74`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/routes/promotions/promotion-edit-details/components/edit-promotion-form/edit-promotion-details-form.tsx#L74) and again inside the payload — pre-validated client-side, but a taste of why server-side validation still failing (e.g. a code that already exists) is the realistic trigger for this bug.

### 7. i18n, if you want a polished message (1 min)

The form already uses `t("promotions.form.value.invalid")` ([`L82`](https://github.com/medusajs/medusa/blob/a9c14c09727d47440b2e6c9edda84b60f165a4d2/packages/admin/dashboard/src/routes/promotions/promotion-edit-details/components/edit-promotion-form/edit-promotion-details-form.tsx#L82)); translation files live under `packages/admin/dashboard/src/i18n/`. `toast.error(e.message)` needs none of that — start simple.

## Exercise (the micro-task)

1. **Predict first** (facilitator notes it verbatim): *what does the user see when `POST /admin/promotions/:id` returns 422 — and where does the error actually appear?*
2. Import `toast` from `@medusajs/ui` and add the `onError` handler to the `mutateAsync` options at L95, mirroring the product form.

## Deterministic success check

```bash
# from repo root (facilitator has already run: yarn install)
yarn workspace @medusajs/dashboard typecheck
```

- Before the edit: passes (baseline).
- After a correct edit: still exits 0, and `grep -c "onError" <form file>` returns 1.
- After a sloppy edit (wrong import path, typo): typecheck fails — the check catches it deterministically.

Optional browser confirmation (only if a stack is already running — not required for the session check): trigger the promotion edit with a duplicate code and observe the toast.

## Going further (optional, post-session)

The exact diff is a complete PR for #17069. Before opening it, skim the last few merged PRs to `routes/promotions/` for reviewer expectations (changesets, screenshots).

## What this path deliberately does not cover

The promotion domain model, the `sdk` client internals, and the RouteDrawer component. The task needs none of them.
