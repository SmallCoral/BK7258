'use strict';
// Schematic-only edit: remove both physical keys and their dedicated RC parts.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=require('C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill/scripts/lib/eprj3');
const original=path.resolve(__dirname,'../../../桌灵 · DeskSprite');
const source='C:/Users/sc/AppData/Local/Temp/desksprite-vddgpio-fix-20261114';
const stage='C:/Users/sc/AppData/Local/Temp/desksprite-no-buttons-20261114';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const uid=()=>crypto.randomBytes(8).toString('hex');
if(fs.existsSync(stage))throw Error('Refusing to overwrite existing stage');
fs.mkdirSync(path.join(stage,'sch/Schematic1'),{recursive:true});fs.mkdirSync(path.join(__dirname,'before'),{recursive:true});
for(const name of fs.readdirSync(path.join(source,'sch/Schematic1')))if(/\.(esch2|ecfg)$/.test(name))fs.copyFileSync(path.join(source,'sch/Schematic1',name),path.join(stage,'sch/Schematic1',name));
const index=JSON.parse(fs.readFileSync(path.join(source,'DeskSprite_VDDGPIO_Correction.eprj3'),'utf8'));
index.name='DeskSprite_NoButtons';index.default_sheet='ad03834b6ba18de0';index.config.defaultSheet=index.default_sheet;
fs.writeFileSync(path.join(stage,'DeskSprite_NoButtons.eprj3'),JSON.stringify(index,null,2));
function docs(file){const ds=new Map();let d;for(const r of E.readRecords(file)){
  if(r.type==='DOCHEAD'){d=ds.get(r.body.uuid);if(!d){d={head:r,rows:new Map()};ds.set(r.body.uuid,d);}}
  else{const old=d.rows.get(r.id);if(!old||old.ticket<=r.ticket)d.rows.set(r.id,r);}
}return ds;}
function append(file,updates){const ds=docs(file),d=[...ds.values()].find(d=>d.head.body.docType==='SCH_PAGE');let t=Math.max(...[...d.rows.values()].map(r=>r.ticket))+1;
 const lines=[E.formatRecord({type:'DOCHEAD',ticket:t++},{...d.head.body,client:uid(),updateTime:Date.now(),version:String(Date.now())}),...updates.map(r=>E.formatRecord({type:r.type,id:r.id,ticket:t++},r.body))];
 fs.appendFileSync(file,'\n'+lines.join('\n')+'\n');
}
const name='03_主控与按键.esch2',file=path.join(stage,'sch/Schematic1',name),ds=docs(file),d=[...ds.values()].find(d=>d.head.body.docType==='SCH_PAGE'),rows=[...d.rows.values()].filter(r=>Object.keys(r.body).length);
const removedRefs=['SW1','SW2','C11','C12','R5'];
const componentIds=removedRefs.map(ref=>rows.find(r=>r.type==='ATTR'&&r.body.key==='Designator'&&r.body.value===ref)?.body.parentId);
if(componentIds.some(id=>!id))throw Error('A requested key circuit component is missing');
const remove=new Set([...componentIds,'b0862da1e8574f1e','24861297216dc679','728dc01fee18baff',
 'dd2f20946b4286e4','86b26fb61442cf1e','fe29a9432e694f83','e394009f680751e6','1b377ad8d7f65fe1',
 '0672411d080134ff','574fbc50ceabcc21']);
let expanded=true;while(expanded){expanded=false;for(const r of rows)if((remove.has(r.body.parentId)||remove.has(r.body.lineGroup))&&!remove.has(r.id)){remove.add(r.id);expanded=true;}}
const updates=rows.filter(r=>remove.has(r.id)).map(r=>({type:r.type,id:r.id,body:{}}));
function patch(id,props){const r=rows.find(r=>r.id===id);if(!r)throw Error('Missing '+id);updates.push({type:r.type,id,body:{...r.body,...props}});}
const mainModule=rows.find(r=>r.id==='388e57479c78207e'),symId=rows.find(r=>r.type==='ATTR'&&r.body.parentId===mainModule.id&&r.body.key==='Symbol').body.value,sym=[...ds.get(symId).rows.values()];
for(const number of ['3','10']){
 const a=sym.find(r=>r.type==='ATTR'&&r.body.key==='Pin Number'&&r.body.value===number),pin=sym.find(r=>r.type==='PIN'&&r.id===a?.body.parentId);
 if(!pin||pin.body.partId!==mainModule.body.partId)throw Error('Cannot resolve module pin '+number);
 updates.push({type:'ATTR',id:uid(),body:{parentId:mainModule.id+'-'+pin.id,key:'NO_CONNECT',x:mainModule.body.x+pin.body.x,y:mainModule.body.y+pin.body.y,value:'yes',zIndex:700+Number(number),yAxisDirection:'up'}});
}
patch('163e8ced28bae764',{value:'BK7258 主控模组：两个符号单元对应同一颗 U1'});
patch('96465c22efd367e4',{value:'CEN 内部已有上拉；烧录复位可通过断电重上电完成。'});
patch('ec633de06fa33d30',{value:'桌灵 DeskSprite · V0.3 · 3/5 · 主控模组 · 2026-11-14'});
append(file,updates);
const overviewName='01_系统接口总览.esch2',overviewFile=path.join(stage,'sch/Schematic1',overviewName),od=[...docs(overviewFile).values()].find(d=>d.head.body.docType==='SCH_PAGE'),orows=[...od.rows.values()].filter(r=>Object.keys(r.body).length),overview=[];
for(const r of orows){let value;
 if(r.type==='TEXT'&&r.id==='9a46f6b259cbc2d1')value='BK7258 主控（第 3 页）';
 if(r.type==='TEXT'&&r.id==='53070fcfd9f681ae')value='USB 供电与烧录，Wi-Fi 连接电脑；显示、采音与播放。';
 if(r.type==='TEXT'&&r.id==='aa4f6b7a75b34d17')value='配套 D200N2407V0 屏；常规阻容 0603 英制，特殊尺寸另行说明。';
 if(r.type==='ATTR'&&r.body.parentId==='b2444457ca4c661b'&&r.body.key==='Name')value='BK7258 主控（第 3 页）';
 if(value!==undefined)overview.push({type:r.type,id:r.id,body:{...r.body,value}});
}
append(overviewFile,overview);
const files=[overviewName,name].map(name=>{const p=path.join(original,'sch/Schematic1',name);fs.copyFileSync(p,path.join(__dirname,'before',name));return {name,beforeHash:hash(p)};});
const correction=require('../../vddgpio-correction/20261114/snapshot.json');
if(files.find(f=>f.name===name).beforeHash!==correction.beforeHash)throw Error('Main schematic changed since VDDGPIO correction was prepared');
fs.writeFileSync(path.join(__dirname,'snapshot.json'),JSON.stringify({original,stage,files,removedRefs,removedRecords:remove.size,updates,overviewUpdates:overview,includesVddgpioCorrection:true,scope:'Schematic and documentation only; no PCB access.'},null,2));
console.log(JSON.stringify({stage,removedRefs,removedRecords:remove.size,newNC:['U1.3/CEN','U1.10/P28'],overviewUpdates:overview.length}));
