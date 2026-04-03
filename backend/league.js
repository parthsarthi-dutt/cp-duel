const express = require('express');
const db = require('./db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');
const router = express.Router();

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({error: "No token"});
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch(e) {
        res.status(401).json({error: "Invalid token"});
    }
};

router.use(authMiddleware);

module.exports = (io) => {
    // Create league with settings
    router.post('/create', async (req, res) => {
        const { name, timeLimit, ratingMin, ratingMax } = req.body;
        try {
            const lRes = await db.query(
                `INSERT INTO leagues (creator_id, name, status, time_limit, rating_min, rating_max) 
                VALUES ($1, $2, 'WAITING', $3, $4, $5) RETURNING id`,
                [req.user.id, name, timeLimit || 45, ratingMin || 800, ratingMax || 1500]
            );
            const leagueId = lRes.rows[0].id;
            await db.query("INSERT INTO league_players (league_id, user_id) VALUES ($1, $2)", [leagueId, req.user.id]);
            res.json({ leagueId });
        } catch(e) { res.status(500).json({error: e.message}); }
    });

    // Join league — always open
    router.post('/join', async (req, res) => {
        const { leagueId } = req.body;
        try {
            const lRes = await db.query("SELECT * FROM leagues WHERE id = $1", [leagueId]);
            if (!lRes.rows.length) return res.status(404).json({error: "League not found"});
            const league = lRes.rows[0];
            if (league.status === 'COMPLETED') return res.status(400).json({error: "League has already ended"});

            await db.query("INSERT INTO league_players (league_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [leagueId, req.user.id]);
            
            // If league is already active, generate new matches for this player against all existing players
            if (league.status === 'ACTIVE') {
                const existing = await db.query("SELECT user_id FROM league_players WHERE league_id = $1 AND user_id != $2", [leagueId, req.user.id]);
                for (const row of existing.rows) {
                    const existingMatch = await db.query(`
                        SELECT m.id FROM matches m
                        JOIN match_players mp1 ON m.id = mp1.match_id AND mp1.user_id = $1
                        JOIN match_players mp2 ON m.id = mp2.match_id AND mp2.user_id = $2
                        WHERE m.league_id = $3
                    `, [req.user.id, row.user_id, leagueId]);
                    
                    if (existingMatch.rows.length === 0) {
                        const match = await db.query(`
                            INSERT INTO matches (type, league_id, status, time_limit, rating_min, rating_max)
                            VALUES ('LEAGUE', $1, 'WAITING', $2, $3, $4) RETURNING id
                        `, [leagueId, league.time_limit, league.rating_min, league.rating_max]);
                        const matchId = match.rows[0].id;
                        await db.query("INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)", [matchId, req.user.id]);
                        await db.query("INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)", [matchId, row.user_id]);
                    }
                }
            }

            // Emit update to all users in the league
            io.to(`league_${leagueId}`).emit('leagueUpdated');

            res.json({ success: true });
        } catch(e) { res.status(500).json({error: e.message}); }
    });

    // My leagues
    router.get('/my', async (req, res) => {
        try {
            const leagues = await db.query(`
                SELECT l.*, 
                (SELECT COUNT(*) FROM league_players WHERE league_id = l.id) as player_count
                 FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND lp.hidden = FALSE
                ORDER BY created_at DESC
            `, [req.user.id]);
            res.json(leagues.rows);
        } catch(e) { res.status(500).json({error: e.message}); }
    });

    // Get league detail
    router.get('/:id', async (req, res) => {
        try {
            const lRes = await db.query("SELECT * FROM leagues WHERE id = $1", [req.params.id]);
            if(!lRes.rows.length) return res.status(404).json({error: "Not found"});
            const league = lRes.rows[0];

            const pRes = await db.query(`
                SELECT u.cf_handle, u.id as user_id, lp.points, lp.wins, lp.losses, lp.draws, 
                    lp.problems_solved, lp.forfeits, lp.matches_played
                FROM league_players lp 
                JOIN users u ON lp.user_id = u.id 
                WHERE lp.league_id = $1 
                ORDER BY lp.points DESC, lp.wins DESC, lp.problems_solved DESC
            `, [league.id]);
            
            const mRes = await db.query(`
                SELECT m.id, m.status, m.winner_id,
                (SELECT json_agg(json_build_object('user_id', mp2.user_id, 'score', mp2.score, 'cf_handle', u2.cf_handle, 'forfeited', mp2.forfeited)) 
                FROM match_players mp2 JOIN users u2 ON mp2.user_id = u2.id WHERE mp2.match_id = m.id) as players
                FROM matches m 
                WHERE m.league_id = $1
                ORDER BY m.created_at ASC
            `, [league.id]);

            res.json({ ...league, players: pRes.rows, matches: mRes.rows });
        } catch(e) { res.status(500).json({error: e.message}); }
    });

    // Start league
    router.post('/:id/start', async (req, res) => {
        const { id } = req.params;
        try {
            const league = await db.query("SELECT * FROM leagues WHERE id = $1", [id]);
            if (!league.rows.length) return res.status(404).json({error: "Not found"});
            const l = league.rows[0];

            const players = await db.query("SELECT user_id FROM league_players WHERE league_id = $1", [id]);
            const ids = players.rows.map(r => r.user_id);
            
            if (ids.length < 2) return res.status(400).json({error: "Need at least 2 players"});

            for(let i=0; i<ids.length; i++){
                for(let j=i+1; j<ids.length; j++){
                    const match = await db.query(`
                        INSERT INTO matches (type, league_id, status, time_limit, rating_min, rating_max)
                        VALUES ('LEAGUE', $1, 'WAITING', $2, $3, $4) RETURNING id
                    `, [id, l.time_limit, l.rating_min, l.rating_max]);
                    const matchId = match.rows[0].id;
                    await db.query("INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)", [matchId, ids[i]]);
                    await db.query("INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)", [matchId, ids[j]]);
                }
            }
            await db.query("UPDATE leagues SET status = 'ACTIVE' WHERE id = $1", [id]);

            // Emit update to all users in the league
            io.to(`league_${id}`).emit('leagueUpdated');

            res.json({success: true});
        } catch(e) { res.status(500).json({error: e.message}); }
    });

    // End league
    router.post('/:id/end', async (req, res) => {
        const { id } = req.params;
        try {
            await db.query("UPDATE leagues SET status = 'COMPLETED' WHERE id = $1", [id]);

            // Emit update to all users in the league
            io.to(`league_${id}`).emit('leagueUpdated');

            res.json({success: true});
        } catch(e) { res.status(500).json({error: e.message}); }
    });

    // Hide league from personal list
    router.post('/:id/hide', async (req, res) => {
        const { id } = req.params;
        try {
            await db.query("UPDATE league_players SET hidden = TRUE WHERE league_id = $1 AND user_id = $2", [id, req.user.id]);
            res.json({ success: true });
        } catch(e) { res.status(500).json({ error: e.message }); }
    });

    return router;
};
