import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from './evidence.mjs';
const fixture=()=>({expected:{repo:'example/repo',runId:5,attempt:1,jobCount:1,head:'a'.repeat(40)},run:{id:5,repository:{full_name:'example/repo',id:2},head_sha:'a'.repeat(40),run_attempt:1,status:'completed',conclusion:'success'},jobs:[{id:9,run_id:5,run_attempt:1,head_sha:'a'.repeat(40),status:'completed',conclusion:'success'}],artifacts:[{id:7,expired:false,digest:'sha256:'+'b'.repeat(64),workflow_run:{id:5,head_sha:'a'.repeat(40),repository_id:2}}]});
test('consistent run metadata, never assert artifact bytes or attempt from run association',()=>{const r=assess(fixture());assert.equal(r.status,'run-metadata-consistent');assert.deepEqual(r.artifactEvidence[0],{id:7,available:true,runBound:true,digestPresent:true,attemptBound:false,bytesVerified:false});});
for(const [name,change,reason] of [
 ['stale head',f=>f.expected.head='c'.repeat(40),'head-mismatch'],
 ['wrong repository',f=>f.run.repository.full_name='other/repo','run-scope-mismatch'],
 ['wrong run',f=>f.run.id=6,'run-scope-mismatch'],
 ['different attempt',f=>f.run.run_attempt=2,'attempt-mismatch'],
 ['in progress',f=>f.run.status='in_progress','run-not-success'],
 ['failed run',f=>f.run.conclusion='failure','run-not-success'],
 ['missing jobs',f=>f.jobs=[],'job-evidence-incomplete'],
 ['stale job attempt',f=>f.jobs[0].run_attempt=2,'job-evidence-incomplete'],
 ['failed job',f=>f.jobs[0].conclusion='failure','job-evidence-incomplete']
])test(name,()=>{const f=fixture();change(f);const r=assess(f);assert.equal(r.status,'not-qualified');assert.ok(r.reasons.includes(reason));});
test('expired and mismatched artifacts do not become byte evidence',()=>{const f=fixture();f.artifacts[0].expired=true;f.artifacts[0].workflow_run.id=9;const a=assess(f).artifactEvidence[0];assert.equal(a.available,false);assert.equal(a.runBound,false);assert.equal(a.bytesVerified,false);});

for(const [name,change,reason] of [
 ['duplicate job identity',f=>{f.expected.jobCount=2;f.jobs.push({...f.jobs[0]});},'job-cardinality-mismatch'],
 ['missing expected job',f=>{f.expected.jobCount=2;},'job-cardinality-mismatch'],
 ['invalid job ID',f=>{f.jobs[0].id=0;},'job-cardinality-mismatch'],
 ['invalid attempt identity',f=>{f.expected.attempt=0;f.run.run_attempt=0;},'invalid-identity'],
 ['duplicate artifact identity',f=>{f.artifacts.push({...f.artifacts[0]});},'artifact-inventory-invalid'],
 ['missing artifact inventory',f=>{f.artifacts=null;},'artifact-inventory-invalid']
])test(name,()=>{const f=fixture();change(f);const r=assess(f);assert.equal(r.status,'not-qualified');assert.ok(r.reasons.includes(reason));});
