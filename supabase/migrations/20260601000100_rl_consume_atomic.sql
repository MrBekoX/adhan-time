-- Atomic rate-limit consume for register-device.
--
-- Why: the edge function previously did read → (JS) decide → increment as three
-- separate round-trips. Two concurrent requests could both read the same count
-- and both pass, letting a burst exceed the limit (TOCTOU). This function folds
-- the window-reset + increment + decision into a single statement; the
-- INSERT ... ON CONFLICT DO UPDATE takes a row lock, so concurrent calls for the
-- same ip_hash are serialized and the counter is exact.
--
-- Semantics match the previous JS logic: the first `p_max` requests in a window
-- are allowed; request p_max + 1 is denied. Returns true when allowed.

create or replace function public.rl_consume(
  p_ip_hash text,
  p_window_ms integer,
  p_max integer
) returns boolean
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_count integer;
begin
  insert into public.rl_buckets (ip_hash, request_count, window_start)
  values (p_ip_hash, 1, v_now)
  on conflict (ip_hash) do update
    set
      request_count = case
        when public.rl_buckets.window_start < v_now - v_window then 1
        else public.rl_buckets.request_count + 1
      end,
      window_start = case
        when public.rl_buckets.window_start < v_now - v_window then v_now
        else public.rl_buckets.window_start
      end
  returning request_count into v_count;

  return v_count <= p_max;
end;
$$;

-- Only the edge runtime (service_role) may consume the limiter. anon must never
-- reach it directly; the function is SECURITY INVOKER so even if it did, the
-- RLS-protected rl_buckets write would fail.
revoke execute on function public.rl_consume(text, integer, integer) from public;
grant execute on function public.rl_consume(text, integer, integer) to service_role;
