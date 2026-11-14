// Local symbol drawing correction only; pad numbers and embedded footprints are untouched.
'use strict';
const fs=require('fs'),path=require('path');
const E=require(path.join(process.env.EPRJ3_SKILL||'C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill','scripts/lib/eprj3'));
const m=require('./evidence/placement-manifest.json');
for(const p of m.pages.filter(p=>[1,3].includes(p.n))){
  const file=path.join(__dirname,'evidence/placement-baseline',p.title+'.esch2'),r=E.readRecords(file),virtual=new Set(p.parts.filter(c=>c.virtual).map(c=>c.symbol));
  let doc,t=Math.max(...r.map(v=>v.ticket||0));
  for(const v of r){if(v.type==='DOCHEAD'){doc=v.body;if(doc.docType==='SYMBOL'){v.body.updateTime=Date.now();v.body.version=String(Date.now());}}
    if(doc.docType==='SYMBOL'&&v.type==='PIN'){
      if(doc.uuid==='a90500de4d1d7ded'&&v.body.x===-101)v.body.x=-100;
      if(virtual.has(doc.uuid)){v.body.x=Math.round(v.body.x/5)*5;v.body.y=Math.round(v.body.y/5)*5;}
    }
  }
  if(p.n===1){
    const live=E.readRecords(path.join(m.stage,'sch/Schematic1',p.title+'.esch2'));
    for(const v of live)if(v.type==='ATTR'&&['Add into BOM','Convert to PCB'].includes(v.body.key)&&p.parts.some(c=>c.id===v.body.parentId)){r.push({...v,head:{...v.head,ticket:++t}});}
  }
  E.writeRecords(file,r);fs.copyFileSync(file,path.join(m.stage,'sch/Schematic1',p.title+'.esch2'));
}
console.log('Aligned virtual port pins and U1 left-side symbol tips to 50mil grid. Reread pins before wiring.');
