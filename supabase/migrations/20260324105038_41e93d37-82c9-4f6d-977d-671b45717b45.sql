-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Daily challenge scheduling — 23:00 UTC daily
SELECT cron.schedule(
  'schedule-daily-challenge',
  '0 23 * * *',
  $$SELECT extensions.http_post(
    url := 'https://habzaxkukdlllwlavpdc.supabase.co/functions/v1/schedule-daily-challenge',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhYnpheGt1a2RsbGx3bGF2cGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjg0NDcsImV4cCI6MjA4OTUwNDQ0N30.uFXCok5Q08jZZRwT84uxHez7FHX0wFpDhrhy1vr8bSY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);

-- Award streak freezes — Monday 00:01 UTC
SELECT cron.schedule(
  'award-streak-freezes',
  '1 0 * * 1',
  $$SELECT extensions.http_post(
    url := 'https://habzaxkukdlllwlavpdc.supabase.co/functions/v1/award-streak-freezes',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhYnpheGt1a2RsbGx3bGF2cGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjg0NDcsImV4cCI6MjA4OTUwNDQ0N30.uFXCok5Q08jZZRwT84uxHez7FHX0wFpDhrhy1vr8bSY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);

-- Streak risk notifications — 20:00 UTC daily
SELECT cron.schedule(
  'streak-risk-notifications',
  '0 20 * * *',
  $$SELECT extensions.http_post(
    url := 'https://habzaxkukdlllwlavpdc.supabase.co/functions/v1/streak-risk-notifications',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhYnpheGt1a2RsbGx3bGF2cGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjg0NDcsImV4cCI6MjA4OTUwNDQ0N30.uFXCok5Q08jZZRwT84uxHez7FHX0wFpDhrhy1vr8bSY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);