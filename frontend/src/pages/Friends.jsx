import { useState, useEffect } from 'react';
import { Search, UserPlus, Users, ExternalLink, Send, ShieldQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Friends({ user, token, socket }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFriends();
  }, [token]);

  const fetchFriends = async () => {
    try {
      const res = await fetch('http://localhost:3000/social/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setFriends(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`http://localhost:3000/social/search-users?q=${val}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setSearchResults(data);
    } catch (e) {
      console.error(e);
    }
  };

  const sendFriendRequest = async (receiver) => {
    try {
      const res = await fetch('http://localhost:3000/social/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          receiverId: receiver.id,
          type: 'FRIEND'
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Friend request sent to ${receiver.cf_handle}`);
        setSearchResults(prev => prev.filter(u => u.id !== receiver.id));
      } else {
        alert(data.error || "Failed to send request");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const inviteToMatch = async (friend) => {
    try {
      // Create a casual match first
      const matchRes = await fetch('http://localhost:3000/api/create-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          timeLimit: 30,
          ratingMin: 800,
          ratingMax: 3000,
          type: 'CASUAL'
        })
      });
      const matchData = await matchRes.json();
      
      if (matchRes.ok) {
        // Send invite for this match
        await fetch('http://localhost:3000/social/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            receiverId: friend.id,
            type: 'MATCH',
            targetId: matchData.roomId
          })
        });
        
        navigate(`/room/${matchData.roomId}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', paddingBottom: '2rem' }}>
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '1.2rem' }}>
          <Search size={20} color="var(--accent-color)" /> Find Players
        </h2>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search Codeforces handle..."
            value={query}
            onChange={handleSearch}
            style={{ paddingLeft: '2.5rem' }}
          />
          <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        </div>

        {searchResults.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {searchResults.map(u => (
              <div key={u.id} className="history-item" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>
                    {u.cf_handle[0].toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600 }}>{u.cf_handle}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => navigate(`/profile/${u.cf_handle}`)}
                    className="secondary"
                    style={{ padding: '0.4rem 0.8rem', width: 'auto', fontSize: '0.8rem' }}
                  >
                    View Profile
                  </button>
                  <button
                    onClick={() => sendFriendRequest(u)}
                    style={{ padding: '0.4rem 0.8rem', width: 'auto', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <UserPlus size={14} /> Add Friend
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '1.2rem' }}>
          <Users size={20} color="var(--accent-color)" /> My Friends ({friends.length})
        </h2>

        {friends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
            <ShieldQuestion size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <p>You haven't added any friends yet.</p>
            <p style={{ fontSize: '0.8rem' }}>Search for players above to start competing together!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {friends.map(f => (
              <div key={f.id} className="card shadow" style={{ padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-color), #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800 }}>
                      {f.cf_handle[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{f.cf_handle}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{f.problems_solved || 0} Solved • {f.matches_won || 0} Wins</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => navigate(`/profile/${f.cf_handle}`)}
                    className="icon-btn" 
                    style={{ padding: '4px', background: 'transparent' }}
                  >
                    <ExternalLink size={16} color="var(--text-secondary)" />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => inviteToMatch(f)}
                    style={{ flex: 1, fontSize: '0.75rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    <Send size={14} /> Invite to Duel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
