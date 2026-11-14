'use strict';
const fs=require('fs'),path=require('path');
const E=require(path.join(process.env.EPRJ3_SKILL||'C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill','scripts/lib/eprj3'));
const m=require('./evidence/placement-manifest.json');
for(const page of m.pages){
  const f=path.join(__dirname,'evidence/placement-baseline',page.title+'.esch2'),records=E.readRecords(f);
  let doc;const docs=new Map();for(const r of records){if(r.type==='DOCHEAD'){doc={head:r.body,records:[]};docs.set(r.body.uuid,doc);}else doc.records.push(r);}
  for(const c of page.parts){
    const sd=docs.get(c.symbol),p=sd.records.find(r=>r.type==='PART'&&r.id===c.partId),bb=p.body.BBOX;
    const a=c.rotation*Math.PI/180,co=Math.cos(a),si=Math.sin(a);
    const corners=[[bb[0],bb[1]],[bb[0],bb[3]],[bb[2],bb[1]],[bb[2],bb[3]]].map(([x,y])=>({x:c.x+x*co-y*si,y:c.y+x*si+y*co}));
    const b={x1:Math.min(...corners.map(p=>p.x)),x2:Math.max(...corners.map(p=>p.x)),y1:Math.min(...corners.map(p=>p.y)),y2:Math.max(...corners.map(p=>p.y))};
    const count=sd.records.filter(r=>r.type==='PIN'&&r.body.partId===c.partId).length;
    const pos=E.attrRows(b,count<=2,c.x,c.y,[90,270].includes(c.rotation));
    if(count>2){pos.Name={x:b.x1,y:b.y2+22};pos.Designator={x:b.x1,y:b.y2+8};}
    for(const r of docs.get(page.uuid).records){if(r.type!=='ATTR'||r.body.parentId!==c.id||!pos[r.body.key])continue;Object.assign(r.body,pos[r.body.key],{fontSize:6.75,align:'LEFT_BOTTOM',rotation:0});if(c.virtual)r.body.valueVisible=false;}
    if(c.virtual)for(const r of sd.records)if(r.type==='RECT')Object.assign(r.body,{fillColor:null,fillStyle:null,strokeStyle:null,strokeWidth:null});
  }
  E.writeRecords(f,records);
}
console.log('Updated schematic field placement and unfilled electrical overview blocks.');
