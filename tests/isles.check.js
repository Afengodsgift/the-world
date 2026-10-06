// Isles/ISLX checks (real H() from index.html vs the ORIGINAL H() from git HEAD~): the dome must be untouched (so shards/hunts/trees/camps keep their places),
// the join between dome and extension land must never be swim-deep (you can walk out), and the extension must really add land.
const fs=require('fs'),vm=require('vm'),cp=require('child_process'),R=__dirname+'/../';
const cur=fs.readFileSync(R+'index.html','utf8');
const old=process.env.OLD_INDEX?fs.readFileSync(process.env.OLD_INDEX,'utf8'):cp.execSync('git show HEAD:index.html',{cwd:R,maxBuffer:1e8}).toString();
const grab=s=>{const a=s.indexOf('function H(x,z){');return s.slice(a,s.indexOf('\n}\n',a)+3)};
const mk=src=>{const c={Math};vm.createContext(c);vm.runInContext([fs.readFileSync(R+'src/utils/math.js','utf8'),fs.readFileSync(R+'src/data/islands.js','utf8'),'const K=2.5;',src,'this.H=H;this.ISL=ISL;this.ISLX=ISLX;this.OUT=OUT;'].join('\n'),c);return c};
const N=mk(grab(cur)),O=mk(grab(old).replace(/ISLX/g,'ISLX'));let bad=0;const ok=(c,m)=>{if(!c){console.log('FAIL',m);bad++}else console.log('ok',m)};
// the old H needs no ISLX; give it a stub so both load
const Oc={Math};vm.createContext(Oc);vm.runInContext([fs.readFileSync(R+'src/utils/math.js','utf8'),fs.readFileSync(R+'src/data/islands.js','utf8'),'const K=2.5;',grab(old),'this.H=H;'].join('\n'),Oc);
let diff=0,n=0;
for(const I of N.ISL){for(let i=0;i<4000;i++){const a=Math.random()*6.283,r=Math.sqrt(Math.random())*I.R*.93,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r;n++;if(Math.abs(N.H(x,z)-Oc.H(x,z))>1e-9)diff++}}
ok(diff===0,'dome (<=0.93 R) identical to the original terrain ('+n+' samples, '+diff+' differ)');
let main=0;for(let i=0;i<20000;i++){const a=Math.random()*6.283,r=Math.sqrt(Math.random())*300,x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(N.H(x,z)-Oc.H(x,z))>1e-9)main++}
ok(main===0,'main island unchanged ('+main+' differ)');
const OUT=N.OUT;let out=0;for(let i=0;i<4000;i++){const a=Math.random()*6.283,r=Math.random()*N.OUT.R*1.3,x=OUT.x+Math.cos(a)*r,z=OUT.z+Math.sin(a)*r;const hn=N.H(x,z),ho=Oc.H(x,z);if(Math.abs(hn-ho)>1e-9&&Math.max(hn,ho)>-2.2)out++} // a neighbour's deep slope may nudge the sea floor (<-2.2 m): never anything you can stand on or see
ok(out===0,'Outlaw Isle unchanged ('+out+' differ)');
for(const I of N.ISL){if(!N.ISLX.on(I))continue;
  let landOld=0,landNew=0,minJoin=9,tot=0;
  for(let i=0;i<6000;i++){const a=Math.random()*6.283,r=Math.sqrt(Math.random())*I.R*2.1,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r;tot++;if(Oc.H(x,z)>.3)landOld++;if(N.H(x,z)>.3)landNew++}
  for(let k=0;k<72;k++){const a=k/72*6.283;for(let r=I.R*.97;r<=I.R*1.12;r+=2){minJoin=Math.min(minJoin,N.H(I.x+Math.cos(a)*r,I.z+Math.sin(a)*r))}}
  ok(landNew/landOld>1.9,I.n+': land area x'+(landNew/landOld).toFixed(2));
  ok(minJoin>-.5,I.n+': dome-to-extension join never swim-deep (min '+minJoin.toFixed(2)+')');
  let hi=-9;for(let i=0;i<4000;i++){const a=Math.random()*6.283,r=Math.random()*I.R*2.05;hi=Math.max(hi,N.H(I.x+Math.cos(a)*r,I.z+Math.sin(a)*r))}
  ok(hi<80,I.n+': highest point '+hi.toFixed(1)+' m');
}
console.log(bad?bad+' problem(s)':'isles OK');process.exit(bad?1:0);
