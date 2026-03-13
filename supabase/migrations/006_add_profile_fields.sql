-- SnapSpace Marketplace — Add missing profile fields
-- Run this in your Supabase SQL Editor (Database → SQL Editor → New query)
-- This migration adds username, bio, and push_token columns that the app
-- reads/writes but were absent from the original 001_account_system.sql schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. USERNAME — display handle, unique, settable by the user
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;

-- 2. BIO — short user bio displayed on ProfileScreen and UserProfileScreen
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- 3. PUSH_TOKEN — Expo push token saved by notifications.js on sign-in
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 4. Update the updated_at trigger to fire on changes to new columns
--    (the trigger from 001_account_system.sql already covers all columns
--    on UPDATE, so no additional trigger changes are needed)

-- 5. RLS — existing "Users can update their own profile" policy covers these
--    new columns automatically since it grants UPDATE on the whole row.

COMMENT ON COLUMN public.profiles.username IS 'Unique display handle chosen by the user (e.g. @alex.designs)';
COMMENT ON COLUMN public.profiles.bio      IS 'Short bio shown on the user''s profile and on public UserProfileScreen';
COMMENT ON COLUMN public.profiles.push_token IS 'Expo push notification token, saved on sign-in via notifications.js';
