// Parkour Isle wiring: island placement, course vs plateau, animation clips + plan, files in index.html.
const fs=require('fs'),vm=require('vm');let bad=0;const ok=(c,m)=>{if(!c){bad++;console.log('✗ '+m)}else if(process.env.V)console.log('ok '+m)};
const R=f=>fs.readFileSync(__dirname+'/../'+f,'utf8');
const ctx={console,Math,location:{search:''}};vm.createContext(ctx);
// island data: pull PKI/PKH out of islands.js textually (the file needs browser globals)
const src=R('src/data/islands.js'),a=src.indexOf('const PKI='),b=src.indexOf('const KT=');vm.runInContext(src.slice(a,b)+';this.PKI=PKI;this.PKH=PKH',ctx);
const {PKI,PKH}=ctx;
for(const f of['ParkourCore','ParkourCourse','ParkourAnim'])vm.runInContext(R('src/parkour/'+f+'.js')+';this.'+f+'='+f,ctx);
const C=ctx.ParkourCourse.build();
ok(Math.abs(PKH(0,0)-C.GY)<1e-9&&Math.abs(PKH(PKI.flat-1,0)-C.GY)<1e-9,'plateau height equals the course ground');
ok(PKH(PKI.R+5,0)<0,'the island ends in the sea');
// no other island's reach overlaps ours
const isl=[...src.matchAll(/n:'([^']+)',x:(-?\d+),z:(-?\d+),R:(\d+)/g)].map(m=>({n:m[1],x:+m[2],z:+m[3],R:+m[4]}));
for(const i of isl)ok(Math.hypot(i.x-PKI.x,i.z-PKI.z)>i.R+PKI.reach+60,'no overlap with '+i.n);
ok(Math.hypot(150-PKI.x,-2450-PKI.z)>300+PKI.reach+60,'no overlap with the Warden Isles');
// course sits on the plateau and the checkpoints are valid
let mx=0;for(const o of C.boxes)for(const[x,z]of[[o.x0,o.z0],[o.x1,o.z1]])mx=Math.max(mx,Math.hypot(x,z));ok(mx<PKI.flat-10,'every course box is on the flat part ('+mx.toFixed(0)+' < '+PKI.flat+')');
ok(C.cps.every(q=>Math.hypot(q.x,q.z)<PKI.flat),'checkpoints on the island');
ok(Math.hypot(C.start.x,C.start.z)<PKI.flat&&Math.hypot(C.finish.x,C.finish.z)<PKI.flat,'start and finish on the island');
// the pads (start - 8) must not sit inside a course box
{const px=C.start.x-8;for(const z of[C.start.z-5,C.start.z+5])ok(!C.boxes.some(o=>px>=o.x0-3&&px<=o.x1+3&&z>=o.z0-3&&z<=o.z1+3),'start pad is clear of the course')}
// travel location lands on the start
ok(/LOCS\.push\(\{n:'Parkour Isle',x:PKI\.x-100,z:PKI\.z-100/.test(R('src/parkour/ParkourIsle.js')),'Travel lands on the start line');
// animation clips: stock set + every avatar set has every clip the plan can ask for
const PA=ctx.ParkourAnim,names=Object.keys(PA.DUR),stock=JSON.parse(R('assets/parkour_anims.json')).map(c=>c.name);
ok(names.every(n=>stock.includes(n)),'stock rig has all '+names.length+' parkour clips');
for(const av of['crypto','madea','samurai']){const set=JSON.parse(R('assets/avatars/'+av+'/parkour.json')).map(c=>c.name);ok(names.every(n=>set.includes(n)),av+' has all parkour clips')}
// plan(): each core mode maps to the right clip
const P=ctx.ParkourCore,B=P.newBody(0,0,0,0);
const pl=(m,x)=>{const b=Object.assign(P.newBody(0,0,0,0),{mode:m},x||{});return PA.plan(b,0)};
ok(pl('ground')===null,'plain running keeps the normal gait');
ok(pl('vault',{vk:'low',vdur:.5}).name==='pk_vaultL'&&pl('vault',{vk:'high',vdur:.5}).name==='pk_vaultH','vault low/high clips');
ok(pl('wallup',{wdur:.95}).name==='pk_wallup'&&pl('wallrun').name==='pk_wallrun'&&pl('slide').name==='pk_slide'&&pl('ledge').name==='pk_hang'&&pl('mantle').name==='pk_mantle'&&pl('roll').name==='pk_roll','wall-up / wall-run / slide / hang / mantle / roll clips');
ok(pl('air',{flip:true,flipK:'front',flipV:'pk_flipT'}).name==='pk_flipT'&&pl('air',{flip:true,flipK:'back',flipV:'pk_flipB'}).name==='pk_flipB','flip variants');
ok(pl('air',{vy:-10}).name==='pk_fall'&&pl('air',{vy:3})===null,'long fall clip, normal jump clip otherwise');
ok(pl('ground',{stumble:.3}).name==='pk_stumble','stumble clip');
{const b=P.newBody(0,0,0,0);b.mode='air';b.spd=9;PA.note(b,['wallkick']);ok(PA.plan(b,0).name==='pk_wallkick','a wall-kick plays its flip-off clip after the state changes')}
// timescales are sane
for(const m of['vault','wallup','mantle','roll']){const t=pl(m,{vk:'low',vdur:.5,wdur:.95}).ts;ok(t>=.8&&t<=2.7,m+' time scale '+t.toFixed(2))}
// index.html loads the scripts before use and hooks the loop
const H=R('index.html');for(const f of['ParkourCore','ParkourCourse','ParkourAI','ParkourAnim','ParkourIsle'])ok(H.includes('src/parkour/'+f+'.js'),'index loads '+f);
ok(/Parkour\.setInput\(ix,iy,jumpQ\)/.test(H)&&/Parkour\.frame\(dt,t\)/.test(H)&&/Parkour\.build\(\)/.test(H)&&/ParkourAnim\.act\(q,q\.pk\)/.test(H),'index hooks: input, frame, build, animation');
ok(/PKI\.on\)\{const px=x-PKI\.x/.test(H),'H() blends the island terrain in');
process.exit(bad?1:0);
