'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const s=require('./snapshot.json'),v=require('./gpio-verification.json');
if(v.errors.length)throw Error('Schematic netlist verification failed');
const names=['03_主控与按键.esch2','04_显示接口.esch2'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const targetDir=path.join(s.original,'sch/Schematic1');
for(const name of names){const old=s.files.find(f=>f.name===name);if(hash(path.join(targetDir,name))!==old.sha256)throw Error('Concurrent schematic edit: '+name);}
const published=[];
for(const name of names){const src=path.join(s.stage,'sch/Schematic1',name),dest=path.join(targetDir,name);fs.copyFileSync(src,dest);const sha256=hash(dest);if(sha256!==hash(src))throw Error('Copy verification failed: '+name);published.push({name,path:dest,sha256});}
const comparison=s.files.map(f=>({name:f.name,before:f.sha256,after:hash(path.join(targetDir,f.name))}));
const result={at:new Date().toISOString(),scope:'Only the two named schematic pages were copied. No PCB file was read or written by this publication script.',published,schematicFileComparison:comparison};
fs.writeFileSync(path.join(__dirname,'published.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({published:published.map(p=>p.name),changedSchematicFiles:comparison.filter(f=>f.before!==f.after).map(f=>f.name)}));
