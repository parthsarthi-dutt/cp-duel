const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_duel_key_99';

module.exports = (io, userSockets) => {
    const router = express.Router();

    // Middleware to verify token and attach user to req
    const authenticate = (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: "No token" });
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            next();
        } catch (e) {
            res.status(401).json({ error: "Invalid token" });
        }
    };

    // Get friends
    router.get('/friends', authenticate, async (req, res) => {
        try {
            const friends = await db.query(`
                SELECT u.id, u.cf_handle, u.problems_solved, u.matches_won
                FROM friendships f
                JOIN users u ON (f.user_id1 = $1 AND f.user_id2 = u.id) OR (f.user_id2 = $1 AND f.user_id1 = u.id)
                WHERE f.user_id1 = $1 OR f.user_id2 = $1
            `, [req.user.id]);
            res.json(friends.rows);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Get pending invitations
    router.get('/invitations', authenticate, async (req, res) => {
        try {
            const invites = await db.query(`
                SELECT i.*, u.cf_handle as sender_handle
                FROM invitations i
                JOIN users u ON i.sender_id = u.id
                WHERE i.receiver_id = $1 AND i.status = 'PENDING'
                ORDER BY i.created_at DESC
            `, [req.user.id]);
            res.json(invites.rows);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Search users
    router.get('/search-users', authenticate, async (req, res) => {
        try {
            const { q } = req.query;
            const users = await db.query(`
                SELECT id, cf_handle 
                FROM users 
                WHERE cf_handle ILIKE $1 AND cf_verified = true AND id != $2
                LIMIT 10
            `, [`%${q}%`, req.user.id]);
            res.json(users.rows);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Send invitation (Friend, Match, League)
    router.post('/invite', authenticate, async (req, res) => {
        const { receiverId, type, targetId } = req.body;
        try {
            // Check if already friends if type is FRIEND
            if (type === 'FRIEND') {
                const existing = await db.query(`
                    SELECT * FROM friendships 
                    WHERE (user_id1 = $1 AND user_id2 = $2) OR (user_id1 = $2 AND user_id2 = $1)
                `, [req.user.id, receiverId]);
                if (existing.rows.length > 0) return res.status(400).json({ error: "Already friends" });
            }

            // Check if already pending
            const pending = await db.query(`
                SELECT * FROM invitations 
                WHERE sender_id = $1 AND receiver_id = $2 AND type = $3 AND status = 'PENDING'
                AND (target_id = $4 OR target_id IS NULL)
            `, [req.user.id, receiverId, type, targetId || null]);
            if (pending.rows.length > 0) return res.status(400).json({ error: "Invitation already pending" });

            const inviteRes = await db.query(`
                INSERT INTO invitations (sender_id, receiver_id, type, target_id)
                VALUES ($1, $2, $3, $4) RETURNING *
            `, [req.user.id, receiverId, type, targetId || null]);

            const newInvite = inviteRes.rows[0];
            const senderRes = await db.query('SELECT cf_handle FROM users WHERE id = $1', [req.user.id]);
            newInvite.sender_handle = senderRes.rows[0].cf_handle;

            // Notify via Socket
            const receiverSocketId = userSockets.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('newInvitation', newInvite);
            }

            res.json({ success: true, invitation: newInvite });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Accept invitation
    router.post('/accept-invite/:id', authenticate, async (req, res) => {
        try {
            const invite = await db.query('SELECT * FROM invitations WHERE id = $1 AND receiver_id = $2', [req.params.id, req.user.id]);
            if (invite.rows.length === 0) return res.status(404).json({ error: "Invitation not found" });

            const inv = invite.rows[0];
            if (inv.status !== 'PENDING') return res.status(400).json({ error: "Invitation already processed" });

            await db.query('UPDATE invitations SET status = $1 WHERE id = $2', ['ACCEPTED', inv.id]);

            if (inv.type === 'FRIEND') {
                const u1 = inv.sender_id < inv.receiver_id ? inv.sender_id : inv.receiver_id;
                const u2 = inv.sender_id < inv.receiver_id ? inv.receiver_id : inv.sender_id;
                await db.query('INSERT INTO friendships (user_id1, user_id2) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u1, u2]);
            }

            // Notify sender
            const senderSocketId = userSockets.get(inv.sender_id);
            if (senderSocketId) {
                io.to(senderSocketId).emit('inviteAccepted', { inviteId: inv.id, type: inv.type, targetId: inv.target_id });
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Decline invitation
    router.post('/decline-invite/:id', authenticate, async (req, res) => {
        try {
            await db.query('UPDATE invitations SET status = $1 WHERE id = $2 AND receiver_id = $3', ['DECLINED', req.params.id, req.user.id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return router;
};
