export function assess({expected,run,jobs,artifacts}){
 const reasons=[];
 const sha=/^[0-9a-f]{40}$/;
 if(!sha.test(expected.head)||run.head_sha!==expected.head)reasons.push('head-mismatch');
 if(run.repository?.full_name!==expected.repo||run.id!==expected.runId)reasons.push('run-scope-mismatch');
 if(run.run_attempt!==expected.attempt)reasons.push('attempt-mismatch');
 if(run.status!=='completed'||run.conclusion!=='success')reasons.push('run-not-success');
 if(!Array.isArray(jobs)||!jobs.length||jobs.some(j=>j.run_id!==expected.runId||j.run_attempt!==expected.attempt||j.head_sha!==expected.head||j.status!=='completed'||j.conclusion!=='success'))reasons.push('job-evidence-incomplete');
 const artifactEvidence=Array.isArray(artifacts)?artifacts.map(a=>({id:a.id,available:a.expired===false,runBound:a.workflow_run?.id===expected.runId&&a.workflow_run?.head_sha===expected.head&&a.workflow_run?.repository_id===run.repository?.id,digestPresent:/^sha256:[0-9a-f]{64}$/.test(a.digest||''),attemptBound:false,bytesVerified:false})):[];
 return {status:reasons.length?'not-qualified':'run-metadata-consistent',reasons,artifactEvidence};
}
