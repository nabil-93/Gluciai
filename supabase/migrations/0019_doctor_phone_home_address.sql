-- SOS screen upgrade: callable treating doctor + home-address card.
-- doctor_phone  → "call my doctor" button on the emergency screen
-- home_address  → tappable card that opens Google Maps on the patient's
--                 home so a bystander can bring them back safely.
-- (Already applied to the remote project as add_doctor_phone_home_address.)
alter table public.profiles
  add column if not exists doctor_phone text,
  add column if not exists home_address text;
