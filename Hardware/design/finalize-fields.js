'use strict';
const fs=require('fs'),path=require('path');
const E=require(path.join(process.env.EPRJ3_SKILL||'C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill','scripts/lib/eprj3'));
const m=require('./evidence/placement-manifest.json');
const restore=new Set(['D1','F1','L1','SW1','SW2','Q1','J3']);
const notes={2:[{x:80,y:510,value:'F1 保持电流 1.5A；L1 为 4.7µH 屏蔽电感，额定电流与饱和余量已核对。'}],3:[{x:250,y:500,value:'复位'},{x:650,y:440,value:'对话'}],5:[{x:80,y:555,value:'关断顺序：SD 高 → GPIO 无上下拉高阻 → 关闭功放电源。'},{x:1140,y:550,value:'J3：8Ω / ≥1W 扬声器'}]};
for(const p of m.pages){for(const dir of [path.join(m.stage,'sch/Schematic1'),path.join(__dirname,'evidence/placement-baseline')]){
  const file=path.join(dir,p.title+'.esch2'),r=E.readRecords(file),ids=new Set(p.parts.filter(c=>restore.has(c.key)).map(c=>c.id));
  let doc,t=Math.max(...r.map(r=>r.ticket||0));
  for(const v of r){if(v.type==='DOCHEAD')doc=v.body.docType;if(doc==='SCH_PAGE'&&v.type==='ATTR'&&v.body.key==='Name'&&ids.has(v.body.parentId))v.body.value=null;}
  const textValues=new Set(r.filter(v=>v.type==='TEXT').map(v=>v.body.value));
  for(const n of notes[p.n]||[])if(!textValues.has(n.value))r.push(E.parseRecord(E.schTextLine({...n,fontSize:10,align:'LEFT_BOTTOM',zIndex:2000,ticketBase:++t})));
  E.writeRecords(file,r);
}}
console.log('Restored manufacturer-matched part names and added operating notes.');
