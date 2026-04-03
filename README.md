# ⚔ CP Duel — The Ultimate Competitive Programming Arena


**CP Duel** is a real-time, peer-to-peer competitive programming platform designed for speed, social interaction, and tournament-style play. Whether you're grinding for Codeforces rating or challenging friends to 1v1 blitzes, CP Duel provides the perfect environment for sharp, high-stakes coding.

---

## 🚀 Key Features

### 🏟 Arena (1v1 Duels)
- **Real-time 1v1**: Challenge opponents or join casual rooms for high-intensity coding duels.
- **WebSocket Driven**: Instant updates on problem solving, forfeits, and match status.
- **Dynamic Rating Filters**: Set match difficulty based on Codeforces rating ranges (800–3500).

### 🏆 Leagues & Tournaments
- **Round-Robin System**: Create private leagues for up to 20 players with automated scheduling.
- **Live Standings**: Real-time points tracking, wins/losses/draws, and problems-solved metrics.
- **Mid-Tournament Joins**: Invite friends even after a league has started; the system automatically schedules the remaining catch-up matches.

### 🧠 Solo Prep
- **Focused Practice**: All the intensity of a duel, but it's just you and the clock.
- **Personal History**: Track your solo solving stats separately from your 1v1 record.

### 🤝 Social & Notifications
- **Friends System**: Send and receive friend requests.
- **Instant Invites**: Invite friends directly to your Arena rooms or League tournaments via global notifications.
- **Global Profiles**: Public profiles showing trophies, match history, and head-to-head records.

### 📜 Persistent Match History
- **Detailed Logs**: Review past matches with fully re-hydrated event logs showing exactly when each player solved a problem.
- **Problem Analysis**: Direct links to Codeforces problems and the specific submissions that won the match.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Lucide-React, CSS3 (Custom Design System)
- **Backend**: Node.js, Express, Socket.io
- **Database**: PostgreSQL (Relational consistency for match history and leagues)
- **External API**: Codeforces API integration for real-time submission verification

---

## 📦 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- [Docker & Docker Compose](https://www.docker.com/) (For PostgreSQL)

### 1. Clone the repository
```bash
git clone https://github.com/your-username/cp-duel.git
cd cp-duel
```

### 2. Start the Database
```bash
docker-compose up -d
```

### 3. Setup Backend
```bash
cd backend
npm install
node server.js
```

### 4. Setup Frontend
```bash
cd ../frontend
npm install
npm run dev
```

---

## 🎨 Professional Aesthetic
Designed with a "Premium Dark" aesthetic, CP Duel focuses on clarity and speed:
- **Glassmorphism UI**: High-contrast, sleek interface for distraction-free coding.
- **Responsive Layout**: Works seamlessly across desktops and tablets.
- **Micro-animations**: Subtle interactions for a premium, alive feel.

---

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License
This project is licensed under the MIT License.
