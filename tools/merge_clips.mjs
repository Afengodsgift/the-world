// node tools/merge_clips.mjs <asset.json> <new-clips.json>  : append (or replace by name) the new clips in an existing warden_mx asset (array or {clips})
import fs from 'fs';const [,,A,N]=process.argv;const a=JSON.parse(fs.readFileSync(A,'utf8')),n=JSON.parse(fs.readFileSync(N,'utf8'));const arr=Array.isArray(a)?a:a.clips,nn=Array.isArray(n)?n:n.clips;
const have=new Map(arr.map((c,i)=>[c.name,i]));for(const c of nn){if(have.has(c.name))arr[have.get(c.name)]=c;else arr.push(c)}
fs.writeFileSync(A,JSON.stringify(Array.isArray(a)?arr:Object.assign(a,{clips:arr})));console.log(A,arr.length,'clips',(fs.statSync(A).size/1024|0)+' KB');
