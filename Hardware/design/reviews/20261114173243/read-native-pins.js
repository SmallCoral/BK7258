'use strict';
const fs=require('fs'),path=require('path');
const CLI=require('C:/Users/sc/AppData/Local/Temp/desksprite-eprj3-skill/scripts/lib/cli');
const snapshot=require('./snapshot.json'),pages=require('./actual-components.json');
const info=CLI.requireCli({minVersion:'4.1.60'}),session=CLI.openProject(info.bin,snapshot.stage),out=[];
try {
CLI.invoke(info.bin,session,`try{await eda.dmt_Project.waitForReady();}catch(e){}let pages=[];for(let i=0;i<40;i++){pages=await eda.dmt_Schematic.getAllSchematicPagesInfo();if(pages?.length)break;await new Promise(r=>setTimeout(r,750));}return pages;`,{timeout:90000});
for(const page of pages){const components=[];for(let i=0;i<page.parts.length;i+=20){const value=CLI.invoke(info.bin,session,`
try{await eda.dmt_Project.waitForReady();}catch(e){}
await eda.dmt_EditorControl.openDocument(__CLI__.args.uuid);
await new Promise(r=>setTimeout(r,700));
const out=[];for(const c of __CLI__.args.parts){let pins,error;for(let i=0;i<3;i++){try{pins=await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(c.id);break;}catch(e){error=String(e);await new Promise(r=>setTimeout(r,800));}}out.push({id:c.id,ref:c.ref,pins,error:pins?undefined:error});}return out;
`,{args:{uuid:page.uuid,parts:page.parts.slice(i,i+20)},timeout:90000});components.push(...value);}
out.push({uuid:page.uuid,title:page.title,components});console.log(page.title+': '+components.length+' components');}
fs.writeFileSync(path.join(__dirname,'native-pins.json'),JSON.stringify(out,null,2));
}finally{CLI.closeSession(info.bin,session);}
