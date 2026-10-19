// WardenGear: types, affixes, drops, inventory, the Merchant, and save hygiene.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const mk=()=>{const st={};const c={console,Math,JSON,Number,Array,localStorage:{getItem:k=>st[k]===undefined?null:st[k],setItem:(k,v)=>{st[k]=v}}};vm.createContext(c);
  vm.runInContext(fs.readFileSync(R+'src/combat/WardenGear.js','utf8')+';this.G=WardenGear',c);return{G:c.G,st}};
{const {G,st}=mk();
  ok(G.equipped().id==='start'&&G.all().length===1&&G.stats().dm===1,'fresh save: only the worn falchion, neutral stats');
  for(const k in G.TYPES){const T=G.TYPES[k];ok(fs.existsSync(R+'assets/'+T.file),k+': model '+T.file+' exists');ok(T.l0>0&&T.want>0&&T.dm>0&&T.sm>0,k+': sane numbers')}
  ok(G.stats({ty:'claymore',rar:0,af:[]}).dm>1.2&&G.stats({ty:'claymore',rar:0,af:[]}).sm>1,'claymore: hits harder, costs more stamina');
  ok(G.stats({ty:'cutlass',rar:0,af:[]}).sm<1&&G.stats({ty:'cutlass',rar:0,af:[]}).flow>1,'cutlass: cheap swings, faster Flow');
  ok(G.stats({ty:'axe',rar:0,af:[]}).pm>1.4,'axe: big posture damage');
  const a=G.stats({ty:'falchion',rar:3,af:[['dmg',2],['bleed',1],['vamp',0]]});ok(Math.abs(a.dm-1.15)<1e-9&&a.bleed===3&&Math.abs(a.vamp-.03)<1e-9,'affix values apply by tier');
  const f=G.stats({ty:'falchion',rar:2,af:[['frugal',2],['deft',1]]});ok(Math.abs(f.sm-.82)<1e-9&&f.dfl===2,'frugal cuts stamina cost, deft widens the deflect window');
  // rolls
  const r=G.rng(7);let n=[0,0,0,0];for(let i=0;i<2000;i++)n[G.rollRar(r,true,1)]++;ok(n[0]<n[1]&&n[3]>0&&n[3]<n[2],'boss drop odds: fine most common, relics rare but possible ('+n+')');
  const r2=G.rng(9);let m=[0,0,0,0];for(let i=0;i<2000;i++)m[G.rollRar(r2,true,8)]++;ok(m[3]>n[3]*1.5,'later cycles drop better gear ('+m[3]+' vs '+n[3]+' relics)');
  const r3=G.rng(3);let g=0;for(let i=0;i<2000;i++)if(G.drop(r3,false,1))g++;ok(g>80&&g<220,'a grunt drops a weapon ~7% of the time ('+g+'/2000)');
  const r4=G.rng(5);let all=true;for(let i=0;i<500;i++){const it=G.make(r4,i%4);if(it.af.length!==it.rar||new Set(it.af.map(x=>x[0])).size!==it.af.length)all=false}ok(all,'a rarity-N weapon has exactly N different affixes');
  ok(G.name({id:'x',ty:'claymore',rar:1,af:[['bleed',0]]})==='Serrated Claymore'&&/of Ash/.test(G.name({id:'x',ty:'axe',rar:3,af:[['dmg',0],['vamp',0],['deft',0]]})),'names read well');
  // inventory
  const it=G.make(G.rng(1),2,'axe');ok(G.add(it)&&G.all().length===2,'add');ok(G.equip(it.id)&&G.equipped().id===it.id,'equip');
  const v=G.sell(it.id);ok(v===G.sellValue(it)&&v>0&&G.equipped().id==='start','selling the equipped weapon falls back to the worn falchion');
  for(let i=0;i<40;i++)G.add(G.make(G.rng(i+100),1));ok(G.S.inv.length===G.CAP&&G.full(),'the pack holds '+G.CAP+' and no more');
  ok(!G.add(G.make(G.rng(1),1)),'a full pack refuses more');
  ok(G.price({ty:'falchion',rar:3,af:[['dmg',2],['bleed',2],['vamp',2]]})>G.price({ty:'falchion',rar:1,af:[['dmg',0]]})*5,'relics cost much more than fine weapons');
  // merchant
  G.reset();const s1=G.stock(1001),s2=G.stock(1001),s3=G.stock(2002);ok(s1.length===3&&JSON.stringify(s1)===JSON.stringify(s2),'merchant stock is deterministic for a seed');ok(JSON.stringify(s1)!==JSON.stringify(s3),'a new seed gives new stock');
  const s4=G.stock(1001);ok(G.buy(s4[0],1e9)>0&&G.stock(1001).length===2,'a bought item leaves the shelf');ok(G.buy(s4[1],1)===0,'cannot buy without enough embers');
  // save hygiene
  const j=JSON.stringify(G.S);const c2=mk();c2.st.wgear=j;c2.G.load();ok(c2.G.S.inv.length===1,'reload reads the pack back');
  const c3=mk();c3.st.wgear=JSON.stringify({inv:[{id:'a',ty:'nonsense',rar:2,af:[]},{id:'b',ty:'axe',rar:1,af:[['dmg',99],['dmg',1],['zzz',0]]},{id:'b',ty:'axe',rar:0,af:[]},null,5],eq:'ghost',n:'x'});c3.G.load();
  ok(c3.G.S.inv.length===1&&c3.G.S.inv[0].af.length===1&&c3.G.S.inv[0].af[0][1]===2&&c3.G.S.eq==='start','a corrupt or hand-edited save is cleaned (bad type, duplicate, over-tier, unknown affix, missing eq)')}
process.exit(bad?1:0);
