'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const s=require('./snapshot.json'),v=require('./verification.json'),audit=require('./independent-audit.json');
if(v.errors.length||!audit.ok||v.physicalParts!==62)throw Error('Schematic validation failed');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const f of s.files)if(hash(path.join(s.original,'sch/Schematic1',f.name))!==f.beforeHash)throw Error('Concurrent schematic edit: '+f.name);
const published=[];
for(const f of s.files){const src=path.join(s.stage,'sch/Schematic1',f.name),dest=path.join(s.original,'sch/Schematic1',f.name);fs.copyFileSync(src,dest);if(hash(src)!==hash(dest))throw Error('Copy check failed');published.push({path:dest,sha256:hash(dest)});}
const bom=path.resolve(__dirname,'../../BOM.csv');fs.copyFileSync(bom,path.join(__dirname,'BOM-before.csv'));fs.copyFileSync(path.join(__dirname,'BOM.csv'),bom);published.push({path:bom,sha256:hash(bom)});
fs.writeFileSync(path.join(__dirname,'published.json'),JSON.stringify({at:new Date().toISOString(),scope:'Two schematic pages and BOM only. No PCB files accessed.',published},null,2));
console.log(JSON.stringify({published:published.map(p=>p.path),physicalParts:v.physicalParts,nets:v.nets}));
