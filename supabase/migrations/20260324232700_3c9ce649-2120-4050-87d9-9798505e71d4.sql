CREATE OR REPLACE FUNCTION public.get_cron_jobs()
RETURNS TABLE(jobname text, schedule text, active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, cron, public
AS $$
  SELECT jobname::text, schedule::text, active
  FROM cron.job;
$$;