// WARDEN co-op transport + state packing (pure: no THREE/DOM). Two players (the world is 2-max) can fight a boss site together.
// HOST = whoever engaged the site first: runs the foes' AI + their sim (authoritative for foes). Each player stays AUTHORITATIVE FOR THEMSELVES (own dodges / blocks / hits taken are judged on their own phone, so
// defence timing never waits for the network). The partner is a PUPPET fighter ('Q') in your local sim: its state is overwritten from the partner's 15 Hz report so your foes can hit it / it can hit your foes.
//   host -> guest 's': foe states (+ the foe moves that started) + the host's own fighter           guest -> host 'g': the guest's fighter
//   'h' = host hello (1 Hz, names the site)   'j' = guest joined   'l' = left
// Messages ride the world's existing realtime channel as broadcast event 'wd' (index.html calls WardenNet.onMsg).
// Globals used (browser only): chan, myId. Moves is read through the `mv` argument so tests can pass their own.
const WardenNet=(()=>{
  const FIELDS=['x','z','face','hp','st','po','act','sk','pt','pi','pk','hold','stun','guard','c','kr','kx','kz','gpt','rel','chg','dm','hpMax'];
  const r3=v=>typeof v==='number'?Math.round(v*1000)/1000:v;
  function pack(f){const o={};for(const k of FIELDS)o[k]=r3(f[k]);o.mv=f.mv?f.mv.id:null;o.dir=f.dir?[r3(f.dir[0]),r3(f.dir[1])]:null;o.done=Object.keys(f.done||{}).filter(k=>f.done[k]);return o}
  // write a received state into a local fighter. pos: 1 = snap x/z, 0..1 = blend (foes, smooths 15 Hz updates), 0 = keep local x/z.
  function apply(f,o,M,pos){
    const px=f.x,pz=f.z;for(const k of FIELDS)if(o[k]!==undefined&&k!=='x'&&k!=='z')f[k]=o[k];
    const d=Math.hypot(o.x-px,o.z-pz),b=pos===undefined?1:pos;if(b>=1||d>2.5){f.x=o.x;f.z=o.z}else if(b>0){f.x=px+(o.x-px)*b;f.z=pz+(o.z-pz)*b}
    f.dir=o.dir||null;f.done={};for(const k of o.done||[])f.done[k]=true;
    if(o.act==='attack'&&o.mv&&M[o.mv]){f.mv=M[o.mv];f.ph=M.expand(o.mv,o.hold|0)}else{f.mv=o.mv&&M[o.mv]?M[o.mv]:null;f.ph=null;if(o.act==='attack'){f.act='free'}}
    return f}
  // ---------- session ----------
  const S={mode:'solo',site:null,partner:null,helloAt:{},last:{},gotSnap:0,gotRep:0,rep:null,snap:null,starts:[],joined:false,left:false,t0:0,h:null};
  let handler=null;
  const mine=()=>typeof myId!=='undefined'?myId:'me';
  function send(p){try{if(typeof chan!=='undefined'&&chan&&p){p.from=mine();chan.send({type:'broadcast',event:'wd',payload:p})}}catch(e){}}
  function onMsg(p){if(!p||p.from===mine())return;const t=performance.now();
    switch(p.k){
      case'h':S.helloAt[p.s]={t,from:p.from,t0:p.t0};break;
      case'j':S.joined=true;S.partner=p.from;break;
      case'l':S.left=true;break;
      case's':S.snap=p;S.gotSnap=t;S.partner=p.from;break;
      case'g':S.rep=p;S.gotRep=t;S.partner=p.from;break}
    if(handler)handler(p)}
  const hostFor=s=>{const h=S.helloAt[s];return h&&performance.now()-h.t<2600?h:null};
  return{pack,apply,send,onMsg,hostFor,S,FIELDS,setHandler:f=>{handler=f},reset:()=>{S.mode='solo';S.site=null;S.rep=null;S.snap=null;S.starts=[];S.joined=false;S.left=false;S.gotSnap=0;S.gotRep=0}}})();
if(typeof module!=='undefined')module.exports=WardenNet;
