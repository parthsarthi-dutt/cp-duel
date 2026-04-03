CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    cf_handle VARCHAR(255) UNIQUE,
    cf_verified BOOLEAN DEFAULT FALSE,
    matches_won INT DEFAULT 0,
    matches_lost INT DEFAULT 0,
    matches_drawn INT DEFAULT 0,
    problems_solved INT DEFAULT 0,
    forfeits INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE verification_tokens (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_string VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id)
);

CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL Check (type in ('CASUAL', 'LEAGUE')),
    league_id UUID,
    status VARCHAR(50) NOT NULL Check (status in ('WAITING', 'COUNTDOWN', 'ACTIVE', 'FINISHED', 'INVALIDATED')),
    anti_cheat_enabled BOOLEAN DEFAULT FALSE,
    winner_id UUID REFERENCES users(id),
    time_limit INT,
    rating_min INT,
    rating_max INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP
);

CREATE TABLE match_players (
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    score INT DEFAULT 0,
    problems_solved INT DEFAULT 0,
    is_ready BOOLEAN DEFAULT FALSE,
    invalid_vote BOOLEAN DEFAULT FALSE,
    forfeited BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (match_id, user_id)
);

CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL Check (status in ('WAITING', 'ACTIVE', 'COMPLETED')),
    time_limit INT DEFAULT 45,
    rating_min INT DEFAULT 800,
    rating_max INT DEFAULT 1500,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE league_players (
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    points INT DEFAULT 0,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    problems_solved INT DEFAULT 0,
    forfeits INT DEFAULT 0,
    matches_played INT DEFAULT 0,
    PRIMARY KEY (league_id, user_id)
);
