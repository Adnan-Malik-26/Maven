-- 1. Create the users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Analysis Jobs Table
CREATE TABLE analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSING',
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 3. Analysis Results Table
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  verdict TEXT,
  confidence FLOAT,
  fft_score FLOAT,
  liveness_score FLOAT,
  sync_score FLOAT,
  details JSONB
);

-- 4. Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies (Assuming 'user_id' represents the logged-in user via auth.uid())
-- Users can only view and edit their own user profile
CREATE POLICY "Users can only access their own profile" 
ON users FOR ALL USING (auth.uid() = id);

-- Users can only view and create their own jobs
CREATE POLICY "Users can only access their own jobs" 
ON analysis_jobs FOR ALL USING (auth.uid() = user_id);

-- Users can only view results related to their own jobs
CREATE POLICY "Users can access results for their jobs"
ON analysis_results FOR ALL USING (
  EXISTS (
    SELECT 1 FROM analysis_jobs
    WHERE analysis_jobs.id = analysis_results.job_id
    AND analysis_jobs.user_id = auth.uid()
  )
);
