'use strict';
const fs=require('fs'),path=require('path');
const E=require('C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill/scripts/lib/eprj3');
const snap=require('./snapshot.json');
function read(file,uuid){const docs=new Map();let d;for(const r of E.readRecords(file)){if(r.type==='DOCHEAD'){d={head:r.body,recs:new Map()};docs.set(r.body.uuid,d);}else {const k=JSON.stringify(r.id),old=d.recs.get(k);if(!old||(old.ticket||0)<=(r.ticket||0))d.recs.set(k,r);}}const main=docs.get(uuid);return {docs,main:[...main.recs.values()].filter(r=>Object.keys(r.body).length)};}
function components(x){const attrs=x.main.filter(r=>r.type==='ATTR'),a=(id,key)=>attrs.find(r=>r.body.parentId===id&&r.body.key===key)?.body.value;return x.main.filter(r=>r.type==='COMPONENT').map(r=>({id:r.id,ref:a(r.id,'Designator'),symbol:a(r.id,'Symbol'),device:a(r.id,'Device'),unique:a(r.id,'Unique ID'),...r.body}));}
const result=[],spec=[];
for(const file of snap.files){const before=read(path.join('C:/Users/sc/AppData/Local/Temp/desksprite-build/sch/Schematic1',file.title+'.esch2'),file.uuid),after=read(path.join(snap.stage,'sch/Schematic1',file.title+'.esch2'),file.uuid),bc=components(before),ac=components(after),changes=[];
  for(const c of ac){const old=bc.find(v=>v.id===c.id);if(c.ref&&JSON.stringify(c)!==JSON.stringify(old))changes.push({id:c.id,old:old&&{ref:old.ref,symbol:old.symbol,device:old.device,x:old.x,y:old.y,rotation:old.rotation},now:{ref:c.ref,symbol:c.symbol,device:c.device,x:c.x,y:c.y,rotation:c.rotation}});}
  const nets=x=>x.main.filter(r=>r.type==='ATTR'&&['NET','Global Net Name'].includes(r.body.key)),bn=nets(before),an=nets(after),netChanges=[];
  for(const a of an){const b=bn.find(r=>r.id===a.id);if(!b||a.body.value!==b.body.value||a.body.parentId!==b.body.parentId||a.body.x!==b.body.x||a.body.y!==b.body.y)netChanges.push({id:a.id,old:b?.body,now:a.body});}
  result.push({page:file.title,componentChanges:changes,netLabelChanges:netChanges,deletedLabels:bn.filter(b=>!an.some(a=>a.id===b.id)),wires:after.main.filter(r=>r.type==='WIRE').length,lines:after.main.filter(r=>r.type==='LINE').length});
  spec.push({uuid:file.uuid,title:file.title,parts:ac.filter(c=>c.ref).map(c=>({id:c.id,ref:c.ref}))});
}
fs.writeFileSync(path.join(__dirname,'record-diff.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(__dirname,'actual-components.json'),JSON.stringify(spec,null,2));
console.log(JSON.stringify(result.map(p=>({page:p.page,components:p.componentChanges,labelChanges:p.netLabelChanges.map(v=>({id:v.id,before:v.old?.value,after:v.now.value,beforeAt:[v.old?.x,v.old?.y],afterAt:[v.now.x,v.now.y],parentChanged:v.old?.parentId!==v.now.parentId})),deletedLabels:p.deletedLabels.map(v=>v.body.value),wires:p.wires,lines:p.lines})),null,2));
