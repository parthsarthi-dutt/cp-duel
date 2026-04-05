import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trophy, Plus, LogIn, Play, ArrowLeft, Crown, Award, X, UserPlus } from 'lucide-react';
import { io } from 'socket.io-client';
import API_BASE_URL from '../config';

export default function Leagues({ token, user }) {
    const { leagueId: urlLeagueId } = useParams();
    const navigate = useNavigate();
    const [leagues, setLeagues] = useState([]);
    const [name, setName] = useState('');
    const [joinId, setJoinId] = useState('');
    const [timeLimit, setTimeLimit] = useState('45');
    const [ratingMin, setRatingMin] = useState('800');
    const [ratingMax, setRatingMax] = useState('1500');
    const [loading, setLoading] = useState(false);
    const [activeLeague, setActiveLeague] = useState(null);
    const [friends, setFriends] = useState([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const socketRef = useRef(null);

    const fetchLeagues = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/league/my`, { headers: { Authorization: `Bearer ${token}` }});
            if(res.ok) setLeagues(await res.json());
        } catch(e) {}
    }

    const loadLeague = async (id) => {
        const res = await fetch(`${API_BASE_URL}/api/league/${id}`, { headers: { Authorization: `Bearer ${token}` }});
        if(res.ok) {
            const data = await res.json();
            setActiveLeague(data);
            if (socketRef.current) {
                socketRef.current.emit('joinLeague', { leagueId: id });
            }
        }
    };

    useEffect(() => {
        fetchLeagues();
        socketRef.current = io(API_BASE_URL, { transports: ['websocket', 'polling'] });

        if (token) {
            fetch(`${API_BASE_URL}/social/friends`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then(r => r.json())
            .then(d => { if(Array.isArray(d)) setFriends(d); });
        }

        socketRef.current.on('leagueUpdated', () => {
            console.log("League update received via socket!");
            // Refresh the current active league if one exists
            setActiveLeague(prev => {
                if (prev) {
                    loadLeague(prev.id);
                }
                return prev;
            });
            fetchLeagues(); // Also refresh the list
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [token]);

    // Handle deep linking
    useEffect(() => {
        if (urlLeagueId) {
            loadLeague(urlLeagueId);
        } else {
            setActiveLeague(null);
        }
    }, [urlLeagueId]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if(!name) return;
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/league/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name, timeLimit: parseInt(timeLimit), ratingMin: parseInt(ratingMin), ratingMax: parseInt(ratingMax) })
        });
        if(res.ok) {
            const data = await res.json();
            setName('');
            fetchLeagues();
            navigate(`/leagues/${data.leagueId}`);
        }
        setLoading(false);
    }

    const handleJoin = async (e) => {
        e.preventDefault();
        if(!joinId) return;
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/league/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ leagueId: joinId })
        });
        if(res.ok) {
            setJoinId('');
            fetchLeagues();
            navigate(`/leagues/${joinId}`);
        } else {
            const d = await res.json();
            alert(d.error || 'Invalid League ID');
        }
        setLoading(false);
    }

    const startLeague = async (id) => {
        if(!window.confirm("Start round-robin? All current players will be matched.")) return;
        const res = await fetch(`${API_BASE_URL}/api/league/${id}/start`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        if(!res.ok) { const d = await res.json(); alert(d.error); }
    }

    const endLeague = async (id) => {
        if(!window.confirm("End this league? Standings will be finalized.")) return;
        const res = await fetch(`${API_BASE_URL}/api/league/${id}/end`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
    }
    const sendLeagueInvite = async (friend) => {
        try {
            const res = await fetch(`${API_BASE_URL}/social/invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    receiverId: friend.id,
                    type: 'LEAGUE',
                    targetId: activeLeague.id
                })
            });
            if (res.ok) alert(`League invite sent to ${friend.cf_handle}`);
        } catch (e) { console.error(e); }
    };
    if (activeLeague) {
        const isCreator = activeLeague.creator_id === user.id;

        return (
            <div style={{maxWidth: '900px', margin: '0 auto'}}>
                <button onClick={() => { navigate('/leagues'); }} 
                    style={{background: 'transparent', color: 'var(--text-secondary)', width:'auto', marginBottom:'1rem', padding:'0.4rem 0', border:'none', boxShadow:'none'}}>
                    <ArrowLeft size={16}/> Back to Leagues
                </button>

                <div className="card" style={{marginBottom:'1.5rem'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div>
                            <h1 style={{fontSize:'1.6rem', fontWeight:800, display:'flex', alignItems:'center', gap:'0.5rem'}}>
                                <Trophy size={24} color="var(--warning-color)"/> {activeLeague.name}
                            </h1>
                            <p style={{color:'var(--text-secondary)', fontSize:'0.8rem', fontFamily:'var(--font-mono)', marginTop:'0.25rem'}}>
                                ID: {activeLeague.id}
                            </p>
                        </div>
                        <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
                            <span className="status-badge" style={{
                                background: activeLeague.status === 'ACTIVE' ? 'rgba(16,185,129,0.1)' : activeLeague.status === 'COMPLETED' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
                                color: activeLeague.status === 'ACTIVE' ? 'var(--success-color)' : activeLeague.status === 'COMPLETED' ? 'var(--danger-color)' : 'var(--accent-color)'
                            }}>{activeLeague.status}</span>
                        </div>
                    </div>
                    
                    <div style={{display:'flex', gap:'1.5rem', marginTop:'1rem', fontSize:'0.8rem', color:'var(--text-secondary)'}}>
                        <span>⏱ {activeLeague.time_limit} min</span>
                        <span>📊 {activeLeague.rating_min}–{activeLeague.rating_max}</span>
                        <span>👥 {activeLeague.players.length} players</span>
                    </div>

                    {activeLeague.status !== 'COMPLETED' && (
                        <div style={{display:'flex', flexWrap:'wrap', gap:'0.75rem', marginTop:'1.5rem', alignItems: 'center'}}>
                            {isCreator && activeLeague.status === 'WAITING' && (
                                <button onClick={() => startLeague(activeLeague.id)} style={{background: 'var(--success-color)', width:'auto'}}>
                                    <Play size={16} /> Start Tournament
                                </button>
                            )}
                            <button onClick={() => setShowInviteModal(!showInviteModal)} 
                                    style={{
                                        background: 'rgba(99, 102, 241, 0.1)', 
                                        border: '1px solid var(--accent-color)', 
                                        color: 'var(--accent-color)', 
                                        width: 'auto',
                                        padding: '0.6rem 1.2rem',
                                        fontSize: '0.9rem',
                                        fontWeight: 600
                                    }}>
                                <Plus size={18} style={{marginRight: '0.5rem'}} /> Invite Friends to League
                            </button>
                            {isCreator && activeLeague.status === 'ACTIVE' && (
                                <button onClick={() => endLeague(activeLeague.id)} style={{background: 'var(--danger-color)', width:'auto'}}>
                                    End League
                                </button>
                            )}
                        </div>
                    )}
                    {showInviteModal && activeLeague.status !== 'COMPLETED' && (
                        <div className="card shadow" style={{ marginTop: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '1rem', maxWidth: '300px' }}>
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Plus size={16}/> Your Friends
                            </h4>
                            {friends.length === 0 ? (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No friends found</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {friends.map(f => (
                                        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.85rem' }}>{f.cf_handle}</span>
                                            <button onClick={() => sendLeagueInvite(f)} style={{ padding: '6px 12px', width: 'auto', fontSize: '0.75rem', background: 'var(--accent-color)' }}>Invite</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="card" style={{marginBottom:'1.5rem'}}>
                    <h2 style={{fontSize:'1.1rem', fontWeight:700, marginBottom:'1rem', display:'flex', alignItems:'center', gap:'0.5rem'}}>
                        <Crown size={18} color="var(--warning-color)"/> Standings
                    </h2>
                    <div style={{overflowX:'auto'}}>
                    <table className="league-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Player</th>
                                <th>Pts</th>
                                <th>P</th>
                                <th>W</th>
                                <th>L</th>
                                <th>D</th>
                                <th>Solved</th>
                                <th>FF</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(activeLeague.players || []).map((p, i) => (
                                <tr key={p.user_id}>
                                    <td style={{fontWeight:700, color: i===0 ? 'var(--warning-color)' : 'var(--text-secondary)'}}>{i+1}</td>
                                    <td style={{fontWeight:600}}>
                                        <span onClick={() => navigate(`/profile/${p.cf_handle}`)} style={{cursor:'pointer', color:'var(--accent-color)'}}>{p.cf_handle}</span>
                                    </td>
                                    <td style={{fontWeight:800, color:'var(--accent-color)', fontFamily:'var(--font-mono)'}}>{p.points}</td>
                                    <td style={{fontFamily:'var(--font-mono)'}}>{p.matches_played}</td>
                                    <td style={{color:'var(--success-color)', fontFamily:'var(--font-mono)'}}>{p.wins}</td>
                                    <td style={{color:'var(--danger-color)', fontFamily:'var(--font-mono)'}}>{p.losses}</td>
                                    <td style={{color:'var(--warning-color)', fontFamily:'var(--font-mono)'}}>{p.draws}</td>
                                    <td style={{fontFamily:'var(--font-mono)'}}>{p.problems_solved}</td>
                                    <td style={{color:'var(--danger-color)', fontFamily:'var(--font-mono)'}}>{p.forfeits}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>

                <div className="card">
                    <h2 style={{fontSize:'1.1rem', fontWeight:700, marginBottom:'1rem', display:'flex', alignItems:'center', gap:'0.5rem'}}>
                        <Award size={18}/> Fixtures
                    </h2>
                    {activeLeague.matches.length === 0 ? (
                        <p style={{color:'var(--text-secondary)', fontSize:'0.9rem'}}>Wait for the creator to start the league.</p>
                    ) : (
                        <div style={{display:'flex', flexDirection:'column', gap:'0.5rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem'}}>
                            {activeLeague.matches.map(m => {
                                if (!m.players || !Array.isArray(m.players) || m.players.length < 2) return null;
                                const p1 = m.players[0];
                                const p2 = m.players[1];
                                const isFinished = m.status === 'FINISHED';

                                return (
                                    <div key={m.id} className="match-card" onClick={() => navigate('/room/' + m.id)}>
                                        <div style={{display:'flex', alignItems:'center', gap:'0.75rem', flex:1}}>
                                            <span style={{
                                                fontWeight:600, fontSize:'0.9rem',
                                                color: m.winner_id === p1.user_id ? 'var(--success-color)' : 'var(--text-primary)'
                                            }} onClick={(e) => { e.stopPropagation(); navigate(`/profile/${p1.cf_handle}`); }}>
                                                {p1.cf_handle}
                                                {isFinished && <span style={{fontFamily:'var(--font-mono)', marginLeft:'0.5rem', fontSize:'0.85rem'}}>{p1.score}</span>}
                                            </span>
                                            <span style={{color:'var(--border-color)', fontSize:'0.75rem'}}>vs</span>
                                            <span style={{
                                                fontWeight:600, fontSize:'0.9rem',
                                                color: m.winner_id === p2.user_id ? 'var(--success-color)' : 'var(--text-primary)'
                                            }} onClick={(e) => { e.stopPropagation(); navigate(`/profile/${p2.cf_handle}`); }}>
                                                {p2.cf_handle}
                                                {isFinished && <span style={{fontFamily:'var(--font-mono)', marginLeft:'0.5rem', fontSize:'0.85rem'}}>{p2.score}</span>}
                                            </span>
                                        </div>
                                        <span className="status-badge" style={{
                                            background: m.status === 'WAITING' ? 'rgba(99,102,241,0.1)' : m.status === 'ACTIVE' ? 'rgba(16,185,129,0.1)' : 'rgba(31,41,55,0.5)',
                                            color: m.status === 'WAITING' ? 'var(--accent-color)' : m.status === 'ACTIVE' ? 'var(--success-color)' : 'var(--text-secondary)',
                                            fontSize:'0.7rem'
                                        }}>{m.status}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    const hideLeague = async (e, id) => {
        e.stopPropagation();
        if(!window.confirm("Hide this league from your list?")) return;
        const res = await fetch(`${API_BASE_URL}/api/league/${id}/hide`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        if(res.ok) fetchLeagues();
    }

    return (
        <div style={{maxWidth: '800px', margin: '0 auto', width:'100%'}}>
            <h1 className="title" style={{marginBottom:'1.5rem'}}>Leagues</h1>
            <div className="grid" style={{marginBottom: '1.5rem'}}>
                <div className="card">
                    <h3 style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1rem', fontSize:'1rem'}}>
                        <Plus size={18}/> Create League
                    </h3>
                    <form onSubmit={handleCreate}>
                        <div className="form-group">
                            <label className="label">League Name</label>
                            <input type="text" placeholder="e.g. Weekend Blitz" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label">Match Duration</label>
                            <select value={timeLimit} onChange={e => setTimeLimit(e.target.value)}>
                                <option value="15">15 Minutes</option>
                                <option value="30">30 Minutes</option>
                                <option value="45">45 Minutes</option>
                                <option value="60">60 Minutes</option>
                            </select>
                        </div>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem'}}>
                            <div className="form-group">
                                <label className="label">Min Rating</label>
                                <input type="number" min="800" max="3500" step="100" value={ratingMin} onChange={e => setRatingMin(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label className="label">Max Rating</label>
                                <input type="number" min="800" max="3500" step="100" value={ratingMax} onChange={e => setRatingMax(e.target.value)} />
                            </div>
                        </div>
                        <button type="submit" disabled={loading}>Create League</button>
                    </form>
                </div>
                <div className="card">
                    <h3 style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1rem', fontSize:'1rem'}}>
                        <LogIn size={18}/> Join League
                    </h3>
                    <form onSubmit={handleJoin}>
                        <div className="form-group">
                            <label className="label">League ID</label>
                            <input type="text" placeholder="Paste League ID here" value={joinId} onChange={e => setJoinId(e.target.value)} required />
                        </div>
                        <button type="submit" disabled={loading} style={{background:'var(--warning-color)', color:'black'}}>Join League</button>
                    </form>
                    <p style={{color:'var(--text-secondary)', fontSize:'0.8rem', marginTop:'1rem'}}>
                        You can join a league at any time. Existing players will automatically get matches scheduled with you.
                    </p>
                </div>
            </div>

            <div className="card">
                <h2 style={{marginBottom:'1rem', fontSize:'1.1rem'}}>My Leagues</h2>
                {leagues.length === 0 ? <p style={{color:'var(--text-secondary)', fontSize:'0.9rem'}}>You haven't joined any leagues yet.</p> : (
                    <div style={{display:'flex', flexDirection:'column', gap:'0.5rem'}}>
                        {leagues.map(l => (
                            <div key={l.id} className="match-card" onClick={() => navigate('/leagues/' + l.id)} style={{position:'relative', pr:'2.5rem'}}>
                                <div>
                                    <h3 style={{fontSize:'0.95rem', fontWeight:600}}>{l.name}</h3>
                                    <p style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'0.15rem'}}>{l.player_count} players</p>
                                </div>
                                <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                                    <span className="status-badge" style={{
                                        background: l.status === 'ACTIVE' ? 'rgba(16,185,129,0.1)' : l.status === 'COMPLETED' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
                                        color: l.status === 'ACTIVE' ? 'var(--success-color)' : l.status === 'COMPLETED' ? 'var(--danger-color)' : 'var(--accent-color)'
                                    }}>{l.status}</span>
                                    {l.status === 'COMPLETED' && (
                                        <button 
                                            onClick={(e) => hideLeague(e, l.id)}
                                            style={{background:'transparent', border:'none', color:'var(--danger-color)', padding:'0.2rem', width:'auto', boxShadow:'none'}}
                                            title="Hide from list"
                                        >
                                            <X size={14}/>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
