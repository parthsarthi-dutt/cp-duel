import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Home from './pages/Home';
import DuelRoom from './pages/DuelRoom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leagues from './pages/Leagues';
import SoloPrep from './pages/SoloPrep';
import PublicProfile from './pages/PublicProfile';
import Friends from './pages/Friends';
import { io } from 'socket.io-client';
import { Bell, Heart, Users, Search, UserPlus, Check, X } from 'lucide-react';
import './index.css';
import API_BASE_URL from './config';

function NavBar({ user, invites, onAccept, onDecline }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'active' : '';
  const [showInvites, setShowInvites] = useState(false);

  return (
    <nav className="navbar">
      <div style={{display: 'flex', alignItems: 'center', gap: '2rem'}}>
        <span className="brand">⚔ CP Duel</span>
        <div className="nav-links">
          <a href="/" className={isActive('/')}>Arena</a>
          <a href="/solo" className={isActive('/solo')}>Solo Prep</a>
          <a href="/leagues" className={isActive('/leagues')}>Leagues</a>
          <a href="/friends" className={isActive('/friends')}>Friends</a>
          <a href="/dashboard" className={isActive('/dashboard')}>Profile</a>
        </div>
      </div>
      <div className="nav-user" style={{gap: '1rem'}}>
         <div style={{position: 'relative'}}>
            <button 
              className="icon-btn" 
              onClick={() => setShowInvites(!showInvites)}
              style={{background: 'transparent', border: 'none', color: invites.length > 0 ? 'var(--accent-color)' : 'var(--text-secondary)', position: 'relative'}}
            >
              <Bell size={20} />
              {invites.length > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5, background: 'var(--danger-color)', 
                  color: 'white', borderRadius: '50%', width: '18px', height: '18px', 
                  fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{invites.length}</span>
              )}
            </button>
            
            {showInvites && (
              <div className="card shadow" style={{
                position: 'absolute', top: '100%', right: 0, width: '300px', zIndex: 1000, 
                marginTop: '10px', padding: '0.5rem', maxHeight: '400px', overflowY: 'auto'
              }}>
                <h4 style={{margin: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem'}}>Notifications</h4>
                {invites.length === 0 ? (
                  <p style={{padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>No new notifications</p>
                ) : (
                  invites.map(inv => (
                    <div key={inv.id} style={{
                      padding: '0.75rem', borderBottom: '1px solid var(--border-color)', 
                      display: 'flex', flexDirection: 'column', gap: '0.5rem'
                    }}>
                      <p style={{margin: 0, fontSize: '0.85rem'}}>
                        <strong>{inv.sender_handle}</strong> sent you a <strong>{inv.type}</strong> invitation.
                      </p>
                      <div style={{display: 'flex', gap: '0.5rem'}}>
                        <button 
                          onClick={() => { onAccept(inv); setShowInvites(false); }}
                          style={{padding: '4px 8px', width: 'auto', fontSize: '0.7rem', background: 'var(--success-color)'}}
                        >Accept</button>
                        <button 
                          onClick={() => { onDecline(inv); setShowInvites(false); }}
                          style={{padding: '4px 8px', width: 'auto', fontSize: '0.7rem', background: 'var(--danger-color)'}}
                        >Decline</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
         </div>
         {user.cf_verified && <span className="handle" style={{margin:0}}>{user.cf_handle}</span>}
         <button style={{padding: '0.4rem 0.8rem', width: 'auto', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)'}} onClick={() => {
           localStorage.removeItem('token');
           window.location.href='/login';
         }}>Logout</button>
      </div>
    </nav>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [invites, setInvites] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => {
      if(!res.ok) throw new Error();
      return res.json();
    })
    .then(data => {
      setUser(data);
      setLoading(false);
      
      // Initialize global socket
      const s = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
      s.emit('registerUser', { userId: data.id });
      setSocket(s);

      // Fetch existing invitations
      fetch(`${API_BASE_URL}/social/invitations`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(d => { if(Array.isArray(d)) setInvites(d); });

      s.on('newInvitation', (inv) => {
        setInvites(prev => [inv, ...prev]);
        // Simple alert or toast could go here
      });

      s.on('inviteAccepted', ({ type, targetId }) => {
         if (type === 'MATCH') {
            window.location.href = `/room/${targetId}`;
         }
      });
    })
    .catch(() => {
      localStorage.removeItem('token');
      setToken(null);
      setLoading(false);
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, [token]);

  const handleAcceptInvite = async (inv) => {
    try {
      const res = await fetch(`${API_BASE_URL}/social/accept-invite/${inv.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setInvites(prev => prev.filter(i => i.id !== inv.id));
        if (inv.type === 'MATCH') {
           window.location.href = `/room/${inv.target_id}`;
        } else if (inv.type === 'LEAGUE') {
           // Explicitly trigger the join logic in the league module
           await fetch(`${API_BASE_URL}/api/league/join`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
             body: JSON.stringify({ leagueId: inv.target_id })
           });
           window.location.href = `/leagues/${inv.target_id}`;
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleDeclineInvite = async (inv) => {
    try {
      const res = await fetch(`${API_BASE_URL}/social/decline-invite/${inv.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setInvites(prev => prev.filter(i => i.id !== inv.id));
      }
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="container" style={{justifyContent: 'center', alignItems: 'center'}}><h2 style={{color:'var(--accent-color)'}}>Loading...</h2></div>;

  return (
    <Router>
      <div className="container">
        {user && <NavBar user={user} invites={invites} onAccept={handleAcceptInvite} onDecline={handleDeclineInvite} />}
        <Routes>
          <Route path="/login" element={!token ? <Login setToken={setToken} setUser={setUser} /> : <Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={token ? <Dashboard user={user} setUser={setUser} token={token} /> : <Navigate to="/login" />} />
          <Route path="/" element={token ? <Home user={user} token={token} /> : <Navigate to="/login" />} />
          <Route path="/solo" element={token ? <SoloPrep user={user} token={token} /> : <Navigate to="/login" />} />
          <Route path="/friends" element={token ? <Friends user={user} token={token} socket={socket} /> : <Navigate to="/login" />} />
          <Route path="/leagues" element={token ? <Leagues user={user} token={token} /> : <Navigate to="/login" />} />
          <Route path="/leagues/:leagueId" element={token ? <Leagues user={user} token={token} /> : <Navigate to="/login" />} />
          <Route path="/profile/:handle" element={token ? <PublicProfile currentUser={user} token={token} /> : <Navigate to="/login" />} />
          <Route path="/room/:roomId" element={token ? <DuelRoom user={user} token={token} /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
