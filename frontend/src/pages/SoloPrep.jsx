import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ShieldAlert } from 'lucide-react';
import API_BASE_URL from '../config';

export default function SoloPrep({ user, token }) {
  const [timeLimit, setTimeLimit] = useState('45');
  const [ratingMin, setRatingMin] = useState('800');
  const [ratingMax, setRatingMax] = useState('1200');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateSoloMatch = async (e) => {
    e.preventDefault();
    if (!user.cf_verified) return alert('Verify your CF account first.');
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/create-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ timeLimit, ratingMin, ratingMax, type: 'SOLO' })
      });
      const data = await res.json();
      if(data.roomId) navigate(`/room/${data.roomId}`);
      else alert('Error: ' + data.error);
    } catch (error) {
      alert('Error: ' + error.message);
    } finally { setLoading(false); }
  };

  if (!user.cf_verified) {
      return (
        <div style={{ maxWidth: '500px', margin: '4rem auto', width: '100%', textAlign:'center' }}>
           <div className="card" style={{borderColor: 'var(--danger-color)'}}>
              <ShieldAlert size={48} color="var(--danger-color)" style={{marginBottom:'1rem'}}/>
              <h2 style={{color: 'var(--danger-color)', marginBottom:'0.5rem', fontSize:'1.4rem'}}>Verification Required</h2>
              <p style={{color:'var(--text-secondary)', marginBottom:'1.5rem', fontSize:'0.9rem'}}>Verify your Codeforces account to start practicing.</p>
              <button onClick={() => navigate('/dashboard')}>Go to Profile</button>
           </div>
        </div>
      );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto', width: '100%' }}>
      <div className="card" style={{marginBottom:'1.5rem'}}>
        <h1 className="title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #10b981, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          <Target size={32} color="#10b981" />
          Solo Preparation
        </h1>
        <p className="subtitle">Practice by yourself under time constraints</p>
        
        <form onSubmit={handleCreateSoloMatch}>
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

          <button type="submit" disabled={loading} style={{background: '#10b981'}}>
            {loading ? 'Setting up...' : 'Start Solo Practice'}
          </button>
        </form>
      </div>
    </div>
  );
}
