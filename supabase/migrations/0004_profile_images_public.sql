-- Avatars are served via getPublicUrl(), so the profile-images bucket must be
-- public for reads. Uploads remain protected by the storage RLS policy in
-- 0001 (a user may only write under their own uid/ folder).
update storage.buckets set public = true where id = 'profile-images';
