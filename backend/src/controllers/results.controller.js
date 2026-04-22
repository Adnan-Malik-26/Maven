const { supabaseAdmin } = require('../services/supabase.service');

/**
 * GET /api/results/:jobId
 * Returns the analysis result for a job, with ownership check.
 */
async function getResult(req, res) {
  const { jobId } = req.params;
  const userId    = req.user?.id;

  try {
    // Fetch the result joined to its job so we can check ownership
    const { data, error } = await supabaseAdmin
      .from('analysis_results')
      .select(`
        *,
        analysis_jobs!inner (
          id,
          user_id,
          status,
          video_path,
          created_at
        )
      `)
      .eq('job_id', jobId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Result not found' });
      }
      throw error;
    }

    // Ownership check
    if (data.analysis_jobs.user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return res.status(200).json({ result: data });

  } catch (err) {
    console.error('getResult error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}

/**
 * GET /api/analysis/jobs
 * Returns the last 50 analysis jobs for the logged-in user.
 */
async function getJobs(req, res) {
  const userId = req.user?.id;

  try {
    // Fetch jobs with their result verdict+confidence if completed
    const { data, error } = await supabaseAdmin
      .from('analysis_jobs')
      .select(`
        id,
        status,
        video_path,
        created_at,
        analysis_results ( verdict, confidence )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Flatten verdict/confidence onto the job object for the frontend
    const jobs = data.map(j => ({
      ...j,
      verdict:    j.analysis_results?.[0]?.verdict    ?? null,
      confidence: j.analysis_results?.[0]?.confidence ?? null,
    }));

    return res.status(200).json({ jobs });

  } catch (err) {
    console.error('getJobs error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}

/**
 * GET /api/analysis/jobs/:id
 * Returns a single job by id, with ownership check.
 */
async function getJob(req, res) {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const { data, error } = await supabaseAdmin
      .from('analysis_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ message: 'Job not found' });
      throw error;
    }

    if (data.user_id !== userId) return res.status(403).json({ message: 'Forbidden' });

    return res.status(200).json({ job: data });

  } catch (err) {
    console.error('getJob error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}

/**
 * DELETE /api/analysis/jobs/:id
 * Deletes a job and its associated result, with ownership check.
 */
async function deleteJob(req, res) {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    // Ownership check first
    const { data: job, error: fetchErr } = await supabaseAdmin
      .from('analysis_jobs')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchErr || !job) return res.status(404).json({ message: 'Job not found' });
    if (job.user_id !== userId) return res.status(403).json({ message: 'Forbidden' });

    // Delete result first (FK constraint), then job
    await supabaseAdmin.from('analysis_results').delete().eq('job_id', id);

    const { error: deleteErr } = await supabaseAdmin
      .from('analysis_jobs')
      .delete()
      .eq('id', id);

    if (deleteErr) throw deleteErr;

    return res.status(200).json({ message: 'Deleted' });

  } catch (err) {
    console.error('deleteJob error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}

module.exports = { getResult, getJobs, getJob, deleteJob };
