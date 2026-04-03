import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Swords } from 'lucide-react';

export default function Login({ setToken, setUser }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
     const t = searchParams.get('token');
     if (t) {
        localStorage.setItem('token', t);
        setToken(t);
     }
  }, [searchParams, setToken]);

  const handleMockLogin = async (e) => {
    e.preventDefault();
    if(!email) return;
    setLoading(true);
    try {
        const res = await fetch('http://localhost:3000/auth/mock-login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.token) {
            localStorage.setItem('token', data.token);
            setUser(data.user);
            setToken(data.token);
        }
    } catch(err) { alert('Login failed. Is the backend running?'); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '400px', margin: '10rem auto', width: '100%' }}>
      <div className="card" style={{textAlign: 'center'}}>
        <div style={{marginBottom:'1.5rem'}}>
            <Swords size={40} color="var(--accent-color)" />
        </div>
        <h1 className="title" style={{fontSize:'1.8rem', marginBottom:'0.5rem'}}>CP Duel</h1>
        <p className="subtitle" style={{marginBottom:'1.5rem'}}>Sign in to start competing</p>

        <form onSubmit={handleMockLogin}>
           <div className="form-group">
               <input 
                  type="email" 
                  placeholder="your@email.com" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
               />
           </div>
           <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Quick Sign In'}</button>
        </form>

        <p style={{margin: '1.5rem 0 0', color: '#4b5563', fontSize:'0.8rem'}}>
          For production, use Google OAuth instead.
        </p>
      </div>
    </div>
  );
}
