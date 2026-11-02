// IRON FIST ISLE: the opponents' brains (pure: no THREE, no DOM, no Math.random). One brain per fighter; think() returns what CombatCore wants for it this tick: {face,mx,mz,list}.
// An opponent fights with the SAME commands you do (light / heavyDown / heavyUp / parry / dodge / guardDown), so it uses your moves: the Light string, the Heavy branches, throws.
// It keeps a distance, circles while another fighter has the attack token, winds up with a short reaction delay, and answers your SLOW moves with a parry or a dodge (never a quick jab on reaction: mix up your speeds).
const DojoAI=(()=>{
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const rngOf=seed=>{let s=(seed>>>0)||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}};
  const MAX_ATTACKERS=2;
  function create(seed,A,o){o=o||{};return{A,rng:rngOf(seed),cd:30+(seed%40),script:null,si:0,sT:0,react:null,seen:[],circ:(seed&1)?1:-1,circT:0,hab:{},rdy:o.intro||60,rest:0}}
  // the player started a move: every brain notes it (habit reading) and may plan a reaction
  function noticeStart(B,e,C,self){
    if(!B||e.a!=='P')return;const A=B.A,mv=typeof Moves!=='undefined'?Moves[e.move]:null;
    B.seen.push(e.move);if(B.seen.length>8)B.seen.shift();
    if(A.read){const k=e.move;B.hab[k]=(B.hab[k]||0)+1;for(const j in B.hab)if(j!==k)B.hab[j]*=.7}
    const f=self,p=C.F.P;if(!f||f.act==='dead'||f.act==='stun'||B.react)return;
    const d=Math.hypot(p.x-f.x,p.z-f.z);if(d>A.reach+1.3||!mv)return;
    const slow=(mv.phases[0]&&mv.phases[0].n)>=9,habit=A.read&&B.hab[e.move]>=3;
    if(!slow&&!habit)return;                                  // a quick jab is never reacted to
    const r=B.rng(),pr=Math.min(.92,A.par+(habit?.5:0)),dg=A.dg+(habit?.2:0);
    if(r<pr)B.react={k:'parry',at:C.tick+Math.max(3,Math.round(mv.phases[0].n*.5)-2+Math.floor(B.rng()*3))};
    else if(r<pr+dg)B.react={k:'dodge',at:C.tick+2+Math.floor(B.rng()*4)}}
  function scriptOf(B,code){const s=[];let t=0;for(const ch of code){
      if(ch==='l'){s.push({t,c:{t:'light'}});t+=15+Math.floor(B.rng()*4)}
      else if(ch==='h'){s.push({t,c:{t:'heavyDown'}});s.push({t:t+4,c:{t:'heavyUp'}});t+=24}
      else if(ch==='p'){s.push({t,c:{t:'heavyDown'}});s.push({t:t+24,c:{t:'heavyUp'}});t+=36}
      else if(ch==='g'){s.push({t,c:{t:'guardDown'}});s.push({t:t+3,c:{t:'heavyDown'}});s.push({t:t+8,c:{t:'guardUp'}});t+=22}}
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
        if(R.k==='parry')h.list.push({t:'parry'});else{const sx=-uz*B.circ,sz=ux*B.circ;h.list.push({t:'dodge',dx:sx,dz:sz})}B.rest=14;return h}}
    if(B.rest>0)B.rest--;
    // a running attack script
    if(B.script){B.sT++;while(B.si<B.script.length&&B.script[B.si].t<=B.sT){h.list.push(Object.assign({},B.script[B.si].c));B.si++}
      if(B.si>=B.script.length&&f.act==='free'){B.script=null;B.cd=A.cd[0]+Math.floor(B.rng()*(A.cd[1]-A.cd[0]))}
      return h}
    if(f.act!=='free')return h;
    // movement: close in to the preferred range, back off if crowded, circle while waiting
    const att=others.filter(o=>o!==f&&o.act==='attack').length,tok=att<MAX_ATTACKERS;
    if(B.circT--<=0){B.circT=40+Math.floor(B.rng()*70);if(B.rng()<.4)B.circ=-B.circ}
    if(d>A.range+.35){h.mx=ux;h.mz=uz}
    else if(d<A.range-.55){h.mx=-ux*.7;h.mz=-uz*.7}
    else{h.mx=-uz*B.circ*.5;h.mz=ux*B.circ*.5}
    if(!tok&&d<A.range+1.8){h.mx=-uz*B.circ*.7;h.mz=ux*B.circ*.7}
    // guard while waiting (the better fighters keep their hands up when you are close)
    if(B.cd>0){B.cd--;if(d<A.reach+.8&&(p.act==='attack'||A.par>=.25)&&B.rng()<.02&&!f.guard)h.list.push({t:'guardDown'});if(f.guard&&B.cd<8)h.list.push({t:'guardUp'});return h}
    if(f.guard)h.list.push({t:'guardUp'});
    if(!tok||B.rest>0)return h;
    if(d<=A.reach){
      // a throw when you are turtling, otherwise a script from its repertoire
      let code=A.combo[Math.floor(B.rng()*A.combo.length)];
      if(p.guard&&d<2.1&&A.combo.some(c=>c.includes('g')))code=A.combo.find(c=>c.includes('g'));
      else if(code.includes('g')&&!(p.guard&&d<2.1))code='ll';
      if(p.act==='stun'&&p.sk==='stagger')code='lll';
      B.script=scriptOf(B,code);B.si=0;B.sT=0}
    return h}
  return{create,think,noticeStart,scriptOf,MAX_ATTACKERS}})();
if(typeof module!=='undefined')module.exports=DojoAI;
