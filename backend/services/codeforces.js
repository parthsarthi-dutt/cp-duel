const axios = require('axios');

let problemSet = [];

async function initCodeforces() {
  try {
    const response = await axios.get('https://codeforces.com/api/problemset.problems');
    if (response.data.status === 'OK') {
      problemSet = response.data.result.problems;
      console.log(`Loaded ${problemSet.length} problems from Codeforces.`);
    }
  } catch (error) {
    console.error("Failed to load Codeforces problems:", error.message);
  }
}

async function getUserSubmissions(handle) {
  try {
    const response = await axios.get(`https://codeforces.com/api/user.status?handle=${handle}`);
    if (response.data.status === 'OK') {
      return response.data.result;
    }
  } catch (error) {
    console.warn(`Failed to fetch submissions for ${handle}:`, error.message);
  }
  return [];
}

async function getRecentSubmissions(handle, count = 5) {
  try {
    const response = await axios.get(`https://codeforces.com/api/user.status?handle=${handle}&count=${count}`);
    if (response.data.status === 'OK') {
      return response.data.result;
    }
  } catch (error) {
    console.warn(`Failed to fetch recent submissions for ${handle}:`, error.message);
  }
  return [];
}

function getRandomProblem(minRating, maxRating, excludedProblemIds) {
  const validProblems = problemSet.filter(p => {
    if (!p.rating || p.rating < minRating || p.rating > maxRating) return false;
    const pId = `${p.contestId}-${p.index}`;
    if (excludedProblemIds.has(pId)) return false;
    return true;
  });

  if (validProblems.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * validProblems.length);
  return validProblems[randomIndex];
}

module.exports = {
  initCodeforces,
  getUserSubmissions,
  getRecentSubmissions,
  getRandomProblem
};
