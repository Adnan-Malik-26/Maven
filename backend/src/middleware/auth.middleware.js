const { supabase } = require('../services/supabase.service');

/**
 * Middleware to protect routes by verifying Supabase JWTs.
 * Ensures that the request comes from an authenticated remote user/agent.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    // Verify the JWT token using Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
    }

    // Attach the authenticated user to the request object so controllers can use it
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { requireAuth };
