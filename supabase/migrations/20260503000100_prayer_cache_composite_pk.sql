-- V13: support multiple years per district.
-- Pre-V13 schema keyed prayer_cache solely by district_id, which conflated
-- year-rollover entries. The composite key lets ensurePrayerCache() store
-- 2026 and 2027 data side-by-side for the same district during the
-- December → January rolling-window crossover.

alter table public.prayer_cache drop constraint if exists prayer_cache_pkey;
alter table public.prayer_cache add primary key (district_id, year);
