-- Add image field for news cards (manual image or source-derived og:image)
-- Run once in Supabase SQL Editor

alter table public.news add column if not exists image_url text;
