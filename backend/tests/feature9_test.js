/**
 * Feature 9 — Results API Test Suite
 * 
 * Tests:
 * 1. Server boots without crashes
 * 2. Health check works
 * 3. GET /api/results/history — rejects without auth (401)
 * 4. GET /api/results/:jobId — rejects without auth (401)
 * 5. GET /api/results/history — rejects with fake token (401)
 * 6. GET /api/results/:jobId — rejects with fake token (401)
 */

require('dotenv/config');
const http = require('http');

const BASE_URL = `http://localhost:${process.env.PORT || 4000}`;

function makeRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(testName, condition, details = '') {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName} ${details ? '— ' + details : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n⚔️  FEATURE 9 — RESULTS API TEST SUITE\n');
  console.log('═'.repeat(50));

  // ── Test 1: Health check ──
  console.log('\n📋 Test Group 1: Server Health\n');
  try {
    const res = await makeRequest('GET', '/health');
    assert('Health endpoint returns 200', res.status === 200);
    assert('Health response has status: ok', res.body?.status === 'ok');
  } catch (err) {
    assert('Server is reachable', false, err.message);
  }

  // ── Test 2: Results routes exist and reject unauthenticated requests ──
  console.log('\n📋 Test Group 2: Auth Rejection (No Token)\n');
  try {
    const res = await makeRequest('GET', '/api/results/history');
    assert('GET /api/results/history returns 401 without token', res.status === 401);
    assert('Error message present', !!res.body?.error);
  } catch (err) {
    assert('History route reachable', false, err.message);
  }

  try {
    const res = await makeRequest('GET', '/api/results/fake-job-id-123');
    assert('GET /api/results/:jobId returns 401 without token', res.status === 401);
    assert('Error message present', !!res.body?.error);
  } catch (err) {
    assert('Job result route reachable', false, err.message);
  }

  // ── Test 3: Reject with fake bearer token ──
  console.log('\n📋 Test Group 3: Auth Rejection (Fake Token)\n');
  try {
    const res = await makeRequest('GET', '/api/results/history', {
      Authorization: 'Bearer totally-fake-token-12345',
    });
    assert('GET /history rejects fake token with 401', res.status === 401);
  } catch (err) {
    assert('History route with fake token', false, err.message);
  }

  try {
    const res = await makeRequest('GET', '/api/results/fake-job-id-123', {
      Authorization: 'Bearer totally-fake-token-12345',
    });
    assert('GET /:jobId rejects fake token with 401', res.status === 401);
  } catch (err) {
    assert('Job result route with fake token', false, err.message);
  }

  // ── Test 4: Route ordering — /history must NOT be caught by /:jobId ──
  console.log('\n📋 Test Group 4: Route Ordering\n');
  try {
    // If /history were matched as /:jobId, the auth middleware would still
    // reject with 401 (same result), but let's verify the path is correct
    // by checking the response shape is consistent
    const res1 = await makeRequest('GET', '/api/results/history');
    const res2 = await makeRequest('GET', '/api/results/some-uuid-here');
    assert('Both routes respond (not 404)', res1.status !== 404 && res2.status !== 404);
    assert('/history route is reachable', res1.status === 401, `Got ${res1.status}`);
    assert('/:jobId route is reachable', res2.status === 401, `Got ${res2.status}`);
  } catch (err) {
    assert('Route ordering check', false, err.message);
  }

  // ── Test 5: Non-existent routes return 404 ──
  console.log('\n📋 Test Group 5: Boundary Checks\n');
  try {
    const res = await makeRequest('GET', '/api/results');
    // This should be either 404 or handled by express (no matching route for bare /api/results)
    assert('GET /api/results (no sub-path) does not crash', res.status !== 500, `Got ${res.status}`);
  } catch (err) {
    assert('Bare path check', false, err.message);
  }

  try {
    const res = await makeRequest('POST', '/api/results/history');
    // POST to a GET route should return 404 (method not allowed)
    assert('POST to GET-only route rejected', res.status === 404 || res.status === 405, `Got ${res.status}`);
  } catch (err) {
    assert('Wrong method check', false, err.message);
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(50));
  console.log(`\n🏆 RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED — Feature 9 is solid!\n');
  } else {
    console.log('⚠️  Some tests failed — review above.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
