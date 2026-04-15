const { supabase, supabaseAdmin } = require('./supabase.service');

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
  // 1. Convert the internal videoPath into a full public URL
  const { data: publicUrlData } = supabase.storage
    .from('maven-videos')
    .getPublicUrl(videoPath);

  const videoUrl = publicUrlData.publicUrl;

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
  const { error: resultError } = await supabaseAdmin
    .from('analysis_results')
    .insert({
      job_id: jobId,
      verdict: verdict,
      raw_results: rawResults
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

  const { data, error } = supabaseAdmin.from('analysis_jobs').eq('id', jobId)
    .update({ status: "FAILED", error_message: errorMessage })
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
async function getJobWithResult(jobId, userId) {
  // Logic here
}

/**
 * Fetches the last 50 jobs for a user
 * @param {string} userId - ID of the user
 * @returns {Promise<Array>} Array of jobs
 */
async function getUserJobHistory(userId) {
  // Logic here
}

module.exports = {
  uploadVideoToStorage,
  createAnalysisJob,
  saveAnalysisResult,
  markJobFailed,
  getJobWithResult,
  getUserJobHistory
};
