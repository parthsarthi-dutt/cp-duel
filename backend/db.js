const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://cp_duel_user:password123@127.0.0.1:5532/cp_duel'
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client:', err.stack);
  } else {
    console.log('Successfully connected to the PostgreSQL database!');
    release();
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
