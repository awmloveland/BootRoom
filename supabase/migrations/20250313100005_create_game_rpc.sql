-- RPC: create a new game and add creator as member
CREATE OR REPLACE FUNCTION public.create_game(game_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_uuid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(game_name) = '' THEN
    RAISE EXCEPTION 'Game name is required';
  END IF;

  INSERT INTO games (name, created_by)
  VALUES (trim(game_name), auth.uid())
  RETURNING id INTO game_uuid;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (game_uuid, auth.uid(), 'creator');

  RETURN game_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text) TO authenticated;
