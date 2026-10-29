// AvatarKit appearance schema: every input normalises to something safe, compact, deterministic and compatible (no browser needed).
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const ctx={console,THREE:{},AURL:'assets/',localStorage:{_d:{},getItem(k){return this._d[k]===undefined?null:this._d[k]},setItem(k,v){this._d[k]=String(v)}},fetch:()=>Promise.reject(new Error('no net'))};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(R+'src/avatar/AvatarKit.js','utf8')+';this.K=AvatarKit',ctx);const K=ctx.K;
const d=K.defaults('m');
ok(K.encode(d)==='1.m.0.0.0.0.0','default appearance encodes compactly ('+K.encode(d)+')');
ok(K.encode(K.defaults('f')).startsWith('1.f.'),'female default');
ok(JSON.stringify(K.normalize(K.encode({b:'f',hc:3,o:1,oc:5,a:9})))===JSON.stringify(K.normalize({b:'f',hc:3,o:1,oc:5,a:9})),'encode -> decode round-trips');
const junk=[null,undefined,42,'',[],'x','1.z.9.9.9.9.9','9.m.0.0.0.0.0',{b:'zzz'},{b:'f',hc:99,o:-4,oc:'a',a:1e9},{b:'m',hc:NaN,a:Infinity},'1.m.0.0.0.0',{__proto__:{b:'f'}},'1.m.0.0.0.0.0'.repeat(20)];
let allSafe=true,msgs=[];for(const j of junk){try{const a=K.normalize(j);const s=K.encode(a);
  if(!K.CAT[a.b]||a.hc<0||a.hc>=K.HAIR.length||a.o<0||a.o>=K.LOOKS.length||a.oc<0||a.oc>=K.PAL.length||a.a<0||a.a>31||s.length>24)allSafe=false}catch(e){allSafe=false;msgs.push(String(e))}}
ok(allSafe,'junk, NaN, huge, wrong-type and unknown-version input all normalise to a valid appearance '+msgs.join(','));
ok(K.normalize({b:'nope'}).b==='m','an unknown avatar id falls back to the default avatar');
ok(K.normalize('2.f.0.2.1.3.0').b==='f'&&K.normalize('7.f.0.2.1.3.0').hc===2,'a newer version with the same layout still keeps what it understands');
// compatibility
ok(K.normalize({o:0,oc:7}).oc===0,'the Signature outfit takes no clothing colour');
const sh=K.LOOKS[3].pal;ok(!sh.includes(0)&&K.normalize({o:3,oc:0}).oc===sh[0],'a colour that does not suit the Shadow look is replaced by the first one that does');
ok(K.LOOKS.every(L=>L.pal.every(i=>i>=0&&i<K.PAL.length)),'every look only lists real palette entries');
ok((K.normalize({a:2|4}).a&2)===0&&(K.normalize({a:2|4}).a&4)===4,'cap and headband are exclusive (cap wins)');
ok(K.normalize({a:31}).a===31-2,'all other accessories can be combined');
// legacy
ok(K.legacySkin('m')===0&&K.legacySkin('f')===1&&K.legacySkin('zz')===0,'older clients get the matching chibi skin index');
ok(K.has({b:'f'})&&!K.has(null)&&K.has({b:'zzz'}),'has(): objects dress as an avatar (unknown ids fall back), null does not');
// persistence
K.save({b:'f',hc:2,o:1,oc:4,a:5});ok(K.restore().b==='f'&&K.restore().oc===4,'saved look is restored');
ctx.localStorage.setItem('tw_avatar_v1','garbage');ok(K.restore().b==='m','a corrupted save restores the default');
ctx.localStorage.getItem=()=>{throw new Error('blocked')};ok(K.restore()===null,'blocked storage never throws');
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0);
