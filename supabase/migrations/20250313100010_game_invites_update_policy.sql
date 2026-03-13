-- Allow members to update invites (needed for upsert when refreshing open invite links)
CREATE POLICY "Members update invites" ON game_invites
  FOR UPDATE TO authenticated
  USING (is_game_member(game_id))
  WITH CHECK (is_game_member(game_id));
