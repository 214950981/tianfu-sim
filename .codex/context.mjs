// No dependencies. Prints only current task + explicitly referenced context.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.dirname(here);
const id=(process.argv[2]||'').toUpperCase();
if(!/^A(0[1-9]|1[0-2])$/.test(id)){console.error('usage: node .codex/context.mjs A01');process.exit(2)}
const relTask=`.codex/tasks/${id}.yaml`;
const task=fs.readFileSync(path.join(repo,relTask),'utf8');
console.log(`=== ${relTask} ===\n${task}`);
const m=task.match(/^read:\s*\[(.*)\]\s*$/m);
if(m&&m[1].trim()) for(const raw of m[1].split(',')){
  const rel=raw.trim(); if(!rel) continue;
  console.log(`\n=== ${rel} ===\n${fs.readFileSync(path.join(repo,rel),'utf8')}`);
}
