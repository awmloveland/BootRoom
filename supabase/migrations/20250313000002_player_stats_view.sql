-- Player stats view: computed from weeks
-- Includes recentForm via subquery
-- security_invoker: view runs with caller's permissions (respects RLS)

CREATE OR REPLACE VIEW player_stats WITH (security_invoker = true) AS
WITH player_games AS (
  SELECT
    w.id,
    w.week,
    w.date,
    w.winner,
    p.name,
    p.team
  FROM weeks w
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(w.team_a) AS name, 'A' AS team
    UNION ALL
    SELECT jsonb_array_elements_text(w.team_b) AS name, 'B' AS team
  ) p
  WHERE w.status = 'played'
),
player_aggregates AS (
  SELECT
    name,
    COUNT(*) AS played,
    COUNT(*) FILTER (WHERE (team = 'A' AND winner = 'teamA') OR (team = 'B' AND winner = 'teamB')) AS won,
    COUNT(*) FILTER (WHERE winner = 'draw') AS drew,
    COUNT(*) FILTER (WHERE (team = 'A' AND winner = 'teamB') OR (team = 'B' AND winner = 'teamA')) AS lost,
    COUNT(*) FILTER (WHERE team = 'A') AS times_team_a,
    COUNT(*) FILTER (WHERE team = 'B') AS times_team_b
  FROM player_games
  GROUP BY name
),
config_values AS (
  SELECT
    COALESCE((value->'minGamesForQualifiedWinRate')::int, 5) AS min_games,
    COALESCE((value->'pointsSystem'->>'win')::int, 3) AS win_pts,
    COALESCE((value->'pointsSystem'->>'draw')::int, 1) AS draw_pts,
    COALESCE((value->'pointsSystem'->>'loss')::int, 0) AS loss_pts
  FROM config
  WHERE key = 'config'
  LIMIT 1
),
ranked_games AS (
  SELECT
    name,
    team,
    winner,
    week,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY week DESC) AS rn
  FROM player_games
),
recent_form AS (
  SELECT
    name,
    string_agg(
      CASE
        WHEN (team = 'A' AND winner = 'teamA') OR (team = 'B' AND winner = 'teamB') THEN 'W'
        WHEN winner = 'draw' THEN 'D'
        ELSE 'L'
      END,
      ''
      ORDER BY week DESC
    ) AS form
  FROM ranked_games
  WHERE rn <= 5
  GROUP BY name
)
SELECT
  pa.name,
  pa.played,
  pa.won,
  pa.drew,
  pa.lost,
  pa.times_team_a AS "timesTeamA",
  pa.times_team_b AS "timesTeamB",
  CASE WHEN pa.played > 0 THEN ROUND((pa.won::numeric / pa.played) * 100, 1) ELSE 0 END AS "winRate",
  (pa.played >= COALESCE((SELECT min_games FROM config_values LIMIT 1), 5)) AS qualified,
  (pa.won * COALESCE((SELECT win_pts FROM config_values LIMIT 1), 3) +
   pa.drew * COALESCE((SELECT draw_pts FROM config_values LIMIT 1), 1) +
   pa.lost * COALESCE((SELECT loss_pts FROM config_values LIMIT 1), 0)) AS points,
  false AS goalkeeper,
  'balanced'::text AS mentality,
  0 AS rating,
  COALESCE(rf.form, '') AS "recentForm"
FROM player_aggregates pa
LEFT JOIN recent_form rf ON rf.name = pa.name;

-- RLS: authenticated users can read the view (inherits from underlying tables)
-- Views use the policies of the underlying tables; we need to grant access
GRANT SELECT ON player_stats TO authenticated;
