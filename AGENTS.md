<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Transport Register rules
- All data access goes through createServerFn handlers guarded by `requireDevice` (src/lib/access.functions.ts) using the service-role client; tables have RLS on with no policies so browsers can never query them directly.
- Device auth: access code (secret APP_ACCESS_CODE) exchanged once for a random token in an httpOnly SameSite=None cookie; only its SHA-256 hash is stored in `devices`. Revoking sets `revoked_at`.
- Bill/serial numbering happens only inside the `create_entry` / `update_entry` SQL functions (row lock on app_settings) — never compute numbers in app code.
- Local-first: every screen reads `src/lib/local-store.ts` (IndexedDB copy); writes are queued as pending and pushed by `sync()` (online/visibility/30s), then `pullChanges` fetches rows by updated_at. Offline entries use their local UUID as the server id so retries are idempotent. Server rejects duplicate bills; the entry is flagged `_error` for the user to fix.
- Offline app shell: vite-plugin-pwa generateSW into dist/client, registered only via `src/lib/sw-register.ts` (never in dev/preview/iframe). Excel export is built client-side with exceljs from local data.
