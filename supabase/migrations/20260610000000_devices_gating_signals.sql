-- Server push reliability (Yol A): per-device gating signals.
--
-- Reported by NEWER clients (null on existing rows and on older builds that don't
-- send them). A non-exempt Android device has an unreliable killed-app local alarm
-- (OEM Doze defers exact alarms), so push-prayer gives it a shorter (3h) safety-net
-- staleness gate; iOS / battery-exempt / not-yet-reported devices keep the
-- conservative 5-day gate. See _shared/device-gating.ts. The gating only triggers
-- on an EXPLICIT platform='android' AND battery_exempt=false, so null defaults
-- preserve current behavior (no double notifications pre-rollout).
alter table public.devices
  add column if not exists platform text
    check (platform is null or platform in ('android', 'ios'));
alter table public.devices
  add column if not exists battery_exempt boolean;

-- NOTE: token-table cleanup is intentionally NOT done by tightening the
-- cleanup-stale-data retention (kept at 180d — shortening it would silently cut
-- the server safety-net horizon for dormant-but-active users, the very rules/00 S3
-- "7+ gün açılmama" guarantee this work strengthens). Dead tokens from uninstalled
-- apps are removed organically: the 3h backstop pushes to non-exempt devices, Expo
-- returns DeviceNotRegistered, and the existing handler (push-prayer + push-receipts)
-- deletes them. A dedicated proactive sweep stays a future option if that proves slow.
