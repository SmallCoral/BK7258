'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const s=require('./snapshot.json'),v=require('./verification.json'),audit=require('./independent-audit.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(v.errors.length||!audit.ok)throw Error('Schematic checks failed');
const checked=require('./netlist-after.json'),rendered=require('./netlist-rendered.json');
function canonical(n){return JSON.stringify(n.parts.map(p=>({ref:p.ref,device:p.device,pins:Object.entries(p.pins).sort()})).sort((a,b)=>a.ref.localeCompare(b.ref)));}
if(canonical(checked)!==canonical(rendered))throw Error('Final rendered netlist differs from independently audited topology');
const pcb=path.join(s.original,'pcb/PCB1.epcb2'),pcbBefore=hash(pcb);if(pcbBefore!==s.pcbSha256)throw Error('User PCB changed; re-evaluate latest layout before publishing');
const changed=Object.entries(s.edits).filter(([,r])=>r.length).map(([name])=>name);
for(const name of changed){const old=s.files.find(f=>f.name===name);if(hash(path.join(s.original,'sch/Schematic1',name))!==old.sha256)throw Error('Concurrent schematic edit '+name);}
const published=[];for(const name of changed){const src=path.join(s.stage,'sch/Schematic1',name),dest=path.join(s.original,'sch/Schematic1',name);fs.copyFileSync(src,dest);if(hash(src)!==hash(dest))throw Error('Copy verification failed');published.push({name,path:dest,sha256:hash(dest)});}
const pcbAfter=hash(pcb);if(pcbAfter!==pcbBefore)throw Error('PCB changed concurrently during publication');
fs.writeFileSync(path.join(__dirname,'published.json'),JSON.stringify({at:new Date().toISOString(),published,pcbBefore,pcbAfter,pcbUnchanged:pcbAfter===pcbBefore,scope:'Only the named schematic pages were copied; PCB read for SHA256 verification only.'},null,2));
console.log(JSON.stringify({published:changed,pcbUnchanged:pcbAfter===pcbBefore}));
