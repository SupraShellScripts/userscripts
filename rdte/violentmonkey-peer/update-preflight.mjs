// Conservative user-script release gate for a headless actor, not a VM patch.
// Caller must bind the approved baseline and candidate SHA to authoritative DLE.
import {createHash} from 'node:crypto';

export const sha256=x=>createHash('sha256').update(x).digest('hex');
const stable=/^(0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){1,3}$/;

function parse(source) {
  if(typeof source!=='string')throw Error('source-unavailable');
  const lines=source.split(/\r?\n/);
  const end=lines.indexOf('// ==/UserScript==');
  if(lines[0]!=='// ==UserScript=='||end<1)throw Error('invalid-metablock');
  const header=lines.slice(1,end);
  const fields=new Map();
  for(const line of header){
    const m=line.match(/^\/\/[ \t]+@([a-z][a-z0-9-]*)[ \t]+(.*)$/i);
    if(m)fields.set(m[1],(fields.get(m[1])||[]).concat(m[2].trim()));
  }
  for(const key of ['name','namespace','version']){
    if(fields.get(key)?.length!==1||!fields.get(key)[0])throw Error('missing-identity-or-version');
  }
  const version=fields.get('version')[0];
  if(!stable.test(version))throw Error('unsupported-version-format');
  if(version.split('.').some(part=>!Number.isSafeInteger(Number(part))))
    throw Error('invalid-version-integer');
  // Conservative unattended policy: preserve every non-version metadata line,
  // including flags, unknown directives, whitespace, casing and ordering.
  const nonVersionHeader=JSON.stringify(header.filter(line=>!/^\/\/[ \t]+@version[ \t]+/.test(line)));
  return {version,fields,nonVersionHeader,id:fields.get('namespace')[0]+'\n'+fields.get('name')[0]};
}
function compare(x,y){
  const a=x.split('.').map(Number),b=y.split('.').map(Number);
  if([...a,...b].some(n=>!Number.isSafeInteger(n)))throw Error('invalid-version-integer');
  for(let i=0;i<Math.max(a.length,b.length);i++){
    if((a[i]||0)>(b[i]||0))return 1;
    if((a[i]||0)<(b[i]||0))return -1;
  }
  return 0;
}
export function assessUpdate({approvedBaseline,installedCode,remoteMeta,
  remoteCode,approvedRemoteSha256}={}) {
  const result={decision:'block',reasons:[],localDirty:null,remoteNewer:null};
  function block(reason){result.reasons.push(reason);return result;}
  if(!/^[0-9a-f]{64}$/i.test(approvedRemoteSha256||''))
    return block('missing-approved-artifact-digest');
  let base,local,meta,remote;
  try{
    base=parse(approvedBaseline);local=parse(installedCode);
    meta=parse(remoteMeta);remote=parse(remoteCode);
  }catch(e){return block(e.message||'invalid-metadata');}
  result.localDirty=sha256(approvedBaseline)!==sha256(installedCode);
  if(base.id!==local.id||base.id!==meta.id||base.id!==remote.id)
    return block('identity-drift');
  if(meta.version!==remote.version)
    return block('metadata-body-version-mismatch');
  if(sha256(remoteCode)!==approvedRemoteSha256)
    return block('unapproved-remote-code');
  if(base.nonVersionHeader!==remote.nonVersionHeader ||
     base.nonVersionHeader!==meta.nonVersionHeader)
    return block('metadata-scope-drift');
  const ver=compare(remote.version,local.version);
  result.remoteNewer=ver>0;
  if(result.localDirty)return block('local-unpublished-edits');
  if(ver<0)return block('remote-downgrade');
  if(ver===0){
    if(sha256(installedCode)!==sha256(remoteCode))
      return block('same-version-different-code');
    return {...result,decision:'noop'};
  }
  return {...result,decision:'allow-update'};
}
