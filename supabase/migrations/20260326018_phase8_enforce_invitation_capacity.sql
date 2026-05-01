-- Phase 8 intentionally does not enforce capacity on public.invitations yet.
-- Current seat enforcement is authoritative only on public.users.
-- Applying invitation-level enforcement now would be inconsistent because
-- pending invitations are not included in the existing capacity helpers.
-- A future coherent implementation must account for shared seat usage across:
-- - billable users
-- - pending invitations
-- - invitation acceptance flow
-- - unified capacity checks for both users and invitations

DO $$
BEGIN
  NULL;
END $$;
