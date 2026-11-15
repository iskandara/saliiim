# Supabase setup

1. Turn on **Anonymous sign-ins** (Authentication → Sign In / Providers).
2. Enable the **pg_cron** extension (Database → Extensions).
3. Run the files in `migrations/` in order in the SQL Editor (`0001_init.sql`, `0002_record_result.sql`, `0003_metrics.sql`), or `supabase db push` with the CLI. Already set up? Run only the files you haven't run yet.

If pg_cron was not enabled before the migration ran, enable it and run:

```sql
select cron.schedule('saliiim-auto-close', '*/10 * * * *', 'select public.auto_close_sessions()');
```
