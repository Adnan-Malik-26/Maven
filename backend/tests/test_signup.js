require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runTest() {
  const testEmail = `test-agent-${Date.now()}@example.com`;
  console.log(`[1] Sending POST to local backend to sign up: ${testEmail}`);
  
  try {
    const res = await fetch('http://localhost:4000/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'SecurePassword123!',
        firstName: 'Agent',
        lastName: 'Tester'
      })
    });
    
    const json = await res.json();
    console.log('[API Result]:', json);

    if (res.status === 201 || res.status === 200) {
      console.log(`\n[2] Successful Signup! Waiting 2 seconds for Postgres Trigger to fire...`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`\n[3] Checking public.users in Supabase for ${testEmail}...`);
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', testEmail);

      if (error) {
        console.error("Supabase Error checking public.users:", error.message);
      } else if (data && data.length > 0) {
        console.log("✅ SUCCESS! User found in public.users:");
        console.log(data[0]);
      } else {
        console.log("❌ FAILED! The API succeeded but the user is MISSING from public.users. Did you execute the auth_trigger.sql in your Supabase Dashboard?");
      }
    }
  } catch (err) {
    console.error("Test Script Error:", err);
  }
}

runTest();
