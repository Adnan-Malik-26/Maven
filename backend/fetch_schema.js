require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkSchema() {
  console.log("Fetching tables from Supabase...");
  
  const tablesToTest = ['users', 'analysis_jobs', 'analysis_results'];
  const present = [];
  const missing = [];

  for (const table of tablesToTest) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    
    // If error code is 42P01, the table doesn't exist.
    if (error && error.code === '42P01') {
      missing.push(table);
    } else {
      // It exists (might return empty data, or an RLS error, but not table missing)
      present.push({
        table,
        status: error ? `Requires Auth/RLS (${error.message})` : `Accessible (${data.length} rows previewed)`
      });
    }
  }

  console.log("--- RESULTS ---");
  console.log("PRESENT TABLES:", JSON.stringify(present, null, 2));
  console.log("MISSING TABLES:", JSON.stringify(missing, null, 2));
}

checkSchema().catch(console.error);
