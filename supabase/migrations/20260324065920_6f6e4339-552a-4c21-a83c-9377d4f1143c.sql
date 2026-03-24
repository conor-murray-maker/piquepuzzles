SELECT cron.schedule(
  'schedule-daily-challenge',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url:='https://habzaxkukdlllwlavpdc.supabase.co/functions/v1/schedule-daily-challenge',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhYnpheGt1a2RsbGx3bGF2cGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjg0NDcsImV4cCI6MjA4OTUwNDQ0N30.uFXCok5Q08jZZRwT84uxHez7FHX0wFpDhrhy1vr8bSY"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);