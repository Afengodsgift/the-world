// Golden-master helpers for the Warden Isles regression tests.
// Baseline (tests/golden/baseline.json, H.baseline.txt) was generated from `main` BEFORE any Warden code existed.
// Regenerate ONLY on a pristine main checkout:  node tests/golden/golden_lib.js --write
const fs=require('fs'),vm=require('vm'),path=require('path'),R=path.join(__dirname,'..','..')+'/';
const rd=f=>fs.readFileSync(R+f,'utf8');
function hSource(){const idx=rd('index.html'),a=idx.indexOf('function H(x,z){');if(a<0)throw new Error('H() not found');return idx.slice(a,idx.indexOf('\n}\n',a)+3)}
// H() text with every `// WARDEN:` block removed (marker line + the following line(s) up to and including the closing "}}" line)
function hSourceNoWarden(src){const L=src.split('\n'),o=[];for(let i=0;i<L.length;i++){if(/\/\/\s*WARDEN:/.test(L[i])){i++;while(i<L.length&&!/^\s*\{if\(WRD\.on\)[\s\S]*$/.test(L[i])&&!/^\s*\}?\}\s*$/.test(L[i])&&!/\}\}\s*$/.test(L[i]))i++;
      /* block lines: marker, then block until a line ending with '}}' */ 
      while(i<L.length&&!/\}\}\s*$/.test(L[i]))i++;continue}o.push(L[i])}return o.join('\n')}
function makeH(wrdOn){
  const c={Math,console};vm.createContext(c);
  const parts=[rd('src/utils/math.js'),rd('src/utils/random.js'),rd('src/data/islands.js'),'const K=2.5;',hSource()];
  if(wrdOn!==undefined)parts.push('if(typeof WRD!=="undefined")WRD.on='+(wrdOn?'true':'false')+';');
  parts.push('this.H=H;this.D={ISL,OUT,TOWN,SKY,LOCS,WP,KT,FARM,PITCH};this.W=(typeof WRD!=="undefined")?WRD:null;');
  vm.runInContext(parts.join('\n'),c);return c;
}
function fnv(h,v){const b=Buffer.alloc(8);b.writeDoubleLE(v);for(const x of b){h^=x;h=Math.imul(h,16777619)>>>0}return h}
function lcg(s){return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296)}
function sets(D){const S={};
  S.world100=[];for(let x=-3300;x<=3300;x+=100)for(let z=-3300;z<=3300;z+=100)S.world100.push([x,z]);
  S.main5=[];for(let x=-250;x<=250;x+=5)for(let z=-250;z<=250;z+=5)S.main5.push([x,z]);
  for(const I of D.ISL){const k='isl_'+I.n;S[k]=[];const r=I.R*1.7;for(let x=-r;x<=r;x+=20)for(let z=-r;z<=r;z+=20)S[k].push([I.x+x,I.z+z])}
  S.outlaw=[];for(let x=-300;x<=300;x+=6)for(let z=-300;z<=300;z+=6)S.outlaw.push([D.OUT.x+x,D.OUT.z+z]);
  S.pitch=[];for(let x=-60;x<=60;x+=2)for(let z=-40;z<=40;z+=2)S.pitch.push([D.PITCH.x+x,D.PITCH.z+z]);
  const r=lcg(12345);S.seeded=[];for(let i=0;i<4000;i++)S.seeded.push([(r()-.5)*6600,(r()-.5)*6600]);
  return S}
function hashSets(H,D){const S=sets(D),o={};for(const k in S){let h=2166136261;for(const[x,z]of S[k])h=fnv(h,H(x,z));o[k]={n:S[k].length,h}}return o}
function dataSnap(D){return JSON.parse(JSON.stringify(D))}
if(require.main===module&&process.argv[2]==='--write'){
  const src=hSource(),c=makeH();
  fs.writeFileSync(__dirname+'/H.baseline.txt',src);
  fs.writeFileSync(__dirname+'/baseline.json',JSON.stringify({from:'main 73b9c91',hashes:hashSets(c.H,c.D),data:dataSnap(c.D)},null,1));
  console.log('baseline written');
}
module.exports={R,rd,hSource,hSourceNoWarden,makeH,hashSets,dataSnap,sets};
