import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.dirname(here);
const id=(process.argv[2]||'').toUpperCase();
if(!/^A(0[1-9]|1[0-2])$/.test(id)){console.error('usage: node .codex/context.mjs A01');process.exit(2)}
const taskRel=`.codex/tasks/${id}.yaml`;
const task=fs.readFileSync(path.join(repo,taskRel),'utf8');
console.log(`=== ${taskRel} ===\n${task}`);

const list=(key)=>{
  const m=task.match(new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`,'m'));
  return !m||!m[1].trim()?[]:m[1].split(',').map(x=>x.trim()).filter(Boolean);
};

const blockers=list('blockers');
if(blockers.length){
  const d=fs.readFileSync(path.join(repo,'.codex/DECISIONS.yaml'),'utf8');
  const blocks=[...d.matchAll(/^  - id:\s*([A-Z0-9_]+)\n([\s\S]*?)(?=^  - id:|\Z)/gm)]
    .map(m=>({id:m[1],text:`  - id: ${m[1]}\n${m[2]}`}));
  let blocked=false;
  for(const b of blockers){
    const hit=blocks.find(x=>x.id===b);
    if(!hit){console.error(`MISSING DECISION ${b}`);blocked=true;continue}
    console.log(`\n=== decision:${b} ===\n${hit.text.trim()}`);
    if(!/\n\s*status:\s*resolved\s*(?:\n|$)/.test('\n'+hit.text)){blocked=true}
  }
  if(blocked){console.error('\nBLOCKED: resolve listed decision(s) before implementation.');process.exit(3)}
}
for(const rel of list('read')){
  console.log(`\n=== ${rel} ===\n${fs.readFileSync(path.join(repo,rel),'utf8')}`);
}
