-- ============================================================
-- Player attributes: manually-set per-player fields that cannot
-- be derived from match results (goalkeeper, mentality, rating).
-- Scoped per game so each league can have its own player roster.
-- ============================================================

CREATE TABLE IF NOT EXISTS player_attributes (
  game_id   uuid  NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name      text  NOT NULL,
  goalkeeper boolean NOT NULL DEFAULT false,
  mentality text  NOT NULL DEFAULT 'balanced'
    CHECK (mentality IN ('balanced', 'attacking', 'defensive', 'goalkeeper')),
  rating    int   NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, name)
);

ALTER TABLE player_attributes ENABLE ROW LEVEL SECURITY;

-- Members can read; admins can write
CREATE POLICY "Members read player_attributes" ON player_attributes
  FOR SELECT TO authenticated
  USING (is_game_member(game_id));

CREATE POLICY "Admins manage player_attributes" ON player_attributes
  FOR ALL TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (is_game_admin(game_id));


-- ============================================================
-- Update get_player_stats to join player_attributes
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_player_stats(p_game_id uuid)
RETURNS TABLE (
  name        text,
  played      bigint,
  won         bigint,
  drew        bigint,
  lost        bigint,
  "timesTeamA" bigint,
  "timesTeamB" bigint,
  "winRate"   numeric,
  qualified   boolean,
  points      bigint,
  goalkeeper  boolean,
  mentality   text,
  rating      int,
  "recentForm" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this game';
  END IF;

  RETURN QUERY
  WITH player_games AS (
    SELECT
      w.week,
      w.winner,
      p.name,
      p.team
    FROM weeks w
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(w.team_a) AS name, 'A' AS team
      UNION ALL
      SELECT jsonb_array_elements_text(w.team_b) AS name, 'B' AS team
    ) p
    WHERE w.game_id = p_game_id AND w.status = 'played'
  ),
  player_aggregates AS (
    SELECT
      pg.name,
      COUNT(*)::bigint AS played,
      COUNT(*) FILTER (
        WHERE (pg.team = 'A' AND pg.winner = 'teamA')
           OR (pg.team = 'B' AND pg.winner = 'teamB')
      )::bigint AS won,
      COUNT(*) FILTER (WHERE pg.winner = 'draw')::bigint AS drew,
      COUNT(*) FILTER (
        WHERE (pg.team = 'A' AND pg.winner = 'teamB')
           OR (pg.team = 'B' AND pg.winner = 'teamA')
      )::bigint AS lost,
      COUNT(*) FILTER (WHERE pg.team = 'A')::bigint AS times_team_a,
      COUNT(*) FILTER (WHERE pg.team = 'B')::bigint AS times_team_b
    FROM player_games pg
    GROUP BY pg.name
  ),
  config_vals AS (
    SELECT
      COALESCE((c.value->'minGamesForQualifiedWinRate')::int, 5) AS min_games,
      COALESCE((c.value->'pointsSystem'->>'win')::int, 3)        AS win_pts,
      COALESCE((c.value->'pointsSystem'->>'draw')::int, 1)       AS draw_pts,
      COALESCE((c.value->'pointsSystem'->>'loss')::int, 0)       AS loss_pts
    FROM config c
    WHERE c.game_id = p_game_id AND c.key = 'config'
    LIMIT 1
  ),
  ranked AS (
    SELECT pg.name, pg.team, pg.winner, pg.week,
      ROW_NUMBER() OVER (PARTITION BY pg.name ORDER BY pg.week DESC) AS rn
    FROM player_games pg
  ),
  recent_form AS (
    SELECT rf.name,
      string_agg(
        CASE
          WHEN (rf.team = 'A' AND rf.winner = 'teamA')
            OR (rf.team = 'B' AND rf.winner = 'teamB') THEN 'W'
          WHEN rf.winner = 'draw' THEN 'D'
          ELSE 'L'
        END,
        '' ORDER BY rf.week DESC
      ) AS form
    FROM ranked rf
    WHERE rf.rn <= 5
    GROUP BY rf.name
  )
  SELECT
    pa.name,
    pa.played,
    pa.won,
    pa.drew,
    pa.lost,
    pa.times_team_a,
    pa.times_team_b,
    CASE WHEN pa.played > 0
      THEN ROUND((pa.won::numeric / pa.played) * 100, 1)
      ELSE 0
    END,
    (pa.played >= COALESCE((SELECT min_games FROM config_vals LIMIT 1), 5)),
    (pa.won  * COALESCE((SELECT win_pts  FROM config_vals LIMIT 1), 3) +
     pa.drew * COALESCE((SELECT draw_pts FROM config_vals LIMIT 1), 1) +
     pa.lost * COALESCE((SELECT loss_pts FROM config_vals LIMIT 1), 0))::bigint,
    COALESCE(attr.goalkeeper, false),
    COALESCE(attr.mentality,  'balanced'),
    COALESCE(attr.rating,     0),
    COALESCE(rf.form, '')
  FROM player_aggregates pa
  LEFT JOIN player_attributes attr
    ON attr.game_id = p_game_id AND attr.name = pa.name
  LEFT JOIN recent_form rf ON rf.name = pa.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_stats(uuid) TO authenticated;
