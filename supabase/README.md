# Supabase setup

1. Turn on **Anonymous sign-ins** (Authentication → Sign In / Providers).
2. Enable the **pg_cron** extension (Database → Extensions).
3. Run `migrations/0001_init.sql` in the SQL Editor, or `supabase db push` with the CLI.

If pg_cron was not enabled before the migration ran, enable it and run:

```sql
select cron.schedule('saliiim-auto-close', '*/10 * * * *', 'select public.auto_close_sessions()');
```
