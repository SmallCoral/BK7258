'use strict';
// Scoped, reproducible schematic adaptation. Never reads or writes board files.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CLI = require('C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill/scripts/lib/cli');
const E = require('C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill/scripts/lib/eprj3');
const V = require('C:/Users/sc/AppData/Local/Temp/desksprite-format-skill/validate');
const bin = 'C:/Program Files/lceda-pro/lceda-pro.exe';
const original = path.resolve(__dirname, '../桌灵 · DeskSprite');
const stage = 'C:/Users/sc/AppData/Local/Temp/desksprite-screen-adaptation-20261114';
const out = path.join(__dirname, 'display-selection');
const relative = 'sch/Schematic1/04_显示接口.esch2';
const pageUuid = 'ddc1f9e5177bc1bf';
const ids = { J2:'6f7e34cc6dfac56c', R8:'5eeb0d9455a9b7a8', R9:'6649ed43d9e8dd2f', C15:'5a0f163961f8ad47' };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (name, data) => fs.writeFileSync(path.join(out,name), JSON.stringify(data,null,2));
const read = name => JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));
const ready = `try { await eda.dmt_Project.waitForReady(); } catch(e) {}
let pages=[]; for(let i=0;i<40;i++){ pages=await eda.dmt_Schematic.getAllSchematicPagesInfo(); if(pages?.length)break; await new Promise(r=>setTimeout(r,500)); }
if(!pages.length)throw new Error('Schematic pages unavailable');`;
function invoke(session, code, args) { return CLI.invoke(bin,session,code,{args,timeout:55000}); }
function simplify(raw) {
  const parts = new Map(), nets = {};
  for(const c of Object.values(raw.components||{})) {
    const p=c.props||{}, ref=p.Designator; if(!ref)continue;
    let a=parts.get(ref); if(!a){a={ref,name:p.Name,device:p.DeviceName,footprint:p.FootprintName,pins:{}};parts.set(ref,a);}
    for(const [pin,info] of Object.entries(c.pinInfoMap||{}))a.pins[pin]=info.net||'';
  }
  for(const p of parts.values())for(const [pin,net]of Object.entries(p.pins))if(net)(nets[net]??=[]).push(p.ref+'.'+pin);
  return {parts:[...parts.values()],nets};
}
function exportNetlist(session, name) {
  const data=invoke(session,`${ready}
for(const p of pages){await eda.dmt_EditorControl.openDocument(p.uuid);await new Promise(r=>setTimeout(r,350));}
const f=await eda.sch_ManufactureData.getNetlistFile('netlist','JLCEDA');if(!f)throw new Error('No netlist');return JSON.parse(await f.text());`);
  write(name+'-raw.json',data); const simple=simplify(data);write(name+'.json',simple);return simple;
}
function readMain(file) {
  let inMain=false;const m=new Map();let head;
  for(const r of E.readRecords(file)) {
    if(r.type==='DOCHEAD'){inMain=r.body.uuid===pageUuid;if(inMain)head=r;continue;}
    if(inMain){const k=JSON.stringify(r.id),old=m.get(k);if(!old||old.ticket<=r.ticket)m.set(k,r);}
  }
  return {head,records:[...m.values()].filter(r=>Object.keys(r.body).length)};
}
const mode=process.argv[2];fs.mkdirSync(out,{recursive:true});
if(mode==='prepare') {
  if(fs.existsSync(stage))throw new Error('Stage already exists; refusing to overwrite');
  fs.mkdirSync(path.join(stage,'sch/Schematic1'),{recursive:true});
  const index=JSON.parse(fs.readFileSync(path.join(original,'桌灵 · DeskSprite.eprj3'),'utf8'));
  index.name='DeskSprite_Display_Adaptation';index.boards=[];index.pcb_count=0;index.profile.pcbs={};index.profile.panels={};
  index.default_sheet=pageUuid;index.config.defaultSheet=pageUuid;
  fs.writeFileSync(path.join(stage,'DeskSprite_Display_Adaptation.eprj3'),JSON.stringify(index,null,2));
  const files=[];
  for(const name of fs.readdirSync(path.join(original,'sch/Schematic1'))){
    if(!/\.(esch2|ecfg)$/.test(name))continue;
    const source=path.join(original,'sch/Schematic1',name);fs.copyFileSync(source,path.join(stage,'sch/Schematic1',name));
    files.push({name,sha256:hash(source)});
  }
  write('before-files.json',files);fs.copyFileSync(path.join(original,relative),path.join(out,'display-before.esch2'));
  const session=CLI.openProject(bin,stage);
  try {
    exportNetlist(session,'netlist-before');
    const pins=invoke(session,`${ready}
await eda.dmt_EditorControl.openDocument(__CLI__.args.page);await new Promise(r=>setTimeout(r,700));
await eda.sch_PrimitiveComponent.modify(__CLI__.args.ids.J2,{rotation:180,mirror:true});
await eda.sch_Document.save();await new Promise(r=>setTimeout(r,5000));
const result={};for(const [ref,id]of Object.entries(__CLI__.args.ids))result[ref]=await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(id);return result;`,{page:pageUuid,ids});
    write('native-pins-layout.json',pins);console.log(JSON.stringify({stage,J2:pins.J2.map(p=>[p.pinNumber,p.x,p.y])}));
  } finally {CLI.closeSession(bin,session);}
} else if(mode==='rewire') {
  const file=path.join(stage,relative),{head,records}=readMain(file);
  const map=new Map(records.map(r=>[r.id,r]));let ticket=Math.max(...records.map(r=>r.ticket))+1;const updates=[];
  function emit(type,id,body){
    if(body&&['TEXT','ATTR'].includes(type)){
      body={...body,strikeout:body.strikeout??false,groupId:body.groupId??'',locked:body.locked??false};
      if(type==='ATTR'){body.keyVisible??=false;body.valueVisible??=false;}
    }
    updates.push({type,id,ticket:ticket++,body});
  }
  function patch(id,props){const r=map.get(id);if(!r)throw new Error('Missing '+id);emit(r.type,id,{...r.body,...props});}
  // D200N2407V0 is exactly the reverse of the reference interface. A vertical
  // flip of the connector symbol rewires its physical pin numbers while keeping
  // the user's short wire paths. The embedded symbol and pad numbering stay intact.
  const before=readMain(path.join(out,'display-before.esch2'));
  for(const r of before.records.filter(r=>r.type==='ATTR'&&r.body.parentId===ids.J2))
    if(['Name','Designator'].includes(r.body.key))patch(r.id,r.body);
  patch('52a560d52881323f',{value:'显示：D200N2407V0 / 2 寸 IPS / ST7789V2 / 240×320'});
  patch('e6eed4b33917058c',{value:'J2：10 针、0.5 mm、下接触；排线厚 0.30 mm。'});
  patch('07c05114ccd693a6',{value:'背光：P25 低有效；R9 暂留 10 Ω，须按该屏背光额定电流复核。'});
  patch('7ddcd2f4622d23e4',{value:'排线 1 脚对 J2.1（LEDK/GND）；J2.2 为 LEDA，J2.4 为 3.3 V。'});
  patch('69177dddd41a746b',{value:'J2.10 = DC（P5），J2.9 = MOSI（P4）。',x:550,y:60});
  patch('14b648e64ea55501',{value:'屏体：34.6×47.8×1.9 mm；关屏前将 SPI GPIO 置低或高阻。',x:30,y:115});
  patch('4e19dcc0eb733500',{value:'桌灵 DeskSprite · V0.2 · 4/5 · 显示接口 · 2026-11-14'});
  const schemaErrors=[];
  for(const u of updates.filter(u=>u.body)){
    // Normalize legacy 4.1.71 optional fields for the newer format schema.
    const body={...u.body};if(['ATTR','TEXT','COMPONENT','WIRE'].includes(u.type)){body.groupId??='';body.locked??=false;}
    const result=V.validateFormat(u.type,body,'SCH_PAGE');if(!result.valid)schemaErrors.push({id:u.id,type:u.type,errors:result.errors});
  }
  write('schema-check.json',{checked:updates.filter(u=>u.body).length,schemaErrors});
  const newHead={...head.body,client:crypto.randomBytes(8).toString('hex'),updateTime:Date.now(),version:String(Date.now())};
  const additions=[JSON.stringify({type:'DOCHEAD',ticket:ticket++})+'||'+JSON.stringify(newHead),...updates.map(r=>JSON.stringify({type:r.type,id:r.id,ticket:r.ticket})+'||'+(r.body?JSON.stringify(r.body):''))];
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').trimEnd().replace(/\|$/,'')+'|\n'+additions.join('|\n')+'\n');
  write('change-records.json',updates);console.log(JSON.stringify({updatedRecords:updates.length,schemaErrors}));
} else if(mode==='verify') {
  const session=CLI.openProject(bin,stage);
  try {
    const net=exportNetlist(session,'netlist-after');
    const evidence=invoke(session,`${ready}
await eda.dmt_EditorControl.openDocument(__CLI__.args.page);await new Promise(r=>setTimeout(r,5000));
const pins={};for(const [ref,id]of Object.entries(__CLI__.args.ids))pins[ref]=await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(id);
const erc=await eda.sch_Drc.check(true,false,true);return {pins,erc};`,{page:pageUuid,ids});
    write('native-verification.json',evidence);
    const result=invoke(session,`const f=await eda.sch_ManufactureData.getPngFile('display');if(!f)throw new Error('No PNG');const b=new Uint8Array(await f.arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return {name:f.name,data:btoa(s)};`);
    fs.writeFileSync(path.join(out,'display-preview-export'+(result.name?.endsWith('.zip')?'.zip':'.png')),Buffer.from(result.data,'base64'));
    const expected={'1':'GND','2':'LCD_BLA','3':'GND','4':'LCD_3V3','5':'GND','6':'LCD_SCK','7':'LCD_RST_N','8':'LCD_CS_N','9':'LCD_MOSI','10':'LCD_DC','11':'GND','12':'GND'};
    const actual=net.parts.find(p=>p.ref==='J2').pins;
    const errors=Object.entries(expected).filter(([p,n])=>actual[p]!==n);
    const unconnected=evidence.pins.J2.filter(p=>p.noConnected);if(unconnected.length)errors.push(['unexpected-NC',unconnected]);
    const before=read('netlist-before.json');const changes=[];
    for(const p of net.parts){const old=before.parts.find(v=>v.ref===p.ref);for(const [pin,n]of Object.entries(p.pins))if(old?.pins[pin]!==n)changes.push({ref:p.ref,pin,before:old?.pins[pin],after:n});}
    if(changes.some(c=>c.ref!=='J2'))errors.push(['unexpected-changes',changes.filter(c=>c.ref!=='J2')]);
    write('verification.json',{expected,actual,changes,errors,physicalParts:net.parts.filter(p=>!/^B\d$/.test(p.ref)).length});
    console.log(JSON.stringify({pins:actual,changes,errors,erc:evidence.erc}));
    if(errors.length)process.exitCode=1;
  } finally {CLI.closeSession(bin,session);}
} else if(mode==='publish') {
  const v=read('verification.json');if(v.errors.length)throw new Error('Verification failed');
  const old=read('before-files.json').find(f=>f.name==='04_显示接口.esch2');
  if(hash(path.join(original,relative))!==old.sha256)throw new Error('Display sheet changed concurrently; merge required');
  fs.copyFileSync(path.join(stage,relative),path.join(original,relative));
  write('published.json',{at:new Date().toISOString(),path:path.join(original,relative),sha256:hash(path.join(original,relative))});
  console.log('Published verified display sheet only.');
} else throw new Error('Mode must be prepare, rewire, verify, or publish');
