// NIGHTMARE PACK: every foe move of every humanoid boss has a real clip (hand-made spec or auto-chosen), the clips exist in the baked asset, windows sit inside the clip and match the move's active phases
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math,THREE:{},Blend:{},fetch:()=>{},window:{},document:{}};vm.createContext(c);
vm.runInContext(['Moves','WardenMX'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.X=WardenMX',c);const{M,X}=c;
let n=0,bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++;process.exitCode=1}else n++};
const roles=['dknight','penitent','gwyn','capra','samurai','vampire','saint','veil','oath4'];
for(const r of roles){const Ro=X.ROLES[r];ok(Ro&&Ro.pack,r+': uses the nightmare pack');
  const file=Ro.file||X.ROLES.penitent.file;const cl=JSON.parse(fs.readFileSync(R+file,'utf8'));const arr=Array.isArray(cl)?cl:cl.clips,dur={};arr.forEach(x=>dur[x.name]=x.duration);for(const q of['p_knock','p_hurt','p_hitc','p_hith','p_deathA','p_deathB','p_deathC','p_kick','p_dash','p_combo'])dur[q]=dur[q]||9;
  for(const nm of['sx_cross','sx_combo','ax_three','bl_two','mg_one','mg_gs'])ok(dur[nm],r+': has clip '+nm);
  if(Ro.g)ok(dur.g_gcombo&&dur.g_down,r+': has the great-sword set');
  let cnt=0;
  for(const id in M){const m=M[id];if(!m||m.who!=='D'||!m.phases)continue;const sp=X.specOf(Ro,id);if(!sp&&/^(slash|atk)/.test(id))continue;
    if(!sp){ok(false,r+': move '+id+' has no animation');continue}cnt++;
    const seq=X.norm(sp);let good=true;for(const s of seq){if(!dur[s.c]){ok(false,r+':'+id+' clip '+s.c+' missing');good=false;continue}if(s.h&&(s.h[1]>dur[s.c]+.02||s.h[0]<0||s.h[1]<=s.h[0])){ok(false,r+':'+id+' window '+s.h+' outside '+s.c+' ('+dur[s.c]+')');good=false}}
    if(!good)continue;const act=m.phases.filter(p=>p.k==='active').length;
    if(act&&Ro.auto&&Ro.auto[id]===sp)ok(seq.length>=act,r+':'+id+' '+act+' active phase(s) vs '+seq.length+' windows');
    const pl=X.plan(m.phases,sp,cn=>dur[cn]||9);ok(pl.every(q=>q&&q.c&&isFinite(q.a)&&isFinite(q.b)&&q.b>=q.a-1e-6),r+':'+id+' plan covers every phase with forward clip time')}
  ok(cnt>40,r+': '+cnt+' moves animated')}
// hit reactions: the T-pose-on-hit fix needs the real flinch clips in every native boss file
for(const r of roles.concat(['paladin','arissa','archer','ganfaul','gdn'])){const Ro=X.ROLES[r];ok(Ro&&Ro.hr,r+': uses the real hit-reaction clips');const cl=JSON.parse(fs.readFileSync(R+(Ro.file||X.ROLES.penitent.file),'utf8')),arr=Array.isArray(cl)?cl:cl.clips,nm=new Set(arr.map(x=>x.name));for(const h of['hr_chest','hr_sw','hr_head','hr_kid','hr_side','hr_L','hr_big','hr_up'])ok(nm.has(h),r+': has '+h)}
// Death's Sentence victim clips on the avatars
for(const a of['crypto','madea']){const cl=JSON.parse(fs.readFileSync(R+'assets/avatars/'+a+'/warden_mx_player.json','utf8')),arr=Array.isArray(cl)?cl:cl.clips,nm=new Set(arr.map(x=>x.name));for(const h of['ds_victim','ds_side','ds_up'])ok(nm.has(h),a+': has '+h)}
ok(X.ROLES.player.dsv&&X.ROLES.player_twin.dsv,'player roles play the Death\'s Sentence victim clips')
console.log(n+' checks')
