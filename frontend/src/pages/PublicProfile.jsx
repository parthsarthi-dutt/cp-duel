import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trophy, History as HistoryIcon, Swords, User as UserIcon } from 'lucide-react';
import API_BASE_URL from '../config';

export default function PublicProfile({ token, currentUser }) {
    const { handle } = useParams();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [history, setHistory] = useState([]);
    const [h2h, setH2h] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API_BASE_URL}/auth/user/${handle}`);
                if (!res.ok) {
                    setError('User not found or not verified.');
                    setLoading(false);
                    return;
                }
                const data = await res.json();
                setProfile(data.user);
                setHistory(data.history);

                // Fetch H2H if it's not the current user
                if (currentUser.cf_handle !== handle && token) {
                    const h2hRes = await fetch(`${API_BASE_URL}/auth/user/${handle}/h2h`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (h2hRes.ok) {
                        setH2h(await h2hRes.json());
                    }
                }
            } catch (err) {
                setError(err.message);
            }
            setLoading(false);
        };
        fetchProfile();
    }, [handle, token, currentUser.cf_handle]);

    if (loading) return <div style={{textAlign:'center', marginTop:'4rem'}}>Loading profile...</div>;
    if (error) return <div style={{textAlign:'center', marginTop:'4rem', color:'var(--danger-color)'}}>{error}</div>;
    if (!profile) return null;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div className="card" style={{marginBottom:'1.5rem', textAlign:'center'}}>
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem'
                }}>
                    <UserIcon size={40} color="var(--accent-color)" />
                </div>
                <h1 style={{fontSize:'2rem', marginBottom:'0.5rem', color:'var(--text-primary)'}}>{profile.cf_handle}</h1>
                
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginTop: '2rem'}}>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--warning-color)'}}>{profile.trophies || 0}</div>
                        <div className="stat-label">Trophies</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--success-color)'}}>{profile.matches_won || 0}</div>
                        <div className="stat-label">Wins</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--danger-color)'}}>{profile.matches_lost || 0}</div>
                        <div className="stat-label">Losses</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--warning-color)'}}>{profile.matches_drawn || 0}</div>
                        <div className="stat-label">Draws</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--info-color)'}}>{profile.problems_solved || 0}</div>
                        <div className="stat-label">Solved</div>
                    </div>
                </div>
            </div>

            {h2h && h2h.matches > 0 && (
                <div className="card" style={{marginBottom:'1.5rem', background: 'var(--card-bg)', border: '1px solid var(--accent-color)'}}>
                    <h2 style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1.5rem', fontSize:'1.2rem'}}>
                        <Swords size={20} color="var(--accent-color)"/> Head-to-Head (You vs {profile.cf_handle})
                    </h2>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', textAlign:'center'}}>
                        <div>
                            <div style={{fontSize:'2rem', fontWeight:800, fontFamily:'var(--font-mono)'}}>{h2h.matches}</div>
                            <div style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Total</div>
                        </div>
                        <div>
                            <div style={{fontSize:'2rem', fontWeight:800, fontFamily:'var(--font-mono)', color:'var(--success-color)'}}>{h2h.myWins}</div>
                            <div style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Your Wins</div>
                        </div>
                        <div>
                            <div style={{fontSize:'2rem', fontWeight:800, fontFamily:'var(--font-mono)', color:'var(--danger-color)'}}>{h2h.theirWins}</div>
                            <div style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Their Wins</div>
                        </div>
                        <div>
                            <div style={{fontSize:'2rem', fontWeight:800, fontFamily:'var(--font-mono)', color:'var(--warning-color)'}}>{h2h.draws}</div>
                            <div style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Draws</div>
                        </div>
                    </div>
                </div>
            )}

            {history && history.length > 0 && (
                <div className="card" style={{marginTop: '1.5rem'}}>
                   <h2 style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1rem', fontSize:'1.2rem'}}>
                       <HistoryIcon size={20}/> Recent Matches
                   </h2>

                   <div style={{display:'flex', flexDirection:'column', gap:'0.5rem'}}>
                       {history.map(match => {
                           const isMe = match.opp_handle === currentUser.cf_handle; // highlight if against ME
                           let oppDisplay = match.opp_handle || '—';
                           if (isMe) oppDisplay = 'You';

                           const won = match.winner_id === profile.id;
                           const draw = match.status === 'FINISHED' && !match.winner_id;
                           const invalid = match.status === 'INVALIDATED';
                           
                           let cls = isMe ? 'active ' : '';
                           let textStatus = '';
                           let statusColor = '';

                           if (match.type === 'SOLO') {
                               textStatus = 'SOLO PREP';
                               statusColor = 'var(--info-color)';
                               cls += 'solo';
                           } else if (invalid) {
                               textStatus = 'INVALIDATED';
                               statusColor = 'var(--text-secondary)';
                           } else if (match.status === 'FINISHED') {
                               if (won) { cls += 'win'; textStatus = 'VICTORY'; statusColor = 'var(--success-color)'; }
                               else if (draw) { cls += 'draw'; textStatus = 'DRAW'; statusColor = 'var(--warning-color)'; }
                               else { cls += 'loss'; textStatus = match.my_forfeit ? 'FORFEITED' : 'DEFEAT'; statusColor = 'var(--danger-color)'; }
                           } else {
                               textStatus = match.status;
                               statusColor = 'var(--text-secondary)';
                           }

                           return (
                               <div key={match.match_id} className={`history-item ${cls}`} onClick={() => navigate('/room/' + match.match_id)} style={{cursor: 'pointer'}}>
                                    <div>
                                        <div style={{display:'flex', alignItems:'center', gap:'0.75rem'}}>
                                            <span style={{fontWeight:700, color: statusColor, fontSize:'0.85rem'}}>{textStatus}</span>
                                            {match.type !== 'SOLO' && (
                                                <span style={{color:'var(--text-secondary)', fontSize:'0.8rem', fontWeight: isMe ? 800 : 400}}>
                                                    vs {isMe ? (
                                                        'You'
                                                    ) : (
                                                        <a href={`/profile/${match.opp_handle}`} 
                                                           onClick={e => e.stopPropagation()} 
                                                           style={{color:'var(--accent-color)', textDecoration:'none', fontWeight: 600}}>
                                                            {match.opp_handle || '—'}
                                                        </a>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{margin:0, fontSize:'0.75rem', color:'#4b5563', marginTop:'0.2rem'}}>
                                            {new Date(match.created_at).toLocaleString()} • {match.type} • {match.time_limit}min
                                        </p>
                                    </div>
                                    <div style={{textAlign:'right'}}>
                                        {match.type === 'SOLO' ? (
                                            <span style={{fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.9rem', color:'var(--success-color)'}}>
                                                Solved: {match.my_problems ?? 0}
                                            </span>
                                        ) : (
                                            <>
                                                <span style={{fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'1.1rem'}}>
                                                    {match.my_score ?? 0}
                                                </span>
                                                <span style={{color:'var(--text-secondary)', margin:'0 0.25rem'}}>–</span>
                                                <span style={{fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'1.1rem', color:'var(--text-secondary)'}}>
                                                    {match.opp_score ?? 0}
                                                </span>
                                            </>
                                        )}
                                    </div>
                               </div>
                           )
                       })}
                   </div>
                </div>
            )}
        </div>
    );
}
