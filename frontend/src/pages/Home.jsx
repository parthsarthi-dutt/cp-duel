import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swords, ShieldAlert } from 'lucide-react';
import API_BASE_URL from '../config';

export default function Home({ user, token }) {
  const [timeLimit, setTimeLimit] = useState('45');
  const [ratingMin, setRatingMin] = useState('800');
  const [ratingMax, setRatingMax] = useState('1200');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!user.cf_verified) return alert('Verify your CF account first.');
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/create-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ timeLimit, ratingMin, ratingMax })
      });
      const data = await res.json();
      if(data.roomId) navigate(`/room/${data.roomId}`);
      else alert('Error: ' + data.error);
    } catch (error) {
      alert('Error: ' + error.message);
    } finally { setLoading(false); }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!joinRoomId) return;
    navigate(`/room/${joinRoomId}`);
  };

  if (!user.cf_verified) {
      return (
        <div style={{ maxWidth: '500px', margin: '4rem auto', width: '100%', textAlign:'center' }}>
           <div className="card" style={{borderColor: 'var(--danger-color)'}}>
              <ShieldAlert size={48} color="var(--danger-color)" style={{marginBottom:'1rem'}}/>
              <h2 style={{color: 'var(--danger-color)', marginBottom:'0.5rem', fontSize:'1.4rem'}}>Verification Required</h2>
              <p style={{color:'var(--text-secondary)', marginBottom:'1.5rem', fontSize:'0.9rem'}}>Verify your Codeforces account to start dueling.</p>
              <button onClick={() => navigate('/dashboard')}>Go to Profile</button>
           </div>
        </div>
      );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto', width: '100%' }}>
      <div className="card" style={{marginBottom:'1.5rem'}}>
        <h1 className="title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Swords size={32} color="var(--accent-color)" />
          Create Duel
        </h1>
        <p className="subtitle">Set up a 1v1 Codeforces battle</p>
        
        <form onSubmit={handleCreateRoom}>
          <div className="form-group">
            <label className="label">Match Duration</label>
            <select value={timeLimit} onChange={e => setTimeLimit(e.target.value)}>
              <option value="15">15 Minutes</option>
              <option value="30">30 Minutes</option>
              <option value="45">45 Minutes</option>
              <option value="60">60 Minutes</option>
            </select>
          </div>

          <div className="grid">
            <div className="form-group">
              <label className="label">Min Rating</label>
              <input type="number" min="800" max="3500" step="100" value={ratingMin} onChange={e => setRatingMin(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Max Rating</label>
              <input type="number" min="800" max="3500" step="100" value={ratingMax} onChange={e => setRatingMax(e.target.value)} />
            </div>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Duel Room'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{fontSize:'1.2rem', fontWeight:700, marginBottom:'1rem'}}>Join Existing Room</h2>
        <form onSubmit={handleJoinRoom}>
            <div className="form-group">
                <label className="label">Room ID</label>
                <input type="text" placeholder="Paste room ID from your friend" value={joinRoomId} onChange={e => setJoinRoomId(e.target.value)} required />
            </div>
            <button type="submit" style={{background:'var(--success-color)'}}>Join Room</button>
        </form>
      </div>
    </div>
  );
}
