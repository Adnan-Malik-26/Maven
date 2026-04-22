const { supabase, supabaseAdmin } = require('./supabase.service');
const { logger } = require('../utils/logger');

/**
 * Sign up a new user with Supabase Auth.
 * Manually saves the created user to the public.users table.
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

  // If Supabase created the user, explicitly push it into the public.users table using the Admin role
  if (data && data.user) {
    const { error: dbError } = await supabaseAdmin.from('users').insert({
      id: data.user.id,
      email: data.user.email,
      first_name: firstName,
      last_name: lastName
    });

    if (dbError) {
      logger.error(`Trigger bypass failed, couldn't insert into public.users: ${dbError.message}`);
      throw new Error(`Failed to initialize user profile database: ${dbError.message}`);
    }
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
