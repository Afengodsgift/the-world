// WardenMX: every sim move of every role has a clip mapping whose phase plan is sane, and the baked Mixamo assets contain the clips/durations it uses.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math,THREE:{},Blend:{},fetch:()=>{}};vm.createContext(c);
vm.runInContext(['Moves','WardenMX'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.X=WardenMX',c);
const {M,X}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const mv=M.MOVES||M.moves||M;
const need={player:['light','light2','light3','advance','evade','rising','heavy'],duelist:['cut','fall','thrust','twin','riposte','dash'],hollow:['sweep','slam','triple','leap'],soldier:['cut','thrust'],paladin:['cut','thrust','fall','twin','bash','dash','leap','quake'],parasite:['sweep','slam','triple','leap','cut','thrust','quake'],arissa:['cut','thrust','twin','fall','riposte','dash','leap','orb','bolt','quake']};
for(const role of Object.keys(X.ROLES)){
  const spec=X.ROLES[role],file=R+spec.file,exists=fs.existsSync(file);ok(exists,role+': asset '+spec.file+' exists'+(exists?' ('+(fs.statSync(file).size/1024|0)+' KB)':''));if(!exists)continue;
  const clips=JSON.parse(fs.readFileSync(file,'utf8')),dur={};for(const k of clips)dur[k.name]=k.duration;
  ok(fs.statSync(file).size<(spec.native?900:700)*1024,role+': asset is < '+(spec.native?900:700)+' KB');
  ok(Object.values(spec.loco).every(n=>dur[n]),role+': every locomotion clip exists');if(spec.guard)ok(dur[spec.guard],role+': guard clip exists');
  for(const id of need[role]){const m=mv[id];ok(m&&spec.moves[id],role+': move '+id+' is mapped');if(!m||!spec.moves[id])continue;
    const sq=X.norm(spec.moves[id]);ok(sq.every(s=>dur[s.c]),role+'/'+id+': its clips exist ('+sq.map(s=>s.c).join(',')+')');
    ok(sq.every(s=>!s.h||s.h[0]<s.h[1]&&s.h[1]<=dur[s.c]&&s.h[0]>=0),role+'/'+id+': swing windows lie inside their clips');
    const nAct=m.phases.filter(p=>p.k==='active').length;ok(spec.moves[id].seq?spec.moves[id].seq.length>=nAct:nAct===0?!spec.moves[id].h:spec.moves[id].h.length>=nAct,role+'/'+id+': has a swing window for each of its '+nAct+' active phases');
    const pl=X.plan(m.phases,spec.moves[id],cn=>dur[cn]);let sane=true;
    m.phases.forEach((p,i)=>{const e=pl[i];if(!e||!dur[e.c]||e.a<-1e-6||e.b>dur[e.c]+1e-6||e.b<e.a-1e-6)sane=false;
      if(p.k==='active'){const s=sq[Math.min(m.phases.slice(0,i).filter(q=>q.k==='active').length,sq.length-1)];if(Math.abs(e.a-s.h[0])>1e-6||Math.abs(e.b-s.h[1])>1e-6)sane=false}});
    ok(sane,role+'/'+id+': phase plan is in range, forward in time, and pins the active phase to the swing window')}}
process.exit(bad?1:0);
