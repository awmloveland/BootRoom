-- Games: each game (league/season) has its own data
CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Game members: who can view/manage a game (admins)
CREATE TABLE game_members (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('creator', 'admin')),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);

-- Game invites: pending invites to become admin (token for link)
CREATE TABLE game_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(game_id, email)
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_invites ENABLE ROW LEVEL SECURITY;

-- RLS: game members can read their games
CREATE POLICY "Members read games" ON games
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM game_members WHERE game_members.game_id = games.id AND game_members.user_id = auth.uid()));

-- RLS: creators can insert games
CREATE POLICY "Authenticated create games" ON games
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- RLS: members can read game_members
CREATE POLICY "Members read game_members" ON game_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM game_members gm WHERE gm.game_id = game_members.game_id AND gm.user_id = auth.uid()));

-- RLS: creators/admins can insert game_members (for invites)
CREATE POLICY "Admins add members" ON game_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM game_members gm WHERE gm.game_id = game_id AND gm.user_id = auth.uid())
  );

-- RLS: game_invites - members can read invites for their games
CREATE POLICY "Members read game_invites" ON game_invites
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM game_members WHERE game_members.game_id = game_invites.game_id AND game_members.user_id = auth.uid()));

-- RLS: members can create invites for their games
CREATE POLICY "Members create invites" ON game_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (SELECT 1 FROM game_members WHERE game_members.game_id = game_id AND game_members.user_id = auth.uid())
  );

-- RLS: accept_game_invite RPC (SECURITY DEFINER) reads invites server-side

CREATE INDEX idx_game_members_user ON game_members(user_id);
CREATE INDEX idx_game_invites_token ON game_invites(token);
CREATE INDEX idx_game_invites_game ON game_invites(game_id);
