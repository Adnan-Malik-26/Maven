const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runTest() {
  console.log('[1] Logging in with the test user...');
  const res = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      email: 'test-agent-1775672252986@example.com', 
      password: 'SecurePassword123!' 
    })
  });
  
  const authData = await res.json();
  if (res.status !== 200) {
    console.log("❌ LOGIN FAILED", authData);
    return;
  }
  
  const token = authData.data.session.access_token;
  console.log('✅ LOGIN SUCCESSFUL. Got token.');

  console.log('[2] Making sure the bucket maven-videos exists...');
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.find(b => b.name === 'maven-videos')) {
      console.log('Bucket not found. Creating bucket maven-videos...');
      await supabaseAdmin.storage.createBucket('maven-videos', { public: true });
  }

  console.log('[3] Uploading dummy video to /api/analysis/submit...');
  // Create a 1MB dummy video buffer
  const dummyBuffer = Buffer.alloc(1024 * 1024, 'a');
  const dummyBlob = new Blob([dummyBuffer], { type: 'video/mp4' });
  
  const form = new FormData();
  form.append('video', dummyBlob, 'dummy-video.mp4');

  const uploadRes = await fetch('http://localhost:4000/api/analysis/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
      // Do not set Content-Type manually, FormData sets the multipart boundary automatically inside fetch
    },
    body: form
  });

  const uploadData = await uploadRes.json();
  if (uploadRes.status === 200) {
    console.log('✅ UPLOAD SUCCESS!');
    console.log(uploadData);
  } else {
    console.log('❌ UPLOAD FAILED:', uploadRes.status, uploadData);
  }
}

runTest();
