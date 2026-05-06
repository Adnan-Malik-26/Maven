const { supabase, supabaseAdmin } = require('./supabase.service');

/**
 * Ensures the authenticated Supabase user exists in public.users.
 * This covers users who signed up directly through the frontend client when
 * the auth.users trigger has not been installed in Supabase yet.
 * @param {Object} user - Supabase auth user
 * @returns {Promise<Object>} The public.users row
 */
async function ensureUserProfile(user) {
  if (!user?.id || !user?.email) {
    throw new Error('Cannot initialize user profile: missing authenticated user id or email');
  }

  const profilePayload = {
    id: user.id,
    email: user.email,
    first_name: user.user_metadata?.first_name ?? null,
    last_name: user.user_metadata?.last_name ?? null,
  };

  const { error: upsertError } = await supabaseAdmin
    .from('users')
    .upsert(profilePayload, { onConflict: 'id' });

  if (upsertError) {
    throw new Error(`Failed to initialize user profile: ${upsertError.message}`);
  }

  const { data, error: selectError } = await supabaseAdmin
    .from('users')
    .select('id,email,first_name,last_name')
    .eq('id', user.id)
    .single();

  if (selectError || !data) {
    throw new Error(
      `User profile was not found after initialization for auth user ${user.id}: ${selectError?.message ?? 'no row returned'}`
    );
  }

  return data;
}

/**
 * Uploads a file to the maven-videos bucket
 * @param {Buffer} fileBuffer - The video file buffer
 * @param {string} originalName - Original filename
 * @param {string} userId - ID of the user uploading the video
 * @returns {Promise<string>} The file path in storage
 */
async function uploadVideoToStorage(fileBuffer, originalName, userId) {
  const { data, error } = await supabaseAdmin.storage.from('maven-videos').upload(`${userId}/${originalName}`, fileBuffer, {
    contentType: 'video/mp4'
  });

  if (error) {
    throw error;
  }
  return data.path;
}

/**
 * Inserts a row into analysis_jobs with status PROCESSING
 * @param {string} userId - ID of the user
 * @param {string} videoPath - Path of the video in storage
 * @returns {Promise<Object>} The new job row
 */
async function createAnalysisJob(userId, videoPath) {
  // 1. Convert the internal videoPath into a downloadable signed URL
  //    (the maven-videos bucket is private, so getPublicUrl won't work)
  const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
    .from('maven-videos')
    .createSignedUrl(videoPath, 3600); // 1 hour expiry

  if (signedUrlError) {
    throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
  }

  const videoUrl = signedUrlData.signedUrl;

  // 2. Insert into the database using supabaseAdmin to bypass backend RLS proxies
  const { data, error } = await supabaseAdmin
    .from('analysis_jobs')
    .insert({
      user_id: userId,
      video_path: videoUrl,
      status: 'PROCESSING'
    })
    .select() // Ask Supabase to return the newly inserted row
    .single(); // Ask Supabase to return only one row

  if (error) {
    throw new Error(`Failed to create analysis job: ${error.message}`);
  }

  return data;
}

/**
 * Inserts into analysis_results and updates the job status to COMPLETED
 * @param {string} jobId - ID of the analysis job
 * @param {string} verdict - The final verdict (e.g., FAKE or REAL)
 * @param {Object} rawResults - The detailed ML scores
 * @returns {Promise<Object>} The completed job + results
 */
async function saveAnalysisResult(jobId, verdict, rawResults) {
  // 1. Insert the result into the analysis_results table
  // Map the aggregator output to the DB schema columns
  const { error: resultError } = await supabaseAdmin
    .from('analysis_results')
    .insert({
      job_id: jobId,
      verdict: rawResults.verdict ?? verdict,
      confidence: rawResults.confidence ?? null,
      fft_score: rawResults.breakdown?.fft?.rawScore ?? null,
      liveness_score: rawResults.breakdown?.liveness?.rawScore ?? null,
      sync_score: rawResults.breakdown?.lipsync?.rawScore ?? null,
      // Store the full aggregator output in a JSONB column for the frontend
      details: rawResults,
    });

  if (resultError) {
    throw new Error(`Failed to save analysis result: ${resultError.message}`);
  }

  // 2. Update the analysis_jobs table to set status to COMPLETED
  const { data: jobData, error: jobError } = await supabaseAdmin
    .from('analysis_jobs')
    .update({ status: 'COMPLETED' })
    .eq('id', jobId)
    .select()
    .single();

  if (jobError) {
    throw new Error(`Failed to update job status: ${jobError.message}`);
  }

  return { ...jobData, verdict, rawResults };
}

/**
 * Updates the job status to FAILED
 * @param {string} jobId - ID of the analysis job
 * @param {string} errorMessage - The error message
 * @returns {Promise<Object>} The updated job row
 */
async function markJobFailed(jobId, errorMessage) {

  const { data, error } = await supabaseAdmin
    .from('analysis_jobs')
    .update({ status: 'FAILED', error_message: errorMessage })
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark job as failed: ${error.message}`);
  }
  return data;
}

/**
 * Fetches a job + its result (joined), filtered by userId
 * @param {string} jobId - ID of the analysis job
 * @param {string} userId - ID of the user
 * @returns {Promise<Object>} The joined job and result data
 */


// function use it to check if the video analysis is completed or not.
// if completed then return the result

async function getJobWithResult(jobId, userId) {
  const { data, error } = await supabaseAdmin.from('analysis_jobs')
    .select('*, analysis_results(*)')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to get job with results: ${error.message}`);
  }

  return data;
}

async function getJobStatus(jobId, userId) {
  const { data, error } = await supabaseAdmin.from('analysis_jobs')
    .select('id,status,error_message,created_at')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to get job status: ${error.message}`);
  }

  return data;
}

/**
 * Fetches the last 50 jobs for a user
 * @param {string} userId - ID of the user
 * @returns {Promise<Array>} Array of jobs
 */
async function getUserJobHistory(userId) {
  const { data, error } = await supabaseAdmin.from('analysis_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to get user job history: ${error.message}`);
  }
  return data;
}

module.exports = {
  ensureUserProfile,
  uploadVideoToStorage,
  createAnalysisJob,
  saveAnalysisResult,
  markJobFailed,
  getJobStatus,
  getJobWithResult,
  getUserJobHistory
};
