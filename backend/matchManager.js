const { v4: uuidv4 } = require('uuid');
const cfService = require('./services/codeforces');
const db = require('./db');

class MatchManager {
  constructor(io) {
    this.io = io;
    this.activeMatches = new Map();
    setInterval(() => this.pollActiveMatches(), 5000);
  }

  async createMatch(creatorId, timeLimit, ratingMin, ratingMax, type = 'CASUAL', leagueId = null) {
    const res = await db.query(
        `INSERT INTO matches (type, league_id, status, time_limit, rating_min, rating_max) 
         VALUES ($1, $2, 'WAITING', $3, $4, $5) RETURNING *`,
        [type, leagueId, timeLimit, ratingMin, ratingMax]
    );
    return res.rows[0];
  }

  async joinMatch(matchId, userId, socketId) {
    const mRes = await db.query('SELECT * FROM matches WHERE id = $1', [matchId]);
    if(mRes.rows.length === 0) throw new Error("Match not found");
    const match = mRes.rows[0];

    // Allow reconnecting to any non-invalidated match
    const pRes = await db.query('SELECT * FROM match_players WHERE match_id = $1', [matchId]);
    const isExistingPlayer = pRes.rows.find(p => p.user_id === userId);

    // For SOLO, room is considered full if length >= 1, otherwise >= 2
    if (!isExistingPlayer) {
        if (match.status !== 'WAITING') throw new Error("Match already started");
        if (match.type === 'SOLO' && pRes.rows.length >= 1) throw new Error("Solo room is full");
        if (match.type !== 'SOLO' && pRes.rows.length >= 2) throw new Error("Room is full");
        await db.query(`INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)`, [matchId, userId]);
    }

    if (!this.activeMatches.has(matchId)) {
        const allPlayersRes = await db.query(`
            SELECT mp.*, u.cf_handle
            FROM match_players mp
            JOIN users u ON mp.user_id = u.id
            WHERE mp.match_id = $1
        `, [matchId]);

        const players = allPlayersRes.rows.map(p => ({
            userId: p.user_id,
            socketId: null,
            handle: p.cf_handle,
            score: p.score,
            problemsSolved: p.problems_solved,
            isReady: p.is_ready || false,
            invalidVote: p.invalid_vote || false,
            forfeited: p.forfeited || false
        }));

        this.activeMatches.set(matchId, {
            roomId: matchId,
            type: match.type,
            leagueId: match.league_id,
            timeLimit: match.time_limit,
            ratingMin: match.rating_min,
            ratingMax: match.rating_max,
            status: match.status,
            startTime: match.started_at ? new Date(match.started_at).getTime() : null,
            players: players,
            currentProblem: null,
            assignedAtTime: null,
            solvedSet: new Set(),
            logs: [],
            timerId: null
        });

        // Load logs from DB
        const logsRes = await db.query('SELECT message, time FROM match_logs WHERE match_id = $1 ORDER BY time ASC', [matchId]);
        this.activeMatches.get(matchId).logs = logsRes.rows.map(l => ({ time: parseInt(l.time), message: l.message }));
    }

    const room = this.activeMatches.get(matchId);
    
    const existing = room.players.find(p => p.userId === userId);
    if (existing) {
        existing.socketId = socketId;
        if (room.status === 'WAITING' || room.status === 'COUNTDOWN') {
            this.addLog(room, `${existing.handle} joined the room.`);
        }
    } else {
        const uRes = await db.query('SELECT cf_handle FROM users WHERE id = $1', [userId]);
        const handle = uRes.rows[0]?.cf_handle;
        if(!handle) throw new Error("Codeforces Handle not verified yet.");

        room.players.push({ 
            userId, socketId, handle, score: 0, problemsSolved: 0,
            isReady: false, 
            invalidVote: false, 
            forfeited: false 
        });
        if (room.status === 'WAITING' || room.status === 'COUNTDOWN') {
            this.addLog(room, `${handle} joined the room.`);
        }
    }

    return room;
  }

  addLog(room, message) {
    const time = Date.now();
    room.logs.push({ time, message });
    this.io.to(room.roomId).emit('newLog', { time, message });
    
    // Fire and forget DB insert for logs
    db.query('INSERT INTO match_logs (match_id, message, time) VALUES ($1, $2, $3)', [room.roomId, message, time])
      .catch(err => console.error("Log persistence error:", err));
  }

  async toggleReady(matchId, userId, isReady) {
      const room = this.activeMatches.get(matchId);
      if(!room) return;

      const player = room.players.find(p => p.userId === userId);
      if(player) player.isReady = isReady;

      await db.query(`UPDATE match_players SET is_ready = $1 WHERE match_id = $2 AND user_id = $3`, [isReady, matchId, userId]);

      const isSolo = room.type === 'SOLO';
      const requiredPlayers = isSolo ? 1 : 2;

      if (room.players.length === requiredPlayers && room.players.every(p => p.isReady) && room.status === 'WAITING') {
          room.status = 'COUNTDOWN';
          await db.query(`UPDATE matches SET status = 'COUNTDOWN' WHERE id = $1`, [matchId]);
          this.addLog(room, `${isSolo ? "Player" : "Both players"} ready. Match starting in 10 seconds...`);
          this.io.to(room.roomId).emit('countdownStarted', { seconds: 10 });
          
          room.timerId = setTimeout(() => {
              if (room.status === 'COUNTDOWN') this.startMatch(room);
          }, 10000);
      } else if (!isReady && room.status === 'COUNTDOWN') {
          clearTimeout(room.timerId);
          room.status = 'WAITING';
          await db.query(`UPDATE matches SET status = 'WAITING' WHERE id = $1`, [matchId]);
          room.players.forEach(p => p.isReady = false);
          await db.query(`UPDATE match_players SET is_ready = false WHERE match_id = $1`, [matchId]);
          
          this.addLog(room, `${player.handle} cancelled readiness. Countdown aborted.`);
          this.io.to(room.roomId).emit('countdownAborted', { reason: `${player.handle} cancelled ready status.` });
      }

      this.io.to(room.roomId).emit('roomUpdated', this.sanitizeRoom(room));
  }

  async forfeitMatch(matchId, userId) {
      const room = this.activeMatches.get(matchId);
      if(!room || room.status !== 'ACTIVE') return;

      const loser = room.players.find(p => p.userId === userId);
      const winner = room.players.find(p => p.userId !== userId);
      if(!loser || !winner) return;

      loser.forfeited = true;
      let pointsGained = 0;
      if (room.type !== 'CASUAL') {
          pointsGained = 5;
          winner.score += 5;
          await db.query(`UPDATE match_players SET score = $1 WHERE match_id = $2 AND user_id = $3`, [winner.score, matchId, winner.userId]);
      }

      await db.query(`UPDATE match_players SET forfeited = true WHERE match_id = $1 AND user_id = $2`, [matchId, userId]);
      await db.query(`UPDATE users SET forfeits = forfeits + 1 WHERE id = $1`, [userId]);
      
      this.addLog(room, `🚨 ${loser.handle} FORFEITED! ${pointsGained > 0 ? `${winner.handle} gets +5 points.` : ''}`);
      await this.endMatch(room, winner.userId);
  }

  async voteInvalidate(matchId, userId) {
      const room = this.activeMatches.get(matchId);
      if(!room) return;

      const player = room.players.find(p => p.userId === userId);
      if(player) player.invalidVote = true;

      await db.query(`UPDATE match_players SET invalid_vote = true WHERE match_id = $1 AND user_id = $2`, [matchId, userId]);
      this.addLog(room, `${player.handle} voted to INVALIDATE the match points.`);

      if (room.players.length === 2 && room.players.every(p => p.invalidVote)) {
          await db.query(`UPDATE matches SET status = 'INVALIDATED' WHERE id = $1`, [matchId]);
          room.status = 'INVALIDATED';
          this.addLog(room, "Both players voted. Match points INVALIDATED via Mutual Consent.");
          this.io.to(room.roomId).emit('matchInvalidated');
      } else {
          this.io.to(room.roomId).emit('invalidationProposed', { by: player.handle });
      }
      this.io.to(room.roomId).emit('roomUpdated', this.sanitizeRoom(room));
  }

  async startMatch(room) {
    room.status = 'ACTIVE';
    room.startTime = Date.now();
    await db.query(`UPDATE matches SET status = 'ACTIVE', started_at = NOW() WHERE id = $1`, [room.roomId]);
    
    this.addLog(room, "Match started! Compiling previously solved problems...");

    for (const p of room.players) {
      const subs = await cfService.getUserSubmissions(p.handle);
      for (const sub of subs) {
        if (sub.verdict === 'OK' && sub.problem) {
          room.solvedSet.add(`${sub.problem.contestId}-${sub.problem.index}`);
        }
      }
    }
    this.addLog(room, "Database synced. Generating first problem...");
    this.assignNewProblem(room);
    
    setTimeout(() => {
      this.endMatch(room);
    }, room.timeLimit * 60 * 1000);
  }

  assignNewProblem(room) {
    if(room.status !== 'ACTIVE') return;
    const problem = cfService.getRandomProblem(room.ratingMin, room.ratingMax, room.solvedSet);
    if (!problem) {
      this.addLog(room, "ERROR: No suitable problem found in this rating range.");
      return;
    }
    
    room.currentProblem = problem;
    room.assignedAtTime = Math.floor(Date.now() / 1000); 
    this.addLog(room, `🎯 New Problem: ${problem.name} (Rating: ${problem.rating})`);
    this.io.to(room.roomId).emit('roomUpdated', this.sanitizeRoom(room));
  }

  async endMatch(room, overrideWinnerId = null) {
    if (room.status === 'FINISHED' || room.status === 'INVALIDATED') return;
    room.status = 'FINISHED';
    
    let winnerId = overrideWinnerId;
    let isDraw = false;

    if (!winnerId && room.players.length === 2) {
        if (room.players[0].score > room.players[1].score) winnerId = room.players[0].userId;
        else if (room.players[1].score > room.players[0].score) winnerId = room.players[1].userId;
        else isDraw = true;
    }

    await db.query(`UPDATE matches SET status = 'FINISHED', winner_id = $1 WHERE id = $2`, [winnerId, room.roomId]);

    for (const p of room.players) {
        await db.query(`UPDATE match_players SET score = $1, problems_solved = $2 WHERE match_id = $3 AND user_id = $4`, 
            [p.score, p.problemsSolved || 0, room.roomId, p.userId]);
        if (room.type === 'SOLO') {
            await db.query(`UPDATE users SET problems_solved = problems_solved + $1 WHERE id = $2`, [p.problemsSolved || 0, p.userId]);
        } else if (isDraw) {
            await db.query(`UPDATE users SET matches_drawn = matches_drawn + 1, problems_solved = problems_solved + $1 WHERE id = $2`, [p.problemsSolved || 0, p.userId]);
        } else if (winnerId) {
            if (p.userId === winnerId) {
                await db.query(`UPDATE users SET matches_won = matches_won + 1, problems_solved = problems_solved + $1 WHERE id = $2`, [p.problemsSolved || 0, p.userId]);
            } else {
                await db.query(`UPDATE users SET matches_lost = matches_lost + 1, problems_solved = problems_solved + $1 WHERE id = $2`, [p.problemsSolved || 0, p.userId]);
            }
        }
    }

    // Update league standings if this is a league match
    if (room.leagueId) {
        for (const p of room.players) {
            let lpUpdate = `UPDATE league_players SET matches_played = matches_played + 1, problems_solved = problems_solved + $1`;
            if (isDraw) {
                lpUpdate += `, draws = draws + 1, points = points + 1`;
            } else if (p.userId === winnerId) {
                lpUpdate += `, wins = wins + 1, points = points + 3`;
            } else {
                lpUpdate += `, losses = losses + 1`;
            }
            if (p.forfeited) {
                lpUpdate += `, forfeits = forfeits + 1`;
            }
            lpUpdate += ` WHERE league_id = $2 AND user_id = $3`;
            await db.query(lpUpdate, [p.problemsSolved || 0, room.leagueId, p.userId]);
        }
    }

    this.addLog(room, "⏳ Match finished.");
    if(winnerId) {
        const winner = room.players.find(p => p.userId === winnerId);
        this.addLog(room, `🏆 ${winner.handle} won the match!`);
    } else {
        this.addLog(room, `🤝 It's a draw!`);
    }
    
    this.io.to(room.roomId).emit('roomUpdated', this.sanitizeRoom(room));
  }

  async pollActiveMatches() {
    for (const [roomId, room] of this.activeMatches.entries()) {
      if (room.status !== 'ACTIVE' || !room.currentProblem) continue;

      let solvedBy = null;
      for (const player of room.players) {
        if(player.forfeited) continue;

        try {
          const subs = await cfService.getRecentSubmissions(player.handle, 5); 
          for (const sub of subs) {
            if (sub.problem && 
                sub.problem.contestId === room.currentProblem.contestId &&
                sub.problem.index === room.currentProblem.index) {
                  
              if (sub.verdict === 'OK' && sub.creationTimeSeconds >= room.assignedAtTime) {
                solvedBy = player;
                break;
              }
            }
          }
        } catch(e) {
          console.error(`Poll error for ${player.handle}:`, e.message);
        }
        if (solvedBy) break;
      }

      if (solvedBy) {
        const solvedId = `${room.currentProblem.contestId}-${room.currentProblem.index}`;
        const probName = room.currentProblem.name;
        const probContest = room.currentProblem.contestId;
        const probIndex = room.currentProblem.index;

        room.currentProblem = null; 

        solvedBy.score += 1;
        solvedBy.problemsSolved = (solvedBy.problemsSolved || 0) + 1;
        this.addLog(room, `🎉 ${solvedBy.handle} solved the problem! +1 Point`);
        room.solvedSet.add(solvedId);
        
        await db.query(`UPDATE match_players SET score = $1, problems_solved = $2 WHERE match_id = $3 AND user_id = $4`, 
            [solvedBy.score, solvedBy.problemsSolved, roomId, solvedBy.userId]);

        await db.query(`INSERT INTO match_problems (match_id, user_id, problem_name, contest_id, problem_index) VALUES ($1, $2, $3, $4, $5)`,
            [roomId, solvedBy.userId, probName, probContest, probIndex]);

        this.io.to(room.roomId).emit('problemSolved', { solver: solvedBy.handle });
        this.io.to(room.roomId).emit('roomUpdated', this.sanitizeRoom(room));

        setTimeout(() => {
          if (room.status === 'ACTIVE') {
            this.assignNewProblem(room);
          }
        }, 5000);
      }
    }
  }

  sanitizeRoom(room) {
    return {
      roomId: room.roomId,
      type: room.type,
      leagueId: room.leagueId,
      timeLimit: room.timeLimit,
      ratingMin: room.ratingMin,
      ratingMax: room.ratingMax,
      status: room.status,
      startTime: room.startTime,
      currentProblem: room.currentProblem,
      logs: room.logs,
      players: room.players.map(p => ({ 
          handle: p.handle, 
          score: p.score,
          problemsSolved: p.problemsSolved || 0,
          isReady: p.isReady, 
          invalidVote: p.invalidVote,
          forfeited: p.forfeited
      }))
    };
  }
}

module.exports = MatchManager;
