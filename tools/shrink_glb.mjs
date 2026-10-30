// Re-encodes the embedded textures of a static GLB (node tools/shrink_glb.mjs in.glb out.glb [maxSize=512]) so a 3 MB sketchfab prop becomes phone-sized. Geometry is untouched.
import fs from 'fs';
const NM=process.env.THREE_NM||'/home/claude/tools_nm/node_modules';
const sharp=(await import(NM+'/sharp/dist/index.mjs')).default;
const [,,inF,outF,mx='512']=process.argv;
const b=fs.readFileSync(inF),jl=b.readUInt32LE(12),J=JSON.parse(b.slice(20,20+jl)),BIN=b.slice(20+jl+8);
const imgViews=new Set((J.images||[]).map(i=>i.bufferView));const parts=[];let off=0;
for(let i=0;i<J.bufferViews.length;i++){const v=J.bufferViews[i];let d=BIN.slice(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  if(imgViews.has(i)){const im=J.images.find(x=>x.bufferView===i);const s=sharp(d).resize(+mx,+mx,{fit:'inside',withoutEnlargement:true}),meta=await sharp(d).metadata();
    if(meta.hasAlpha){d=await s.png({compressionLevel:9,palette:true,quality:70}).toBuffer();im.mimeType='image/png'}else{d=await s.jpeg({quality:80,mozjpeg:true}).toBuffer();im.mimeType='image/jpeg'}}
  const pad=(4-off%4)%4;if(pad){parts.push(Buffer.alloc(pad));off+=pad}
  v.byteOffset=off;v.byteLength=d.length;parts.push(d);off+=d.length}
const bin=Buffer.concat(parts),pad=(4-bin.length%4)%4,binP=Buffer.concat([bin,Buffer.alloc(pad)]);J.buffers=[{byteLength:binP.length}];
let js=Buffer.from(JSON.stringify(J));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
const hd=Buffer.alloc(12);hd.write('glTF',0);hd.writeUInt32LE(2,4);hd.writeUInt32LE(12+8+js.length+8+binP.length,8);
const c1=Buffer.alloc(8);c1.writeUInt32LE(js.length,0);c1.write('JSON',4);const c2=Buffer.alloc(8);c2.writeUInt32LE(binP.length,0);c2.write('BIN\0',4);
fs.writeFileSync(outF,Buffer.concat([hd,c1,js,c2,binP]));console.log(inF.split('/').pop(),'->',outF,(fs.statSync(outF).size/1024|0)+' KB');
