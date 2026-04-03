const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const db = require('./db');
const crypto = require('crypto');
const axios = require('axios');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_duel_key_99';

// =============================
// GOOGLE OAUTH
// =============================
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'dummy-client-id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy-secret',
    callbackURL: "/auth/google/callback"
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      const email = profile.emails[0].value;
      const res = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      
      let user;
      if (res.rows.length > 0) {
        user = res.rows[0];
      } else {
         const insertRes = await db.query(
            'INSERT INTO users (google_id, email) VALUES ($1, $2) RETURNING *',
            [profile.id, email]
         );
         user = insertRes.rows[0];
      }
      return cb(null, user);
    } catch (err) {
      return cb(err);
    }
  }
));

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  function(req, res) {
    const token = jwt.sign({ id: req.user.id, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`http://localhost:5173/dashboard?token=${token}`);
  }
);

// MOCK LOGIN FOR DEVELOPMENT TESTING WITHOUT GCP CREDENTIALS
router.post('/mock-login', async (req, res) => {
    const { email } = req.body;
    let result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;
    if (result.rows.length === 0) {
        const insertRes = await db.query('INSERT INTO users (google_id, email) VALUES ($1, $2) RETURNING *', [`mock-${Date.now()}`, email]);
        user = insertRes.rows[0];
    } else {
        user = result.rows[0];
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
});

// GET CURRENT USER
router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({error: "No token"});
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userRes = await db.query(`
            SELECT u.*, 
            (
                SELECT COUNT(*) FROM (
                    SELECT lp.league_id 
                    FROM league_players lp
                    JOIN leagues l ON lp.league_id = l.id
                    WHERE l.status = 'COMPLETED' AND lp.user_id = u.id AND lp.points > 0
                    AND lp.points = (SELECT MAX(points) FROM league_players WHERE league_id = lp.league_id)
                ) as won_leagues
            ) as trophies
            FROM users u WHERE u.id = $1
        `, [decoded.id]);
        if(userRes.rows.length === 0) throw new Error();
        res.json(userRes.rows[0]);
    } catch(e) {
        res.status(401).json({error: "Invalid token"});
    }
});

// =============================
// CF OWNERSHIP VERIFICATION
// =============================
router.post('/verify-cf-start', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({error: "No token"});
    const { handle } = req.body;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const uuidToken = 'CF-DUEL-' + crypto.randomBytes(3).toString('hex').toUpperCase();

        await db.query(`
            INSERT INTO verification_tokens (user_id, token_string, expires_at)
            VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
            ON CONFLICT (user_id) DO UPDATE SET token_string = EXCLUDED.token_string, expires_at = EXCLUDED.expires_at;
        `, [decoded.id, 'CE-VERIFY']);

        res.json({ token: 'CE-VERIFY', instruction: `Submit a Compile Error to Problem 4A (Watermelon)` });
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

router.post('/verify-cf-check', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { handle } = req.body;
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const tokenData = await db.query('SELECT * FROM verification_tokens WHERE user_id = $1 AND expires_at > NOW()', [decoded.id]);
        
        if (tokenData.rows.length === 0) return res.status(400).json({error: "Token expired or not found. Start verification again."});
        const expiresAt = new Date(tokenData.rows[0].expires_at).getTime() / 1000;
        const timeStarted = expiresAt - 600; // 10 minutes ago

        // Pull latest submissions
        const cfRes = await axios.get(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=5`);
        if(cfRes.data.status === 'OK') {
            const subs = cfRes.data.result;
            const validSub = subs.find(s => 
                s.problem.contestId === 4 && 
                s.problem.index === 'A' && 
                s.verdict === 'COMPILATION_ERROR' &&
                s.creationTimeSeconds >= timeStarted
            );

            if (validSub) {
                // Verified!
                await db.query('UPDATE users SET cf_handle = $1, cf_verified = true WHERE id = $2', [handle, decoded.id]);
                res.json({ success: true, message: "Codeforces account successfully verified!" });
            } else {
                res.status(400).json({ error: `Could not find a Compile Error on Problem 4A submitted recently.`});
            }
        }
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

router.get('/history', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({error: "No token"});
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const historyRes = await db.query(`
            SELECT m.id as match_id, m.status, m.winner_id, m.created_at, m.type, m.time_limit,
                   mp.score as my_score, mp.forfeited as my_forfeit, mp.problems_solved as my_problems,
                   opp_mp.score as opp_score, opp_u.cf_handle as opp_handle, opp_mp.forfeited as opp_forfeit, opp_mp.problems_solved as opp_problems
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            LEFT JOIN match_players opp_mp ON opp_mp.match_id = m.id AND opp_mp.user_id != $1
            LEFT JOIN users opp_u ON opp_mp.user_id = opp_u.id
            WHERE mp.user_id = $1 AND m.status != 'WAITING'
            ORDER BY m.created_at DESC
            LIMIT 20
        `, [decoded.id]);
        res.json(historyRes.rows);
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

// GET Match Details
router.get('/match/:id', async (req, res) => {
    try {
        const probs = await db.query(`
            SELECT mp.*, u.cf_handle as solved_by 
            FROM match_problems mp 
            JOIN users u ON mp.user_id = u.id 
            WHERE mp.match_id = $1 
            ORDER BY mp.solved_at ASC
        `, [req.params.id]);
        res.json(probs.rows);
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

// GET Public Profile
router.get('/user/:handle', async (req, res) => {
    try {
        const uRes = await db.query(`
            SELECT id, cf_handle, matches_won, matches_lost, matches_drawn, problems_solved,
            (SELECT COUNT(*) FROM (
                SELECT lp.league_id 
                FROM league_players lp
                JOIN leagues l ON lp.league_id = l.id
                WHERE l.status = 'COMPLETED' AND lp.user_id = users.id AND lp.points > 0
                AND lp.points = (SELECT MAX(points) FROM league_players WHERE league_id = lp.league_id)
            ) as won_leagues) as trophies
            FROM users 
            WHERE cf_handle = $1 AND cf_verified = true
        `, [req.params.handle]);
        
        if (uRes.rows.length === 0) return res.status(404).json({error: "User not found"});
        
        const historyRes = await db.query(`
            SELECT m.id as match_id, m.status, m.winner_id, m.created_at, m.type, m.time_limit,
                   mp.score as my_score, mp.forfeited as my_forfeit, mp.problems_solved as my_problems,
                   opp_mp.score as opp_score, opp_u.cf_handle as opp_handle, opp_mp.forfeited as opp_forfeit, opp_mp.problems_solved as opp_problems
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            LEFT JOIN match_players opp_mp ON opp_mp.match_id = m.id AND opp_mp.user_id != mp.user_id
            LEFT JOIN users opp_u ON opp_mp.user_id = opp_u.id
            WHERE mp.user_id = $1 AND m.status != 'WAITING'
            ORDER BY m.created_at DESC
        `, [uRes.rows[0].id]);

        res.json({ user: uRes.rows[0], history: historyRes.rows });
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

// GET Head-to-Head Stats
router.get('/user/:handle/h2h', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({error: "No token"});

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const uRes = await db.query('SELECT id FROM users WHERE cf_handle = $1', [req.params.handle]);
        if (uRes.rows.length === 0) return res.status(404).json({error: "User not found"});
        const targetId = uRes.rows[0].id;

        const h2hRes = await db.query(`
            SELECT m.id, m.winner_id, mp1.user_id as user1, mp2.user_id as user2
            FROM matches m
            JOIN match_players mp1 ON m.id = mp1.match_id AND mp1.user_id = $1
            JOIN match_players mp2 ON m.id = mp2.match_id AND mp2.user_id = $2
            WHERE m.status = 'FINISHED'
        `, [decoded.id, targetId]);

        let matches = 0, myWins = 0, theirWins = 0, draws = 0;
        h2hRes.rows.forEach(r => {
            matches++;
            if (!r.winner_id) draws++;
            else if (r.winner_id === decoded.id) myWins++;
            else theirWins++;
        });

        res.json({ matches, myWins, theirWins, draws });
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

module.exports = { router, JWT_SECRET };
