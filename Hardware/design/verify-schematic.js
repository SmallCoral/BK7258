'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=require(path.join(process.env.EPRJ3_SKILL||'C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill','scripts/lib/eprj3'));
const V=require('C:/Users/sc/AppData/Local/Temp/desksprite-format-skill/validate');
const base=__dirname,m=require('./evidence/placement-manifest.json'),net=require('./evidence/netlist-final.json');
const errors=[],formatErrors=[],docs=new Map(),notes=[],actualParts=new Map();let validated=0;
for(const p of m.pages){let d;for(const r of E.readRecords(path.join(m.stage,'sch/Schematic1',p.title+'.esch2'))){
  if(r.type==='DOCHEAD'){d={head:r.body,records:new Map()};docs.set(r.body.uuid,d);continue;}
  const k=JSON.stringify(r.id),old=d.records.get(k);if(!old||(old.ticket||0)<=(r.ticket||0))d.records.set(k,r);
}
const main=docs.get(p.uuid),live=[...main.records.values()].filter(r=>Object.keys(r.body).length);
for(const r of live){if(['COMPONENT','ATTR','WIRE','LINE','TEXT'].includes(r.type)){const v=V.validateFormat(r.type,r.body,'SCH_PAGE');validated++;if(!v.valid)formatErrors.push({page:p.title,id:r.id,type:r.type,errors:v.errors});}
  if(r.type==='TEXT'){notes.push({page:p.title,id:r.id,fontSize:r.body.fontSize,fontFamily:r.body.fontFamily});if(r.body.fontSize!==10||r.body.fontFamily!==null)errors.push({kind:'note-style',page:p.title,id:r.id});}
}
for(const c of p.parts){const n=net.parts.find(v=>v.ref===c.ref);if(!n)errors.push({kind:'missing-component',ref:c.ref});
  for(const [pin,wanted] of Object.entries(c.nets))if(n?.pins[pin]!==wanted)errors.push({kind:'pin-net',ref:c.ref,pin,wanted,actual:n?.pins[pin]});
  if(c.virtual)continue;
  let a=actualParts.get(c.ref);if(!a){const dev=docs.get(c.device),meta=[...dev.records.values()].find(r=>r.type==='META').body;const fp=docs.get(c.footprint);a={ref:c.ref,part:meta.attributes['Manufacturer Part'],supplier:meta.attributes['Supplier Part'],value:meta.attributes.Value||meta.attributes.Inductance||c.value,footprint:fp&&[...fp.records.values()].find(r=>r.type==='META').body.title,footprintUuid:c.footprint,model:meta.attributes['3D Model'],modelTitle:meta.attributes['3D Model Title'],transform:meta.attributes['3D Model Transform'],pins:[]};actualParts.set(c.ref,a);}
  const sym=docs.get(c.symbol),pins=[...sym.records.values()].filter(r=>r.type==='PIN'&&r.body.partId===c.partId),attrs=[...sym.records.values()].filter(r=>r.type==='ATTR');
  a.pins.push(...pins.map(r=>attrs.find(v=>v.body.parentId===r.id&&v.body.key==='Pin Number')?.body.value).filter(v=>v!==undefined).map(String));
}
}
for(const a of actualParts.values()){
  const fp=docs.get(a.footprintUuid),pads=new Set([...fp?.records.values()||[]].filter(r=>r.type==='PAD').map(r=>String(r.body.num)));
  for(const pin of a.pins)if(!pads.has(pin))errors.push({kind:'missing-pad',ref:a.ref,pin,footprint:a.footprint});
  for(const pad of pads)if(pad&&!a.pins.includes(pad))errors.push({kind:'unmapped-pad',ref:a.ref,pad,footprint:a.footprint});
  if(!a.model||!a.transform||!a.footprint)errors.push({kind:'binding',ref:a.ref});
}
const result={pages:m.pages.length,physicalParts:actualParts.size,virtualBlocks:4,expectedConnectedPins:m.pages.flatMap(p=>p.parts).reduce((s,c)=>s+Object.keys(c.nets).length,0),netCount:Object.keys(net.nets).length,footprintBindings:[...actualParts.values()].filter(p=>p.footprint).length,modelReferences:[...actualParts.values()].filter(p=>p.model).length,noteCount:notes.length,noteFont:'default,100mil',validatedMainPrimitives:validated,errors,formatErrors,netlistSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'evidence/netlist-final.json'))).digest('hex')};
fs.writeFileSync(path.join(base,'evidence/schema-record-errors.json'),JSON.stringify({records:formatErrors.length,formatErrors},null,2));
delete result.formatErrors;
result.formatSchemaMismatchedRecords=formatErrors.length;
result.rawSchemaResult='schema-record-errors.json';
fs.writeFileSync(path.join(base,'evidence/verification.json'),JSON.stringify(result,null,2));
fs.writeFileSync(path.join(base,'evidence/component-bindings.json'),JSON.stringify([...actualParts.values()],null,2));
const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"';
const rows=[['位号','制造商料号','立创编号','数值/用途','封装','模型名称'],...[...actualParts.values()].map(a=>[a.ref,a.part,a.supplier,a.value,a.footprint,a.modelTitle])];
fs.writeFileSync(path.join(base,'BOM.csv'),'\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'));
console.log(JSON.stringify(result,null,2));
