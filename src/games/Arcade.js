// Game Hall: a pad in town that opens a menu of 2-player games.
// All games talk over the existing Supabase channel using ONE broadcast event: 'ag'.
// Payload shape: {g:'start',game,...} to launch, otherwise {g:<gameId>,...} routed to that game.
// Relies on globals from index.html: S, chan, others, scene, H, TOWN, banner, chime, myName, THREE.
const Arcade=(()=>{
  const PAD={x:TOWN.x+Math.cos(1.4)*19,z:TOWN.z+Math.sin(1.4)*19};
  let ring,root,panel,hud,A=null;
  const partner=()=>[...others.values()][0];
  const pname=()=>{const o=partner();return (o&&o.group.userData.nm)||'Partner'};
  const send=p=>{if(chan)chan.send({type:'broadcast',event:'ag',payload:p})};
  const near=()=>Math.hypot(S.x-PAD.x,S.z-PAD.z)<6;

  // ---------- UI ----------
  function ui(){
    if(root)return;
    const st=document.createElement('style');
    st.textContent='#arc{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;background:#0009;backdrop-filter:blur(4px)}'
    +'#arc .p{background:#1a1f3af2;color:#fff;border-radius:18px;padding:20px;width:min(92vw,380px);max-height:88vh;overflow:auto;text-align:center;box-shadow:0 10px 40px #000a}'
    +'#arc h2{margin:0 0 4px;font-size:22px}#arc small{opacity:.7}#arc .g{display:grid;gap:8px;margin-top:12px}'
    +'#arc button{font:inherit;padding:12px;border-radius:12px;border:0;background:#ffffff22;color:#fff;cursor:pointer}#arc button:active{background:#ffffff44}'
    +'#arc button.big{font-size:20px;padding:14px 10px}#arc button.pri{background:#ff6b8b}'
    +'#arc .b3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}#arc .b3 button{font-size:34px;height:84px;padding:0}'
    +'#arc .row{display:flex;gap:8px;justify-content:center;margin-top:12px}#arc .row button{flex:1}#arc .sc{margin-top:10px;opacity:.85}';
    document.head.appendChild(st);
    root=document.createElement('div');root.id='arc';root.innerHTML='<div class="p"></div>';
    document.body.appendChild(root);panel=root.firstChild;
    panel.onclick=e=>{const b=e.target.closest('[data-a]');if(b)act(b.dataset.a,b.dataset.v)};
    hud=document.createElement('div');
    hud.style.cssText='position:fixed;z-index:6;top:calc(env(safe-area-inset-top,0px) + 92px);left:0;right:0;text-align:center;font-size:20px;text-shadow:0 2px 8px #000;pointer-events:none;display:none';
    document.body.appendChild(hud);
  }
  const open=h=>{ui();panel.innerHTML=h;root.style.display='flex'};
  const close=()=>{if(root)root.style.display='none'};
  const btn=(a,v,t,c)=>'<button data-a="'+a+'" data-v="'+(v===undefined?'':v)+'" class="'+(c||'')+'">'+t+'</button>';
  function menu(){
    A=null;
    open('<h2>🎮 Game Hall</h2><small>Pick something to play with '+pname()+'</small><div class="g">'
      +btn('start','ttt','⭕ Tic-Tac-Toe','big')+btn('start','rps','✊ Rock Paper Scissors','big')
      +btn('start','quiz','💞 How Well Do You Know Me?','big')+btn('start','tag','🏃 Tag (in the world)','big')
      +btn('close','','Close')+'</div>');
  }
  function render(){if(A&&G[A.g]&&G[A.g].render)G[A.g].render()}

  // ---------- routing ----------
  function launch(game,local,extra){
    if(!G[game])return;
    if(hud)hud.style.display='none';
    G[game].start(local,extra||{});
  }
  function act(a,v){
    if(a==='close'){close();return}
    if(a==='menu'){menu();return}
    if(a==='start'){
      if(!partner()){banner('Your partner needs to be in the world 💞','GAME HALL');return}
      const extra=G[v].init?G[v].init():{};
      send(Object.assign({g:'start',game:v},extra));launch(v,true,extra);return;
    }
    if(A&&G[A.g]&&G[A.g].act)G[A.g].act(a,v);
  }
  function onMsg(p){
    if(!p)return;
    if(p.g==='start'){launch(p.game,false,p);return}
    if(A&&A.g===p.g&&G[p.g].msg)G[p.g].msg(p);
  }

  const G={};
  const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  // ---------- Tic-Tac-Toe ----------
  G.ttt={
    start(local){
      const sc=A&&A.g==='ttt'?A.sc:{w:0,l:0,d:0};
      A={g:'ttt',b:Array(9).fill(''),mine:local?'X':'O',turn:'X',done:false,sc};G.ttt.render();
    },
    act(a,v){
      if(a!=='m')return;const i=+v;
      if(A.done||A.turn!==A.mine||A.b[i])return;
      G.ttt.move(i,A.mine);send({g:'ttt',i});
    },
    msg(p){if(p.i!==undefined&&!A.b[p.i])G.ttt.move(p.i,A.mine==='X'?'O':'X')},
    move(i,s){
      A.b[i]=s;A.turn=s==='X'?'O':'X';
      let w=null;for(const L of LINES)if(A.b[L[0]]&&A.b[L[0]]===A.b[L[1]]&&A.b[L[0]]===A.b[L[2]])w=A.b[L[0]];
      if(!w&&A.b.every(Boolean))w='d';
      if(w){A.done=true;A.win=w;if(w==='d')A.sc.d++;else if(w===A.mine)A.sc.w++;else A.sc.l++;chime()}
      G.ttt.render();
    },
    render(){
      let s=A.done?(A.win==='d'?"It's a draw 🤝":A.win===A.mine?'You win! 🎉':pname()+' wins 😅'):(A.turn===A.mine?'Your turn ('+A.mine+')':pname()+"'s turn…");
      let cells=A.b.map((c,i)=>'<button data-a="m" data-v="'+i+'">'+(c==='X'?'❌':c==='O'?'⭕':'')+'</button>').join('');
      open('<h2>Tic-Tac-Toe</h2><small>'+s+'</small><div class="b3">'+cells+'</div>'
        +'<div class="sc">You '+A.sc.w+' · Draws '+A.sc.d+' · '+pname()+' '+A.sc.l+'</div>'
        +'<div class="row">'+(A.done?btn('start','ttt','Play again','pri'):'')+btn('menu','','Menu')+btn('close','','Close')+'</div>');
    }
  };

  // ---------- Rock Paper Scissors ----------
  const RPS=['✊','✋','✌️'];
  G.rps={
    start(){
      const sc=A&&A.g==='rps'?A.sc:{w:0,l:0,d:0};
      A={g:'rps',r:0,me:{},th:{},sc,shown:{}};G.rps.render();
    },
    act(a,v){
      if(a!=='p'||A.me[A.r]!==undefined)return;
      A.me[A.r]=+v;send({g:'rps',r:A.r,p:+v});G.rps.check();
    },
    msg(p){A.th[p.r]=p.p;G.rps.check()},
    check(){
      const r=A.r;
      if(A.me[r]!==undefined&&A.th[r]!==undefined&&!A.shown[r]){
        A.shown[r]=1;const d=(A.me[r]-A.th[r]+3)%3;
        if(d===0)A.sc.d++;else if(d===1)A.sc.w++;else A.sc.l++;chime();
        G.rps.render();setTimeout(()=>{if(A&&A.g==='rps'&&A.r===r){A.r++;G.rps.render()}},2600);
      }else G.rps.render();
    },
    render(){
      const r=A.r,rev=A.shown[r];let mid;
      if(rev){const d=(A.me[r]-A.th[r]+3)%3;
        mid='<div style="font-size:54px;margin:14px 0">'+RPS[A.me[r]]+' vs '+RPS[A.th[r]]+'</div><b>'+(d===0?'Draw':d===1?'You win the round! 🎉':pname()+' wins the round')+'</b>';}
      else if(A.me[r]!==undefined)mid='<div style="font-size:54px;margin:14px 0">'+RPS[A.me[r]]+' vs ❔</div><small>Waiting for '+pname()+'…</small>';
      else mid='<div class="b3">'+RPS.map((e,i)=>'<button data-a="p" data-v="'+i+'">'+e+'</button>').join('')+'</div>';
      open('<h2>Rock Paper Scissors</h2><small>Round '+(r+1)+'</small>'+mid
        +'<div class="sc">You '+A.sc.w+' · Draws '+A.sc.d+' · '+pname()+' '+A.sc.l+'</div>'
        +'<div class="row">'+btn('menu','','Menu')+btn('close','','Close')+'</div>');
    }
  };

  // ---------- How Well Do You Know Me? ----------
  const QS=[
    ['Perfect date night?',['Movie at home','Fancy dinner','Outdoor adventure','Game night']],
    ['Favourite way to relax?',['Sleeping','Watching shows','Music','Going outside']],
    ['Pick a dream trip',['Beach','Mountains','Big city','Countryside']],
    ['Comfort food?',['Rice dishes','Soup / stew','Snacks','Something sweet']],
    ['Morning or night?',['Early bird','Night owl','Depends on the day','Neither, I need sleep']],
    ['How do I show love most?',['Words','Gifts','Time together','Helping out']],
    ['A text back should arrive…',['Instantly','Within the hour','Whenever','Call me instead']],
    ['Best surprise?',['A gift','A trip','A homemade meal','A love note']],
    ['Pick a superpower',['Flying','Invisibility','Time travel','Reading minds']],
    ['Weekend plan?',['Stay in','Hang with friends','Explore somewhere new','Be productive']],
    ['What annoys me most?',['Being late','Messy space','Loud chewing','Being ignored']],
    ['Which movie type?',['Comedy','Romance','Action','Horror']]
  ];
  const NQ=8;
  G.quiz={
    init(){const o=QS.map((_,i)=>i).sort(()=>Math.random()-.5).slice(0,NQ);return {order:o}},
    start(local,x){A={g:'quiz',order:x.order,i:0,ms:{},mg:{},ts:{},tg:{}};G.quiz.render()},
    act(a,v){
      const i=A.i;
      if(a==='s'&&A.ms[i]===undefined){A.ms[i]=+v;send({g:'quiz',k:'s',i,v:+v})}
      else if(a==='g'&&A.mg[i]===undefined){A.mg[i]=+v;send({g:'quiz',k:'g',i,v:+v})}
      else if(a==='n'){A.i++}
      G.quiz.render();
    },
    msg(p){(p.k==='s'?A.ts:A.tg)[p.i]=p.v;G.quiz.render()},
    render(){
      const i=A.i;
      if(i>=A.order.length){
        let me=0,th=0;for(let k=0;k<A.order.length;k++){if(A.mg[k]===A.ts[k])me++;if(A.tg[k]===A.ms[k])th++}
        const tot=A.order.length,done=Object.keys(A.tg).length>=tot&&Object.keys(A.ts).length>=tot;
        open('<h2>💞 Results</h2>'+(done?'<div style="font-size:20px;margin:14px 0">You know '+pname()+': <b>'+me+'/'+tot+'</b><br>'+pname()+' knows you: <b>'+th+'/'+tot+'</b></div><b>'
          +(me+th>=tot*1.5?'Soulmates 😍':me+th>=tot?'Pretty in sync 💕':'Lots left to learn, go on more dates 😂')+'</b>'
          :'<small>Waiting for '+pname()+' to finish…</small>')
          +'<div class="row">'+btn('start','quiz','Play again','pri')+btn('menu','','Menu')+btn('close','','Close')+'</div>');return;
      }
      const [q,opts]=QS[A.order[i]],hdr='<h2>💞 How well do you know me?</h2><small>Question '+(i+1)+'/'+A.order.length+'</small><div style="margin:12px 0;font-size:18px">'+q+'</div>';
      const list=k=>'<div class="g">'+opts.map((o,n)=>btn(k,n,o)).join('')+'</div>';
      if(A.ms[i]===undefined)open(hdr+'<small>Answer for <b>yourself</b></small>'+list('s'));
      else if(A.mg[i]===undefined)open(hdr+'<small>Now guess what <b>'+pname()+'</b> picked</small>'+list('g'));
      else if(A.ts[i]===undefined||A.tg[i]===undefined)open(hdr+'<small>Waiting for '+pname()+'…</small>');
      else{
        const a=A.mg[i]===A.ts[i],b=A.tg[i]===A.ms[i];
        open(hdr+'<div style="text-align:left;line-height:1.7">You picked: <b>'+opts[A.ms[i]]+'</b><br>'+pname()+' picked: <b>'+opts[A.ts[i]]+'</b><br>'
          +'You guessed '+opts[A.mg[i]]+' '+(a?'✅':'❌')+'<br>'+pname()+' guessed '+opts[A.tg[i]]+' '+(b?'✅':'❌')+'</div>'
          +'<div class="row">'+btn('n','',i+1>=A.order.length?'See results':'Next','pri')+'</div>');
      }
    }
  };

  // ---------- Tag (in-world) ----------
  const DUR=90000;
  G.tag={
    init(){return {youIt:Math.random()<.5}}, // starter tells partner whether THEY are it
    start(local,x){
      const it=local?!x.youIt:!!x.youIt; // local starter: x.youIt refers to partner
      A={g:'tag',it,t0:performance.now()+3000,mine:0,cool:0,over:false,theirs:null,sent:false};
      close();ui();
      banner(it?"You're IT! Catch "+pname()+' 🏃':'RUN! Don’t get tagged 💨','TAG');
    },
    msg(p){
      if(p.k==='t'){A.it=true;A.cool=performance.now()+2500;banner("You're it!",'TAGGED');chime()}
      else if(p.k==='e'){A.theirs=p.ms;G.tag.finish()}
    },
    tick(dt){
      const now=performance.now();
      if(A.over){return}
      if(now<A.t0){hud.style.display='block';hud.style.fontSize='44px';hud.textContent=Math.ceil((A.t0-now)/1000);return}
      hud.style.display='block';hud.style.fontSize='20px';
      const left=Math.max(0,DUR-(now-A.t0));
      if(A.it)A.mine+=dt*1000;
      const o=partner();
      if(A.it&&o&&now>A.cool){
        const p=o.group.position;
        if(Math.hypot(S.x-p.x,S.z-p.z)<3&&Math.abs(S.y-p.y)<4){A.it=false;A.cool=now+2500;send({g:'tag',k:'t'});banner('Tagged! Run! 💨','TAG');chime()}
      }
      hud.textContent=(A.it?'🔴 YOU’RE IT':'🟢 RUN!')+'  ·  '+Math.ceil(left/1000)+'s  ·  it-time '+(A.mine/1000).toFixed(1)+'s';
      if(left<=0){A.over=true;hud.style.display='none';A.sent=true;send({g:'tag',k:'e',ms:Math.round(A.mine)});G.tag.finish()}
    },
    finish(){
      if(!A||A.g!=='tag'||!A.over)return;
      if(A.theirs===null){open('<h2>Time!</h2><small>Waiting for '+pname()+'…</small>');return}
      const m=A.mine,t=A.theirs,w=m<t?'You win! 🎉':m>t?pname()+' wins 😅':'Perfect tie 🤝';
      open('<h2>🏃 Tag results</h2><div style="margin:14px 0;font-size:18px">Time as “it”<br>You: <b>'+(m/1000).toFixed(1)+'s</b><br>'+pname()+': <b>'+(t/1000).toFixed(1)+'s</b></div><b>'+w+'</b><small><br>Less time as “it” wins</small>'
        +'<div class="row">'+btn('start','tag','Play again','pri')+btn('menu','','Menu')+btn('close','','Close')+'</div>');
      chime();
    }
  };

  // ---------- world pad ----------
  function build(){
    const y=H(PAD.x,PAD.z);
    const g=new THREE.Group();g.position.set(PAD.x,y,PAD.z);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.6,.5,32),new THREE.MeshStandardMaterial({color:'#ff6b8b',emissive:'#ff2f66',emissiveIntensity:.5}));
    base.position.y=.25;g.add(base);
    ring=new THREE.Mesh(new THREE.TorusGeometry(2.4,.18,10,40),new THREE.MeshBasicMaterial({color:'#ffe66b',fog:false}));
    ring.rotation.x=Math.PI/2;ring.position.y=1.6;g.add(ring);
    const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');
    x.fillStyle='#1a1f3a';x.fillRect(0,0,512,128);x.fillStyle='#fff';x.font='bold 62px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('🎮 GAME HALL',256,68);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(5,1.25),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}));
    sign.position.y=4.6;sign.userData.bill=true;g.add(sign);ring.userData.sign=sign;
    scene.add(g);
  }
  function tick(dt,t){
    if(ring){ring.rotation.z+=dt*1.5;ring.position.y=1.6+Math.sin(t/400)*.15;if(ring.userData.sign)ring.userData.sign.rotation.y+=dt*.6}
    if(A&&A.g==='tag')G.tag.tick(dt);
  }

  Interaction.register('arcade','Open Game Hall',()=>near(),()=>menu());
  return {build,tick,onMsg,pos:PAD};
})();
