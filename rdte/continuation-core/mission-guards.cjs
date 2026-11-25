const assert=require('node:assert/strict');
const {AutoContinueEngine,hashText}=require('../../.work/aiac/src/content/core.js');
class Adapter {
 constructor(response,blocked,draft){this.response=response;this.blocked=blocked;this.composer=draft||'';this.calls=0;this.generating=false;}
 getConversationKey(){return 'synthetic-conversation';}
 getBlockingState(){return this.blocked;}
 isGenerating(){return this.generating;}
 getResponseSnapshot(){return {anchor:'a',textHash:hashText(this.response),blockCount:1,text:this.response};}
 getSmartStartReadiness(){return {ok:true};}
 getPromptPreparationReadiness(){return {ok:true};}
 getComposerText(){return this.composer;}
 async writeComposer(t){this.composer=t;return true;}
 async waitForSendReady(){return {ok:true};}
 captureSubmissionBaseline(){return {response:this.getResponseSnapshot()};}
 async submit(){this.calls++;this.generating=true;this.composer='';return true;}
 verifySubmission(){return {status:'confirmed'};}
}
const cases=[
 {id:'ordinary-complete-response',text:'Next task remains.',expected:1},
 {id:'explicit-block-from-adapter',text:'Next task remains.',blocked:'quota exceeded',expected:0},
 {id:'human-draft',text:'Next task remains.',draft:'Human draft',expected:0},
 {id:'mission-completed-text',text:'MISSION COMPLETE. All accepted work is finished.',expected:0},
 {id:'human-authorization-text',text:'HUMAN AUTHORIZATION REQUIRED before proceeding.',expected:0},
];
(async()=>{const results=[];for(const c of cases){const a=new Adapter(c.text,c.blocked||null,c.draft);const e=new AutoContinueEngine(a,{prompt:'Continue.',startupObservationMs:0,maxPromptSubmissions:1},{},{now:()=>1000});await e.start();await e.tick();results.push({case:c.id,expected:c.expected,actual:a.calls,pass:a.calls===c.expected,state:e.state,reason:e.lastError,draftPreserved:!c.draft||a.composer===c.draft});}console.log(JSON.stringify({schema:1,candidate:'AI Auto Continue 1.3.2 core',scope:'deterministic fake adapter; not full extension or DOM qualification',results}));assert.equal(results[0].actual,1,'positive control');})().catch(e=>{console.error(e.name);process.exitCode=1;});
