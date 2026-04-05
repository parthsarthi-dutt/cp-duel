import { useState, useEffect } from 'react';
import { Shield, Verified, Trophy, History as HistoryIcon, Swords, Target, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config';

export default function Dashboard({ user, setUser, token }) {
    const [handle, setHandle] = useState(user.cf_handle || '');
    const [cfToken, setCfToken] = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetch(`${API_BASE_URL}/auth/history`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setHistory(data); })
        .catch(console.error);
    }, [token]);

    const startVerification = async (e) => {
        e.preventDefault();
        if(!handle) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/verify-cf-start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ handle })
            });
            const data = await res.json();
            if(data.token) setCfToken(data.token);
            else alert(data.error);
        } catch(e) { alert("Error starting verification."); }
        setLoading(false);
    }

    const checkVerification = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/verify-cf-check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ handle })
            });
            const data = await res.json();
            if(data.success) {
                alert('Account verified!');
                setUser({...user, cf_verified: true, cf_handle: handle});
            } else alert("Failed: " + (data.error || 'Unknown error'));
        } catch (e) { alert("Verification error."); }
        setLoading(false);
    }

    const totalMatches = user.matches_won + user.matches_lost + (user.matches_drawn || 0);

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            
            {!user.cf_verified && (
                <div className="card" style={{borderColor: 'var(--warning-color)', marginBottom: '1.5rem'}}>
                    <h2 style={{color: 'var(--warning-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom:'1rem', fontSize:'1.2rem'}}>
                        <Shield size={20} /> Identity Verification Required
                    </h2>
                    
                    {!cfToken ? (
                        <form onSubmit={startVerification}>
                            <p style={{marginBottom: '1rem', color: 'var(--text-secondary)', fontSize:'0.9rem'}}>
                                Prove ownership of your Codeforces account to start competing.
                            </p>
                            <label className="label">Codeforces Handle</label>
                            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} required />
                            <button type="submit" disabled={loading} style={{marginTop:'1rem'}}>{loading ? 'Generating...' : 'Start Verification'}</button>
                        </form>
                    ) : (
                        <div>
                            <p style={{background: 'rgba(245, 158, 11, 0.08)', padding: '1rem', borderRadius: '10px', color: 'var(--warning-color)', fontSize:'0.9rem', lineHeight:'1.8'}}>
                                1. Go to Codeforces Problem <b>4A (Watermelon)</b><br/>
                                2. Submit any intentional <b>Compilation Error</b> (e.g. typing random text).<br/>
                                3. Click verify below within 10 minutes.
                            </p>
                            <button onClick={checkVerification} disabled={loading} style={{marginTop: '1rem'}}>
                                {loading ? 'Checking API...' : 'Verify Me'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="card">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                   <div>
                       <h1 style={{fontSize: '1.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                          {user.cf_verified ? user.cf_handle : "Unverified Player"}
                          {user.cf_verified && <Verified size={22} color="var(--success-color)" />}
                       </h1>
                       <p style={{color: 'var(--text-secondary)', fontSize:'0.85rem', marginTop:'0.25rem'}}>{user.email}</p>
                   </div>
                </div>

                <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginTop: '1.5rem'}}>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--warning-color)'}}>{user.trophies || 0}</div>
                        <div className="stat-label">Trophies</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--success-color)'}}>{user.matches_won}</div>
                        <div className="stat-label">Wins</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--danger-color)'}}>{user.matches_lost}</div>
                        <div className="stat-label">Losses</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--warning-color)'}}>{user.matches_drawn || 0}</div>
                        <div className="stat-label">Draws</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{color:'var(--info-color)'}}>{user.problems_solved || 0}</div>
                        <div className="stat-label">Solved</div>
                    </div>
                </div>
            </div>

            {history.length > 0 && (
                <div className="card" style={{marginTop: '1.5rem'}}>
                   <h2 style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1rem', fontSize:'1.2rem'}}>
                       <HistoryIcon size={20}/> Match History
                   </h2>

                   <div style={{display:'flex', flexDirection:'column', gap:'0.5rem'}}>
                       {history.map(match => {
                           const won = match.winner_id === user.id;
                           const draw = match.status === 'FINISHED' && !match.winner_id;
                           const invalid = match.status === 'INVALIDATED';
                           
                           let cls = '';
                           let textStatus = '';
                           let statusColor = '';

                           if (match.type === 'SOLO') {
                               textStatus = 'SOLO PREP';
                               statusColor = 'var(--info-color)';
                               cls = 'solo';
                           } else if (invalid) {
                               textStatus = 'INVALIDATED';
                               statusColor = 'var(--text-secondary)';
                           } else if (match.status === 'FINISHED') {
                               if (won) { cls = 'win'; textStatus = 'VICTORY'; statusColor = 'var(--success-color)'; }
                               else if (draw) { cls = 'draw'; textStatus = 'DRAW'; statusColor = 'var(--warning-color)'; }
                               else { cls = 'loss'; textStatus = match.my_forfeit ? 'FORFEITED' : 'DEFEAT'; statusColor = 'var(--danger-color)'; }
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
                                                <span style={{color:'var(--text-secondary)', fontSize:'0.8rem'}}>
                                                    vs <a href={`/profile/${match.opp_handle}`} 
                                                          onClick={e => e.stopPropagation()} 
                                                          style={{color:'var(--accent-color)', textDecoration:'none', fontWeight: 600}}>
                                                        {match.opp_handle || '—'}
                                                    </a>
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
