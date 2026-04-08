const authService = require('../services/auth.service');

async function handleSignUp(req, res) {
  try {
    const { email, password, firstName, lastName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const data = await authService.signUp(email, password, firstName, lastName);
    return res.status(201).json({ message: 'User registered successfully', data });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function handleLogin(req, res) {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const data = await authService.signIn(email, password);
    return res.status(200).json({ message: 'Logged in successfully', data });
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
}

async function handlePasswordResetRequest(req, res) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await authService.sendPasswordResetEmail(email);
    return res.status(200).json({ message: 'Password reset link sent to email' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function handleUpdatePassword(req, res) {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const data = await authService.updatePassword(newPassword);
    return res.status(200).json({ message: 'Password updated successfully', data });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function handleLogout(req, res) {
  try {
    // If the token is passed in headers (like for requireAuth middleware)
    const token = req.headers.authorization?.split(' ')[1];
    
    await authService.signOut(token);
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

module.exports = {
  handleSignUp,
  handleLogin,
  handlePasswordResetRequest,
  handleUpdatePassword,
  handleLogout
};
