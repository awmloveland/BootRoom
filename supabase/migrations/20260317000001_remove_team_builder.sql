-- Remove team_builder feature from all existing leagues
DELETE FROM league_features WHERE feature = 'team_builder';
