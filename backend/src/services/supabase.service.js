const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/index.js');

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

// Optional: specific client if using service role for admin task
const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

module.exports = { supabase, supabaseAdmin };
