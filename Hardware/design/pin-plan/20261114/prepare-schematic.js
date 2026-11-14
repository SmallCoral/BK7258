'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=require('C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill/scripts/lib/eprj3');
const plan=require('./pin-plan.json');
const original=path.resolve(__dirname,'../../../桌灵 · DeskSprite');
const stage='C:/Users/sc/AppData/Local/Temp/desksprite-pin-plan-20261114-v2';
const uid=()=>crypto.randomBytes(8).toString('hex');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(fs.existsSync(stage))throw Error('Stage already exists');
fs.mkdirSync(path.join(stage,'sch/Schematic1'),{recursive:true});fs.mkdirSync(path.join(__dirname,'before'),{recursive:true});
const files=[];
for(const name of fs.readdirSync(path.join(original,'sch/Schematic1'))){if(!/\.(esch2|ecfg)$/.test(name))continue;const src=path.join(original,'sch/Schematic1',name);fs.copyFileSync(src,path.join(stage,'sch/Schematic1',name));files.push({name,sha256:hash(src)});}
const index=JSON.parse(fs.readFileSync(path.join(original,'桌灵 · DeskSprite.eprj3'),'utf8'));index.name='DeskSprite_PinPlan';index.boards=[];index.pcb_count=0;index.profile.pcbs={};index.profile.panels={};index.default_sheet='ad03834b6ba18de0';index.config.defaultSheet=index.default_sheet;
fs.writeFileSync(path.join(stage,'DeskSprite_PinPlan.eprj3'),JSON.stringify(index,null,2));
function docs(file){const ds=new Map();let d;for(const r of E.readRecords(file)){if(r.type==='DOCHEAD'){d=ds.get(r.body.uuid);if(!d){d={head:r,rows:new Map()};ds.set(r.body.uuid,d);}}else{const old=d.rows.get(r.id);if(!old||old.ticket<=r.ticket)d.rows.set(r.id,r);}}return ds;}
function append(file,updates){if(!updates.length)return;const d=[...docs(file).values()].find(d=>d.head.body.docType==='SCH_PAGE');let t=Math.max(...[...d.rows.values()].map(r=>r.ticket))+1;
 fs.appendFileSync(file,'\n'+[E.formatRecord({type:'DOCHEAD',ticket:t++},{...d.head.body,client:uid(),updateTime:Date.now(),version:String(Date.now())}),...updates.map(r=>E.formatRecord({type:r.type,id:r.id,ticket:t++},r.body))].join('\n')+'\n');}
const mainName='03_主控与按键.esch2',mainFile=path.join(stage,'sch/Schematic1',mainName),ds=docs(mainFile),d=[...ds.values()].find(d=>d.head.body.docType==='SCH_PAGE'),rows=[...d.rows.values()].filter(r=>Object.keys(r.body).length),updates=[];
function patch(r,props){updates.push({type:r.type,id:r.id,body:{...r.body,...props}});}
const mainController=rows.find(r=>r.id==='388e57479c78207e');if(mainController.body.rotation!==0||mainController.body.isMirror)throw Error('Controller symbol orientation changed; recompute pins');
const symId=rows.find(r=>r.type==='ATTR'&&r.body.parentId===mainController.id&&r.body.key==='Symbol').body.value,sym=[...ds.get(symId).rows.values()];
function pin(number){const attr=sym.find(r=>r.type==='ATTR'&&r.body.key==='Pin Number'&&r.body.value===String(number));const p=sym.find(r=>r.type==='PIN'&&r.id===attr?.body.parentId);if(!p||p.body.partId!==mainController.body.partId)throw Error('Missing controller pin '+number);return {...p,x:mainController.body.x+p.body.x,y:mainController.body.y+p.body.y};}
const affected=new Set(plan.mapping.flatMap(m=>[m.beforePin,m.pin])),newUsed=new Set(plan.mapping.map(m=>m.pin));
for(const number of affected){const p=pin(number),parentId=mainController.id+'-'+p.id,nc=rows.find(r=>r.type==='ATTR'&&r.body.key==='NO_CONNECT'&&r.body.parentId===parentId);
 if(newUsed.has(number)){if(nc)updates.push({type:nc.type,id:nc.id,body:{}});}else if(!nc)updates.push({type:'ATTR',id:uid(),body:{parentId,key:'NO_CONNECT',x:p.x,y:p.y,value:'yes',zIndex:800+Number(number),yAxisDirection:'up'}});
}
for(const m of plan.mapping){const netAttr=rows.find(r=>r.type==='ATTR'&&r.body.key==='NET'&&r.body.value===m.net);if(!netAttr)throw Error('Missing wire label '+m.net);const lines=rows.filter(r=>r.type==='LINE'&&r.body.lineGroup===netAttr.body.parentId);if(lines.length!==1)throw Error('Wire is no longer a short single segment '+m.net);const p=pin(m.pin),dir=p.body.rotation;let x=p.x,y=p.y,align;
 // Raw symbol PIN.rotation points into the symbol from its connection point.
 // Draw the short external wire in the opposite direction.
 if(dir===0){x-=10;align='RIGHT_BOTTOM';}else if(dir===180){x+=25;align='LEFT_BOTTOM';}else throw Error('Unexpected pin orientation '+m.pin);
 patch(lines[0],{startX:p.x,startY:p.y,endX:x,endY:y});patch(netAttr,{x,y,rotation:0,align});
}
const template=rows.find(r=>r.type==='TEXT'&&r.body.fontSize===10).body;
updates.push({type:'TEXT',id:uid(),body:{...template,x:30,y:170,zIndex:2100,value:'屏幕：P25 供电 / P1 复位 / P28 DC / P9 背光（PWM3）。'}});
updates.push({type:'TEXT',id:uid(),body:{...template,x:30,y:145,zIndex:2101,value:'音频：P15 供电 / P14 关断；固件须同步 GPIO 与复用配置。'}});
append(mainFile,updates);
const edits={[mainName]:updates};
for(const [name,map]of [['04_显示接口.esch2',{'7':'25','25':'9','5':'28'}],['05_采音与播放.esch2',{'8':'15','23':'14'}]]){
 const file=path.join(stage,'sch/Schematic1',name),d=[...docs(file).values()].find(d=>d.head.body.docType==='SCH_PAGE'),changes=[];
 for(const r of [...d.rows.values()].filter(r=>r.type==='TEXT'&&Object.keys(r.body).length)){
  let value=r.body.value.replace(/\bP(\d+)\b/g,(full,n)=>map[n]===undefined?full:'P'+map[n]);
  if(name==='04_显示接口.esch2'&&r.body.value.includes('背光：'))value=value.replace('P9 低有效','P9 / PWM3 低有效');
  if(value!==r.body.value)changes.push({type:r.type,id:r.id,body:{...r.body,value}});
 }
 append(file,changes);edits[name]=changes;
}
for(const name of Object.keys(edits))fs.copyFileSync(path.join(original,'sch/Schematic1',name),path.join(__dirname,'before',name));
fs.writeFileSync(path.join(__dirname,'snapshot.json'),JSON.stringify({original,stage,files,edits,scope:'Read-only PCB reference; publish schematic pages only.',pcbSha256:plan.pcbSha256},null,2));
console.log(JSON.stringify({stage,edits:Object.fromEntries(Object.entries(edits).map(([name,u])=>[name,u.length])),mapping:plan.mapping.map(({edges,...m})=>m)}));
