'use strict';
const fs=require('fs'),path=require('path');
const E=require('C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill/scripts/lib/eprj3');
const snap=require('./snapshot.json'),native=require('./native-pins.json'),netlist=require('./netlist.json');
const originalManifest=require('../../evidence/placement-manifest.json');
const virtualNames=new Map(originalManifest.pages.flatMap(p=>p.parts.filter(c=>c.virtual).map(c=>[c.id,c.title])));
function exportedPart(c){if(!virtualNames.has(c.id))return netlist.parts.find(n=>n.ref===c.ref);const title=virtualNames.get(c.id),p=netlist.parts.find(n=>n.name===title);if(!p)throw Error('Cannot resolve virtual module identity '+c.id);return p;}
const close=(a,b)=>Math.abs(a-b)<1e-6;
const between=(x,a,b)=>x>=Math.min(a,b)-1e-6&&x<=Math.max(a,b)+1e-6;
const on=(p,s)=>(close(s.a.x,s.b.x)&&close(p.x,s.a.x)&&between(p.y,s.a.y,s.b.y))||(close(s.a.y,s.b.y)&&close(p.y,s.a.y)&&between(p.x,s.a.x,s.b.x));
function contact(s,t){const a=s.a,b=s.b,c=t.a,d=t.b,h=close(a.y,b.y),v=close(a.x,b.x),h2=close(c.y,d.y),v2=close(c.x,d.x);let p;
 if(h&&h2&&close(a.y,c.y)&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+1e-6)return {kind:'collinear',y:a.y};
 if(v&&v2&&close(a.x,c.x)&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))+1e-6)return {kind:'collinear',x:a.x};
 if(h&&v2&&between(c.x,a.x,b.x)&&between(a.y,c.y,d.y))p={x:c.x,y:a.y};
 if(v&&h2&&between(a.x,c.x,d.x)&&between(c.y,a.y,b.y))p={x:a.x,y:c.y};
 if(p&&[a,b,c,d].some(q=>close(q.x,p.x)&&close(q.y,p.y)))return {kind:'endpoint',...p};
}
const pages=[];
for(const f of snap.files){let active=false;const live=new Map();for(const r of E.readRecords(path.join(snap.stage,'sch/Schematic1',f.title+'.esch2'))){if(r.type==='DOCHEAD'){active=r.body.uuid===f.uuid;continue;}if(active){const k=JSON.stringify(r.id),old=live.get(k);if(!old||(old.ticket||0)<=(r.ticket||0))live.set(k,r);}}
 const rows=[...live.values()].filter(r=>Object.keys(r.body).length),wires=rows.filter(r=>r.type==='WIRE'),wireIds=new Set(wires.map(r=>r.id));
 const segments=rows.filter(r=>r.type==='LINE'&&wireIds.has(r.body.lineGroup)).map(r=>({id:r.id,wire:r.body.lineGroup,a:{x:r.body.startX,y:r.body.startY},b:{x:r.body.endX,y:r.body.endY}}));
 const labels=rows.filter(r=>r.type==='ATTR'&&r.body.key==='NET'&&r.body.value),pins=native.find(p=>p.uuid===f.uuid).components.flatMap(c=>{const part=exportedPart(c);return (c.pins||[]).map(p=>({...p,ref:part?.ref||c.ref,net:part?.pins[String(p.pinNumber)]}));});
 const groups=wires.map(w=>{const seg=segments.filter(s=>s.wire===w.id),connected=pins.filter(p=>seg.some(s=>on(p,s))),names=[...new Set(connected.map(p=>p.net).filter(Boolean))],named=labels.filter(a=>a.body.parentId===w.id).map(a=>a.body.value);return {id:w.id,nets:names.length?names:[...new Set(named)],labels:[...new Set(named)],pins:connected.map(p=>p.ref+'.'+p.pinNumber)};});
 const g=new Map(groups.map(x=>[x.id,x])),contacts=[];
 for(let i=0;i<segments.length;i++)for(let j=0;j<i;j++){const a=segments[i],b=segments[j];if(a.wire===b.wire)continue;const ga=g.get(a.wire),gb=g.get(b.wire);if(ga.nets.some(n=>gb.nets.includes(n)))continue;const point=contact(a,b);if(point)contacts.push({at:point,first:{wire:a.wire,nets:ga.nets,pins:ga.pins},second:{wire:b.wire,nets:gb.nets,pins:gb.pins}});}
 pages.push({title:f.title,segments:segments.length,wireGroups:groups.length,crossNetEndpointContacts:contacts,groupsWithConflictingLabels:groups.filter(g=>g.labels.length>1||g.labels.some(n=>g.nets.length&&!g.nets.includes(n)))});
}
fs.writeFileSync(path.join(__dirname,'geometry-check.json'),JSON.stringify(pages,null,2));
console.log(JSON.stringify(pages.map(p=>({page:p.title,segments:p.segments,crossNetEndpointContacts:p.crossNetEndpointContacts,conflictingLabels:p.groupsWithConflictingLabels})),null,2));
