// Centralized API configuration
// During development, this will point to localhost.
// When deployed via Cloudflare Tunnel, we will update this to your public domain.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default API_BASE_URL;
