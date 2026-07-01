# Dev-only seeds — NEVER run in production

These files create accounts with **known, hardcoded passwords** (including an
admin account). They exist only to populate a local/dev database with realistic
demo data. If applied to production they are known-credential backdoors.

## Files

| File | Creates | Password |
|------|---------|----------|
| `test_account_seed.sql` | One test teacher (`test.teacher`) | `ScheduTest2026!` |
| `placeholder.sql` | Six demo users across three schools (one admin) | `ScheduDemo2026!` |

## Guard

Each file aborts unless you explicitly opt in for the session:

```sql
set app.allow_dev_seed = 'yes';
\i seeds/dev-only/test_account_seed.sql
```

Without that setting the script raises an exception and rolls back. This is the
safety net that keeps the seed from ever running during a production migration.

## Order

Apply these **after** the full schema (00 → 12) on a dev database. They assume
the post-`10_billing_v2.sql` shape (e.g. `usage_quotas.period_day`).

## CI / production

- The migration apply script (`database-setup/apply.sh`) and CI never touch this
  directory.
- Before any real launch, rotate or remove these credentials and confirm no
  dev-seed accounts exist in the production project.
