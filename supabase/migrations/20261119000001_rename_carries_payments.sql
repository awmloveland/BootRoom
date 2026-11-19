-- supabase/migrations/20261119000001_rename_carries_payments.sql
--
-- admin_rename_player predates the money feature, so a renamed player's paid
-- marks (week_payments.payer) and their guests' host name
-- (lineup_metadata.guests[].associated_player) stayed under the old name. The
-- player then showed as owing for games they had paid for.
--
-- 1. The function now carries both. Signature, checks and grants are unchanged.
-- 2. A one-off repair moves paid marks stranded by earlier renames.

CREATE OR REPLACE FUNCTION public.admin_rename_player(
  p_game_id  uuid,
  p_old_name text,
  p_new_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin gate
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- No-op if names are identical
  IF p_old_name = p_new_name THEN
    RETURN;
  END IF;

  -- Conflict check: new name must not already exist in player_attributes or active claims
  IF EXISTS (
    SELECT 1 FROM player_attributes
    WHERE game_id = p_game_id AND name = p_new_name
  ) OR EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id
      AND (player_name = p_new_name OR admin_override_name = p_new_name)
      AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'name_already_exists';
  END IF;

  -- Update player_attributes
  UPDATE player_attributes
  SET name = p_new_name
  WHERE game_id = p_game_id AND name = p_old_name;

  -- Update player_claims.player_name
  UPDATE player_claims
  SET player_name = p_new_name
  WHERE game_id = p_game_id AND player_name = p_old_name;

  -- Update player_claims.admin_override_name
  UPDATE player_claims
  SET admin_override_name = p_new_name
  WHERE game_id = p_game_id AND admin_override_name = p_old_name;

  -- Update weeks.team_a and team_b JSONB arrays
  UPDATE weeks
  SET
    team_a = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_a) AS val
    ),
    team_b = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_b) AS val
    )
  WHERE game_id = p_game_id
    AND (team_a @> to_jsonb(p_old_name) OR team_b @> to_jsonb(p_old_name));

  -- Guests brought by this player: their fee is owed through the host's name
  UPDATE weeks
  SET lineup_metadata = jsonb_set(lineup_metadata, '{guests}', (
    SELECT jsonb_agg(
      CASE WHEN g->>'associated_player' = p_old_name
           THEN jsonb_set(g, '{associated_player}', to_jsonb(p_new_name))
           ELSE g END)
    FROM jsonb_array_elements(lineup_metadata->'guests') AS g
  ))
  WHERE game_id = p_game_id
    AND lineup_metadata->'guests' @> jsonb_build_array(jsonb_build_object('associated_player', p_old_name));

  -- Paid marks. A week that somehow already has a row under the new name keeps
  -- it, so the (week_id, payer) key can never make a rename fail.
  UPDATE week_payments p
  SET payer = p_new_name
  WHERE p.game_id = p_game_id AND p.payer = p_old_name
    AND NOT EXISTS (
      SELECT 1 FROM week_payments q WHERE q.week_id = p.week_id AND q.payer = p_new_name
    );

END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rename_player(uuid, text, text) TO authenticated;

-- One-off repair. A payment row is stranded when its payer is on neither team
-- that week. It is only moved when exactly one player was on every week the
-- stranded name has rows for: that is a rename. Anything less certain (a
-- player taken out of a line-up after paying, say) is left as it is.
WITH wk AS (
  SELECT id, coalesce(team_a, '[]'::jsonb) || coalesce(team_b, '[]'::jsonb) AS names FROM weeks
), orphan AS (
  SELECT p.game_id, p.week_id, p.payer, wk.names
  FROM week_payments p JOIN wk ON wk.id = p.week_id
  WHERE NOT wk.names ? p.payer
), tally AS (
  SELECT game_id, payer, count(*) AS n FROM orphan GROUP BY 1, 2
), cand AS (
  SELECT o.game_id, o.payer, n.name
  FROM orphan o, jsonb_array_elements_text(o.names) AS n(name)
  GROUP BY 1, 2, 3
  HAVING count(*) = (SELECT t.n FROM tally t WHERE t.game_id = o.game_id AND t.payer = o.payer)
), renamed AS (
  SELECT game_id, payer AS old_name, min(name) AS new_name
  FROM cand GROUP BY 1, 2 HAVING count(*) = 1
)
UPDATE week_payments p
SET payer = r.new_name
FROM renamed r
WHERE p.game_id = r.game_id AND p.payer = r.old_name
  AND NOT EXISTS (
    SELECT 1 FROM week_payments q WHERE q.week_id = p.week_id AND q.payer = r.new_name
  );
