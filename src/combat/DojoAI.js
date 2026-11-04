// IRON FIST ISLE: the opponents' brains (pure: no THREE, no DOM, no Math.random). One brain per fighter; think() returns what CombatCore wants for it this tick: {face,mx,mz,list}.
// An opponent fights with the SAME commands you do (light / heavyDown / heavyUp / parry / dodge / guardDown), so it uses your moves: the Light string, the Heavy branches, throws.
// It keeps a distance, circles while another fighter has the attack token, winds up with a short reaction delay, and answers your SLOW moves with a parry or a dodge (never a quick jab on reaction: mix up your speeds).
const DojoAI=(()=>{
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const rngOf=seed=>{let s=(seed>>>0)||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}};
  const MAX_ATTACKERS=2;
  function create(seed,A,o){o=o||{};return{A,rng:rngOf(seed),cd:30+(seed%40),script:null,si:0,sT:0,react:null,seen:[],circ:(seed&1)?1:-1,circT:0,hab:{},rdy:o.intro||60,rest:0,wait:0,tail:0,dr:null,stall:0,ctrAt:0}}
  // the player started a move: every brain notes it (habit reading) and may plan a reaction
  function noticeStart(B,e,C,self){
    if(!B||e.a!=='P')return;const A=B.A,mv=typeof Moves!=='undefined'?Moves[e.move]:null;
    B.seen.push(e.move);if(B.seen.length>8)B.seen.shift();
    if(A.read){const k=e.move;B.hab[k]=(B.hab[k]||0)+1;for(const j in B.hab)if(j!==k)B.hab[j]*=.7}
    const f=self,p=C.F.P;if(!f||f.act==='dead'||f.act==='stun'||B.react)return;
    const d=Math.hypot(p.x-f.x,p.z-f.z);if(d>A.reach+1.3||!mv)return;
    const slow=(mv.phases[0]&&mv.phases[0].n)>=9,habit=A.read&&B.hab[e.move]>=3;
    const slip=A.slip&&!slow&&B.rng()<A.slip;                  // a Boxer slips the odd jab (head movement); nobody else reacts to a quick one
    if(!slow&&!habit&&!slip)return;
    if(slip){B.react={k:'dodge',at:C.tick+2+Math.floor(B.rng()*3)};return}
    const r=B.rng(),pr=Math.min(.92,A.par+(habit?.5:0)),dg=A.dg+(habit?.2:0);
    if(r<pr)B.react={k:'parry',at:C.tick+Math.max(3,Math.round(mv.phases[0].n*.5)-2+Math.floor(B.rng()*3))};
    else if(r<pr+dg)B.react={k:'dodge',at:C.tick+2+Math.floor(B.rng()*4)}}
  // direct moves (the same ones the player's strings and branches use): k round kick, s push kick (big posture damage), n knee, d flying drop kick, u uppercut, f dash-in (closes the gap). [move, ticks until the next step]
  const ATK={k:['round',40],s:['push',30],n:['knee',28],d:['drop',44],u:['upper',34],f:['f_dash',26]};
  function scriptOf(B,code){const s=[];let t=0;for(const ch of code){
      if(ch==='l'){s.push({t,c:{t:'light'}});t+=15+Math.floor(B.rng()*4)}
      else if(ch==='h'){s.push({t,c:{t:'heavyDown'}});s.push({t:t+4,c:{t:'heavyUp'}});t+=24}
      else if(ch==='p'){s.push({t,c:{t:'heavyDown'}});s.push({t:t+24,c:{t:'heavyUp'}});t+=36}
      else if(ch==='g'){s.push({t,c:{t:'guardDown'}});s.push({t:t+3,c:{t:'heavyDown'}});s.push({t:t+8,c:{t:'guardUp'}});t+=22}
      else if(ATK[ch]){s.push({t,c:{t:'atk',m:ATK[ch][0]}});t+=ATK[ch][1]}}
    return s}
  // others = the other brains' fighters (for the attack token)
  function think(B,f,C,nt,others){
    const p=C.F.P,h={face:f.face,mx:0,mz:0,list:[]};
    if(!B||f.act==='dead'||!p)return h;
    const A=B.A,dx=p.x-f.x,dz=p.z-f.z,d=Math.hypot(dx,dz)||1e-6,face=Math.atan2(dx,dz),ux=dx/d,uz=dz/d;h.face=face;
    if(p.act==='dead')return h;
    if(f.act==='stun'||f.act==='dodge'){B.script=null;B.react=null;return h}
    if(B.rdy>0){B.rdy--;return h}
    // reaction (parry / dodge) planned when you started a move
    if(B.react&&nt>=B.react.at){const R=B.react;B.react=null;if(f.act==='free'||f.act==='attack'){B.script=null;
        if(R.k==='parry')h.list.push({t:'parry'});else{const sx=-uz*B.circ,sz=ux*B.circ;h.list.push({t:'dodge',dx:sx,dz:sz})}B.rest=A.ctr?4:14;if(A.ctr)B.ctrAt=nt+14;return h}}
    if(B.rest>0)B.rest--;if(B.tail>0)B.tail--;
    // a running attack script
    if(B.script){B.sT++;
      while(B.si<B.script.length&&B.script[B.si].t<=B.sT){const st=B.script[B.si];if(st.c.t==='atk'&&f.act!=='free'){if(++B.stall>70){B.script=null;B.stall=0;B.cd=20}break}B.stall=0;h.list.push(Object.assign({},st.c));B.si++}
      if(B.script&&B.si>=B.script.length&&f.act==='free'){B.script=null;B.tail=12;B.cd=A.cd[0]+Math.floor(B.rng()*(A.cd[1]-A.cd[0]))}
      return h}
    if(f.act!=='free')return h;
    // movement: with a director, walk to my slot on the ring around you (spread out, all in front of the camera); without one, close in / back off / circle
    const D=B.dr,att=others.filter(o=>o!==f&&o.act==='attack').length,tok=D?D.tok:att<MAX_ATTACKERS;
    if(B.circT--<=0){B.circT=40+Math.floor(B.rng()*70);if(B.rng()<.4)B.circ=-B.circ}
    if(D&&D.sx!==undefined&&!D.tok){const vx=D.sx-f.x,vz=D.sz-f.z,vd=Math.hypot(vx,vz);
      if(vd>.35){const k=Math.min(1,vd/1.2);h.mx=vx/vd*k;h.mz=vz/vd*k}else{h.mx=-uz*B.circ*.25*(A.fw||1);h.mz=ux*B.circ*.25*(A.fw||1)}
      if(d<A.range-.9){h.mx=-ux*.8;h.mz=-uz*.8}                                  // never stand on top of you while waiting
      if(D.sep){h.mx+=D.sep[0];h.mz+=D.sep[1]}}
    else{
      if(d>A.range+.35){h.mx=ux;h.mz=uz}
      else if(d<A.range-.55){h.mx=-ux*.7;h.mz=-uz*.7}
      else{h.mx=-uz*B.circ*.5*(A.fw||1);h.mz=ux*B.circ*.5*(A.fw||1)}
      if(!tok&&d<A.range+1.8){h.mx=-uz*B.circ*.7;h.mz=ux*B.circ*.7}}
    // guard while waiting (the better fighters keep their hands up when you are close)
    if(B.cd>0){B.cd--;if(d<A.reach+.8&&(p.act==='attack'||A.par>=.25)&&B.rng()<.02&&!f.guard)h.list.push({t:'guardDown'});if(f.guard&&B.cd<8)h.list.push({t:'guardUp'});
      // a Kickboxer punishes a careless approach with a push kick even while it is waiting its turn
      if(A.punish&&!B.rest&&d<A.punish&&p.act==='attack'&&(!D||D.tok||D.free)&&!f.guard&&B.rng()<.5){B.script=scriptOf(B,'s');B.si=0;B.sT=0;B.stall=0}
      return h}
    if(f.guard)h.list.push({t:'guardUp'});
    if(!tok||B.rest>0)return h;
    // a Boxer counter-attacks right after it slips or parries
    if(A.ctr&&B.ctrAt&&nt>=B.ctrAt&&nt<B.ctrAt+40&&d<=A.reach+.3){B.ctrAt=0;B.script=scriptOf(B,'lu');B.si=0;B.sT=0;B.stall=0;return h}
    if(d<=A.reach+(A.dive&&d>A.reach-.6?.9:0)){
      // a throw when you are turtling (a Grappler grabs whenever it is close: grabs beat guard, only a dodge saves you), otherwise a script from its repertoire
      let code=A.combo[Math.floor(B.rng()*A.combo.length)];
      const grabs=A.combo.some(c=>c.includes('g'));
      if(grabs&&((p.guard&&d<2.1)||(A.grab&&d<2.0)))code=A.combo.find(c=>c.includes('g'));
      else if(code.includes('g'))code='ll';
      if(p.act==='stun'&&p.sk==='stagger')code=A.stag||'lll';
      B.script=scriptOf(B,code);B.si=0;B.sT=0;B.stall=0}
    return h}
  // ---- THE COMBAT DIRECTOR: one per round, called once per tick BEFORE the brains think ----
  // Hands out the attack token (one attacker at a time; two only against 3+ foes, and only from clearly different sides), spreads the waiting foes on a ring in FRONT of you (so every
  // threat is on screen, none behind the camera), keeps them apart, and refuses a token when an ally stands in the line of attack. Pure and deterministic.
  const TAU=Math.PI*2,SPREAD=3.84;   // 220 degrees of arc in front of you
  function director(){return{last:-999,gap:26}}
  function plan(Dr,list,C,nt){
    const p=C.F.P;if(!p)return;let n=0;
    for(let i=0;i<list.length;i++){const x=list[i];if(x.f.act!=='dead'){n++;if(!x.ai.dr)x.ai.dr={tok:false,free:false}}}
    if(!n)return;
    // base direction: from you toward the middle of the live foes
    let bx=0,bz=0;for(let i=0;i<list.length;i++){const f=list[i].f;if(f.act==='dead')continue;const dx=f.x-p.x,dz=f.z-p.z,d=Math.hypot(dx,dz)||1;bx+=dx/d;bz+=dz/d}
    const base=Math.atan2(bx,bz),maxT=n>=3?2:1;
    // slot order: by the angle each foe already stands at (no one has to cross another to reach its slot)
    const live=[];for(let i=0;i<list.length;i++)if(list[i].f.act!=='dead'){const f=list[i].f;let a=Math.atan2(f.x-p.x,f.z-p.z)-base;a=Math.atan2(Math.sin(a),Math.cos(a));live.push({x:list[i],a})}
    live.sort((u,v)=>u.a-v.a);
    const step=n>1?Math.min(1.9,SPREAD/(n-1)):0;
    let holders=0;for(let i=0;i<live.length;i++){const B=live[i].x.ai,f=live[i].x.f;if(f.act==='attack'||B.script||B.tail>0)holders++}
    // grant: only a foe that will start an attack this very tick, waited longest, with a clear line and (if someone is already attacking) from a different side
    let pick=null;
    if(holders<maxT&&nt-Dr.last>=Dr.gap){let bw=-1;
      for(let i=0;i<live.length;i++){const F=live[i].x,B=F.ai,f=F.f,A=B.A;if(f.act!=='free'||B.script||B.cd>0||B.rest>0||B.rdy>0||B.tail>0)continue;
        const dx=p.x-f.x,dz=p.z-f.z,d=Math.hypot(dx,dz)||1;if(d>A.reach+(A.dive?.9:0))continue;
        let clear=true,side=true;
        for(let j=0;j<live.length;j++){if(j===i)continue;const o=live[j].x,g=o.f,L2=d*d,t=Math.max(0,Math.min(1,((g.x-f.x)*dx+(g.z-f.z)*dz)/L2));
          if(Math.hypot(f.x+dx*t-g.x,f.z+dz*t-g.z)<.75&&t>0&&t<1){clear=false;break}
          if(o.f.act==='attack'||o.ai.script||o.ai.tail>0){let da=Math.abs(Math.atan2(f.x-p.x,f.z-p.z)-Math.atan2(g.x-p.x,g.z-p.z));if(da>Math.PI)da=TAU-da;if(da<1.0)side=false}}
        if(!clear||!side)continue;
        if(B.wait>bw){bw=B.wait;pick=F}}}
    if(pick){Dr.last=nt;pick.ai.wait=0}
    for(let k=0;k<live.length;k++){const F=live[k].x,B=F.ai,f=F.f,D=B.dr;
      const ang=base+(k-(n-1)/2)*step,R=B.A.range+(n>1?.2:0);
      D.sx=p.x+Math.sin(ang)*R;D.sz=p.z+Math.cos(ang)*R;
      D.tok=n===1?true:(F===pick||f.act==='attack'||!!B.script);
      D.free=n===1||holders===0;
      if(!D.tok)B.wait++;
      // separation: step away from any ally closer than 1.5 m
      let sx=0,sz=0;for(let j=0;j<live.length;j++){if(j===k)continue;const g=live[j].x.f,dx=f.x-g.x,dz=f.z-g.z,d=Math.hypot(dx,dz);if(d<1.5&&d>1e-4){const w=(1.5-d)/1.5;sx+=dx/d*w;sz+=dz/d*w}}
      D.sep=(sx||sz)?[sx*.9,sz*.9]:null}}
  return{create,think,noticeStart,scriptOf,director,plan,MAX_ATTACKERS}})();
if(typeof module!=='undefined')module.exports=DojoAI;
