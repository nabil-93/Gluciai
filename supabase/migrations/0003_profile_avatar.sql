-- Add an avatar image URL to user profiles (stored in the profile-images bucket).
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the user avatar in the profile-images storage bucket.';
