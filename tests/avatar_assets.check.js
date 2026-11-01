// Static checks on the shipped avatar assets: rig compatibility with the game rig, budgets, and every clip set (names / bones / numbers) against the stock sets.
const fs=require('fs'),R=__dirname+'/../';let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
function glb(f){const b=fs.readFileSync(f);const jl=b.readUInt32LE(12);return JSON.parse(b.toString('utf8',20,20+jl))}
const stock=glb(R+'assets/char.glb'),sNames=n=>new Set(n.nodes.map(x=>x.name));
const stockJoints=new Set(stock.skins[0].joints.map(i=>stock.nodes[i].name));
const SETS=['anims','emotes','verb_anims','gun_anims','combat_anims','warden_anims','warden_mx_player','warden_mx_duelist'];
const clipsOf=f=>{const j=JSON.parse(fs.readFileSync(f,'utf8'));return Array.isArray(j)?j:j.clips};
for(const a of ['crypto','madea','samurai']){const big=a==='samurai';   // the Samurai is a heavier, fixed-look character (cloth, cape, hat): wider budgets
  const f=R+'assets/avatars/'+a+'.glb',J=glb(f),size=fs.statSync(f).size,side=JSON.parse(fs.readFileSync(R+'assets/avatars/'+a+'.json','utf8'));
  const joints=new Set(J.skins[0].joints.map(i=>J.nodes[i].name));
  ok(joints.size===stockJoints.size&&[...stockJoints].every(n=>joints.has(n)),a+': skeleton uses exactly the game rig bone names ('+joints.size+' joints)');
  ok(J.skins.length===1&&J.meshes.length===1,a+': one skin, one mesh (one draw call per player)');
  const prim=J.meshes[0].primitives[0];
  ok(prim.attributes._ZONE!==undefined,a+': has the recolour zone attribute');
  const tris=J.accessors[prim.indices].count/3;ok(tris<=(big?20000:10000),a+': triangle budget ('+tris+')');
  ok(size<(big?1400:700)*1024,a+': model file size '+(size/1024|0)+' KB');
  ok(J.images.length<=3&&J.materials.length===1,a+': '+J.images.length+' textures, 1 material');
  ok(fs.existsSync(R+'assets/avatars/'+a+'.mask.png'),a+': recolour mask exists');
  ok(side.heightM>1.6&&side.heightM<=2.05&&side.tris===tris,a+': sidecar matches the model ('+side.heightM+' m)');
  const meta=JSON.parse(fs.readFileSync(R+'assets/avatars/'+a+'/meta.json','utf8'));
  ok(meta.gait.walk.ratio>1&&meta.gait.walk.ratio<2&&meta.gait.jog.ratio>1&&meta.gait.jog.ratio<2,a+': measured gait ratios in range (walk '+meta.gait.walk.ratio+', jog '+meta.gait.jog.ratio+')');
  const rigNames=sNames(J);
  for(const s of SETS){
    const A=clipsOf(R+'assets/avatars/'+a+'/'+s+'.json'),S=clipsOf(R+'assets/'+s+'.json');
    ok(A.length===S.length&&S.every((c,i)=>A[i].name===c.name&&((meta.natural||[]).includes(s+':'+c.name)?A[i].duration>.3&&A[i].duration<8:Math.abs(A[i].duration-c.duration)<1e-3)),a+'/'+s+': same clips and order as the stock set; durations equal except the natural-cadence loops ('+A.length+')');
    let badBone=0,badNum=0,badQ=0;
    for(const c of A)for(const t of c.tracks){const b=t.name.split('.')[0];if(!rigNames.has(b))badBone++;
      let w=t.name.endsWith('.quaternion')?4:3;for(let i=0;i<t.values.length;i++)if(!Number.isFinite(t.values[i]))badNum++;
      if(w===4)for(let i=0;i<t.values.length;i+=4){const n=Math.hypot(t.values[i],t.values[i+1],t.values[i+2],t.values[i+3]);if(Math.abs(n-1)>.02)badQ++}}
    ok(badBone===0&&badNum===0&&badQ===0,a+'/'+s+': every track targets a rig bone, finite values, unit quaternions ('+badBone+'/'+badNum+'/'+badQ+')');
  }
}
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0);
