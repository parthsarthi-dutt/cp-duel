import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Clock, ExternalLink, Activity, Trophy, AlertTriangle, XOctagon, ArrowLeft } from 'lucide-react';

export default function DuelRoom({ user, token }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [joined, setJoined] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [countdownLeft, setCountdownLeft] = useState(0);
  const [error, setError] = useState('');
  const [solvedModal, setSolvedModal] = useState({ show: false, solver: '' });
  const [matchDetails, setMatchDetails] = useState([]);
  const [friends, setFriends] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user.cf_verified) {
        navigate('/dashboard');
        return;
    }

    if ("Notification" in window && Notification.permission !== "denied") {
      Notification.requestPermission();
    }

    socketRef.current = io('http://localhost:3000');
    
    // Auto Join Room
    socketRef.current.emit('joinRoom', { roomId, userId: user.id }, (res) => {
      if (res.success) {
        setJoined(true);
        setRoomData(res.room);
      } else {
        setError(res.error);
      }
    });

    socketRef.current.on('roomUpdated', (data) => {
      setRoomData(data);
    });

    socketRef.current.on('countdownStarted', ({ seconds }) => {
        setCountdownLeft(seconds);
    });

    socketRef.current.on('countdownAborted', ({ reason }) => {
        setCountdownLeft(0);
        alert(reason);
    });

    socketRef.current.on('problemSolved', ({ solver }) => {
      const beepLoop = (times) => {
        if(times === 0) return;
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
          }
        } catch(e) {}
        setTimeout(() => beepLoop(times - 1), 350);
      };
      beepLoop(4);
      
      if ("Notification" in window && Notification.permission === "granted") {
         new Notification("Codeforces Duel Update", {
            body: `${solver} just solved the problem! 5 seconds until next problem...`,
         });
      }
      
      setSolvedModal({ show: true, solver });
      setTimeout(() => {
        setSolvedModal({ show: false, solver: '' });
      }, 5000);
    });

    socketRef.current.on('newLog', (log) => {
      setRoomData(prev => {
        if (!prev) return prev;
        return { ...prev, logs: [...prev.logs, log] };
      });
    });

    socketRef.current.on('invalidationProposed', ({ by }) => {
       alert(`${by} proposed to invalidate this match. Click "Invalidate Points" to agree.`);
    });

    socketRef.current.on('matchInvalidated', () => {
       alert('Match points successfully cancelled via mutual consent.');
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [roomId, user, navigate]);

  useEffect(() => {
    if (!roomData) return;

    if (roomData.status === 'ACTIVE') {
        const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - roomData.startTime) / 1000);
        const totalSeconds = roomData.timeLimit * 60;
        const remaining = Math.max(0, totalSeconds - elapsed);
        setTimeLeft(remaining);
        }, 1000);
        return () => clearInterval(interval);
    }
  }, [roomData]);

  // 10 second countdown timer
  useEffect(() => {
      if(countdownLeft > 0 && roomData?.status === 'COUNTDOWN') {
          const timer = setTimeout(() => setCountdownLeft(countdownLeft - 1), 1000);
          return () => clearTimeout(timer);
      }
  }, [countdownLeft, roomData]);

  useEffect(() => {
    if (roomData && roomData.status === 'FINISHED') {
        fetch(`http://localhost:3000/auth/match/${roomData.roomId}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setMatchDetails(data); })
        .catch(console.error);
    }
  }, [roomData?.status, token, roomData?.roomId]);

  useEffect(() => {
    if (roomData && roomData.status === 'WAITING' && token) {
       fetch('http://localhost:3000/social/friends', {
         headers: { Authorization: `Bearer ${token}` }
       })
       .then(r => r.json())
       .then(d => { if(Array.isArray(d)) setFriends(d); });
    }
  }, [roomData?.status, token]);

  const sendInvite = async (friend) => {
    try {
      const res = await fetch('http://localhost:3000/social/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          receiverId: friend.id,
          type: 'MATCH',
          targetId: roomId
        })
      });
      if (res.ok) alert(`Invite sent to ${friend.cf_handle}`);
    } catch (e) { console.error(e); }
  };

  const toggleReady = (isReady) => {
      if(roomData.status !== 'WAITING' && roomData.status !== 'COUNTDOWN') return;
      socketRef.current.emit('toggleReady', { roomId, userId: user.id, isReady });
  };

  const forfeitMatch = () => {
      if(window.confirm("Are you sure you want to forfeit? Your opponent will get 5 points immediately.")) {
          socketRef.current.emit('forfeitMatch', { roomId, userId: user.id });
      }
  };

  const voteInvalidate = () => {
      if(window.confirm("Propose invalidating this match? It requires the opponent's agreement.")) {
          socketRef.current.emit('voteInvalidateMatch', { roomId, userId: user.id });
      }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (error) return <div style={{textAlign:'center', marginTop:'4rem', color:'#ef4444'}}><h2>Error</h2><p>{error}</p></div>;
  if (!joined || !roomData) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Joining Arena...</div>;

  const player1 = roomData.players[0];
  const player2 = roomData.players[1];
  const me = roomData.players.find(p => p.handle === user.cf_handle);

  return (
    <>
      {solvedModal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: 'white', textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '4rem', color: 'var(--success-color)', marginBottom: '1rem' }}>
            🎉 {solvedModal.solver} Solved It!
          </h1>
          <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>
            Switching to the next problem in a moment...
          </p>
        </div>
      )}
    <div className="room-layout">
      <div className="main-panel">
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Room: <span style={{ color: 'var(--accent-color)' }}>{roomId}</span></h2>
            <div className="status-badge" style={{ 
              background: roomData.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: roomData.status === 'ACTIVE' ? 'var(--success-color)' : '#ef4444'
            }}>
              {roomData.status.toUpperCase()}
            </div>
          </div>
          
          {(roomData.status === 'WAITING' || roomData.status === 'COUNTDOWN') && (
            <div style={{ textAlign: 'center', margin: '3rem 0' }}>
              {roomData.status === 'COUNTDOWN' ? (
                  <>
                    <h1 style={{fontSize: '5rem', color: 'var(--accent-color)'}}>{countdownLeft}</h1>
                    <p className="subtitle" style={{color: '#f59e0b'}}>Match is starting! Click "Cancel" to abort.</p>
                  </>
              ) : (
                  <>
                    <div className="timer">Waiting...</div>
                    {roomData.type !== 'SOLO' && (
                        <p className="subtitle">Invite your opponent via URL: <br/> `http://localhost:5173/room/{roomId}`</p>
                    )}
                  </>
              )}
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                  {me && (
                      me.isReady ? (
                          <button style={{background: '#ef4444', width: 'auto'}} onClick={() => toggleReady(false)}>Cancel Ready</button>
                      ) : (
                          <button style={{background: '#10b981', width: 'auto'}} onClick={() => toggleReady(true)}>I am Ready</button>
                      )
                  )}
              </div>

              {roomData.type !== 'SOLO' && roomData.players.length < 2 && (
                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                  <button onClick={() => setShowInviteModal(!showInviteModal)} style={{ background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', width: 'auto' }}>
                    Invite Friends
                  </button>
                  {showInviteModal && (
                    <div className="card shadow" style={{ marginTop: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '1rem', maxWidth: '300px', margin: '1rem auto' }}>
                      <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Your Friends</h4>
                      {friends.length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No friends found</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {friends.map(f => (
                            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.85rem' }}>{f.cf_handle}</span>
                              <button onClick={() => sendInvite(f)} style={{ padding: '4px 8px', width: 'auto', fontSize: '0.7rem' }}>Invite</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop:'2rem' }}>
                {roomData.players.map(p => (
                  <span key={p.handle} className={`status-badge ${!p.isReady ? 'waiting' : ''}`} style={!p.isReady ? {background:'#374151', color:'white'} : {}} onClick={() => navigate(`/profile/${p.handle}`)}>
                      {p.handle} {p.isReady ? 'is ready' : 'is waiting'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {roomData.status === 'ACTIVE' && (
            <>
              <div className="timer">
                <Clock style={{ display: 'inline', marginRight: '1rem', verticalAlign: 'text-bottom' }} size={48} />
                {formatTime(timeLeft)}
              </div>

              {roomData.currentProblem ? (
                <div className="problem-box">
                  <p className="label">Current Target Problem</p>
                  <a href={`https://codeforces.com/contest/${roomData.currentProblem.contestId}/problem/${roomData.currentProblem.index}`} target="_blank" rel="noreferrer">
                    {roomData.currentProblem.name} <ExternalLink size={20} />
                  </a>
                  <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                    Rating: {roomData.currentProblem.rating}
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', margin: '2rem 0' }}>Generating problem...</div>
              )}

              <div style={{display:'flex', gap:'1rem', justifyContent:'center'}}>
                  <button onClick={forfeitMatch} style={{background: 'transparent', border:'1px solid #ef4444', color:'#ef4444', width:'auto'}}>
                      <AlertTriangle size={18} style={{marginRight:'0.5rem'}}/> Forfeit (+5 to Opponent)
                  </button>
                  <button onClick={voteInvalidate} disabled={me?.invalidVote} style={{background: 'transparent', border:'1px solid #f59e0b', color:'#f59e0b', width:'auto'}}>
                     <XOctagon size={18} style={{marginRight:'0.5rem'}}/> {me?.invalidVote ? 'Voted to Invalidate' : 'Propose Invalidation'}
                  </button>
              </div>
            </>
          )}

          {(roomData.status === 'FINISHED' || roomData.status === 'INVALIDATED') && (
             <div style={{ textAlign: 'center', margin: '3rem 0' }}>
               <Trophy size={64} color="#f59e0b" style={{ margin: '0 auto 1rem' }} />
               <h2 style={{ fontSize: '2.5rem', color: '#f59e0b' }}>
                   {roomData.status === 'INVALIDATED' ? "Match Invalidated" : "Match Finished!"}
               </h2>
               <div style={{marginTop:'2rem'}}>
                   <button onClick={voteInvalidate} disabled={me?.invalidVote} style={{background: 'transparent', border:'1px solid #f59e0b', color:'#f59e0b', width:'auto'}}>
                     <XOctagon size={18} style={{marginRight:'0.5rem'}}/> {me?.invalidVote ? 'Voted to Invalidate Points' : 'Vote to Invalidate Points'}
                  </button>
                  {roomData.leagueId && (
                     <button onClick={() => navigate('/leagues/' + roomData.leagueId)} style={{marginTop: '1rem', background: 'var(--accent-color)', width: 'auto'}}>
                        <ArrowLeft size={18} style={{marginRight: '0.5rem'}}/> Back to League
                     </button>
                  )}
               </div>
             </div>
          )}

          <div className="score-board">
            <div className="player-score">
              <h3 style={{textDecoration: player1?.forfeited ? 'line-through' : 'none'}}>{player1 ? player1.handle : 'Player 1'}</h3>
              <div className="score" style={{fontSize: player1 && player1.score > (player1.problemsSolved || 0) ? '2rem' : '4rem'}}>
                  {player1 && player1.score > (player1.problemsSolved || 0) ? `${player1.problemsSolved || 0} + ${player1.score - (player1.problemsSolved || 0)}` : (player1 ? player1.score : 0)}
              </div>
              {player1 && player1.score > (player1.problemsSolved || 0) && <span style={{color: 'var(--success-color)', fontSize:'0.8rem'}}>OPPONENT FORFEIT</span>}
              {player1?.forfeited && <span style={{color: '#ef4444', fontSize:'0.8rem'}}>FORFEITED</span>}
            </div>
            {roomData.type !== 'SOLO' && (
              <div className="player-score">
                <h3 style={{textDecoration: player2?.forfeited ? 'line-through' : 'none'}}>{player2 ? player2.handle : 'Player 2'}</h3>
                <div className="score" style={{fontSize: player2 && player2.score > (player2.problemsSolved || 0) ? '2rem' : '4rem'}}>
                    {player2 && player2.score > (player2.problemsSolved || 0) ? `${player2.problemsSolved || 0} + ${player2.score - (player2.problemsSolved || 0)}` : (player2 ? player2.score : 0)}
                </div>
                {player2 && player2.score > (player2.problemsSolved || 0) && <span style={{color: 'var(--success-color)', fontSize:'0.8rem'}}>OPPONENT FORFEIT</span>}
                {player2?.forfeited && <span style={{color: '#ef4444', fontSize:'0.8rem'}}>FORFEITED</span>}
              </div>
            )}
          </div>
          
          {matchDetails.length > 0 && (
            <div style={{marginTop: '2rem', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--card-bg)'}}>
              <h3 style={{marginBottom:'1rem', fontSize:'1.1rem', color:'var(--text-primary)'}}>Problems Solved</h3>
              <div style={{overflowX: 'auto'}}>
                <table className="league-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Problem</th>
                      <th>Solved By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchDetails.map(m => (
                      <tr key={m.id}>
                        <td style={{fontFamily:'var(--font-mono)'}}>{new Date(m.solved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                        <td>
                          <a href={`https://codeforces.com/contest/${m.contest_id}/problem/${m.problem_index}`} target="_blank" rel="noreferrer" style={{color:'var(--accent-color)'}}>
                            {m.problem_name}
                          </a>
                        </td>
                        <td style={{fontWeight:600}}>
                          <span onClick={() => navigate(`/profile/${m.solved_by}`)} style={{cursor:'pointer', color:'var(--accent-color)'}}>
                            {m.solved_by}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="logs-panel">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Activity size={20} color="var(--accent-color)" /> Event Log
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
          {roomData.logs.map((log, i) => (
            <div key={i} className="log-item">
              <span className="log-time">
                {new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' })}
              </span>
              {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
