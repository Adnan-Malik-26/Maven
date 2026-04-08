const { supabase } = require('./supabase.service');

/**
 * Sign up a new user with Supabase Auth.
 * The PostgreSQL trigger will automatically sync them to public.users!
 */
async function signUp(email, password, firstName, lastName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (error) {
    throw new Error(`SignUp Error: ${error.message}`);
  }

  return data;
}

/**
 * Sign in an existing user.
 */
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`SignIn Error: ${error.message}`);
  }

  return data;
}

/**
 * Send a password reset email to the user.
 */
async function sendPasswordResetEmail(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    // You can redirect to the frontend change-password page here later!
    // redirectTo: 'http://localhost:3000/update-password',
  });

  if (error) {
    throw new Error(`Password Reset Error: ${error.message}`);
  }

  return data;
}

/**
 * Update the user's password using the token or current session.
 */
async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) {
    throw new Error(`Update Password Error: ${error.message}`);
  }

  return data;
}

/**
 * Log out the currently authenticated user.
 */
async function signOut(token) {
  const { error } = await supabase.auth.signOut(token);
  
  if (error) {
    throw new Error(`SignOut Error: ${error.message}`);
  }
}

module.exports = {
  signUp,
  signIn,
  sendPasswordResetEmail,
  updatePassword,
  signOut
};
