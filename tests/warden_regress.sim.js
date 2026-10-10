// Warden Isles regression / golden master (node-level rows). Browser rows (world-gen rng, shards, hunt targets) live in warden_regress.browser.mjs.
const fs=require('fs'),G=require('./golden/golden_lib.js');
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const base=JSON.parse(fs.readFileSync(__dirname+'/golden/baseline.json','utf8')),baseSrc=fs.readFileSync(__dirname+'/golden/H.baseline.txt','utf8');
const src=G.hSource(),stripped=G.hSourceNoWarden(src);
// row 1: H() text outside WARDEN blocks is untouched; the block never returns early
ok(stripped===baseSrc,'row1: H() source with WARDEN block removed equals the main baseline');
const blocks=src.split('\n').filter(l=>/WARDEN:/.test(l)).length;
const bl=src.split('\n');let blockText='';for(let i=0;i<bl.length;i++)if(/WARDEN:/.test(bl[i])){let j=i+1;while(j<bl.length&&!/\}\}\s*$/.test(bl[j]))j++;blockText=bl.slice(i,j+1).join('\n')}
ok(!/\breturn\b/.test(blockText),'row1: WARDEN block contains no return ('+blocks+' marker(s))');
// row 2: WRD off (or absent) => bit-identical values
const off=G.makeH(false),hOff=G.hashSets(off.H,off.D);
let same=true;for(const k in base.hashes)if(!hOff[k]||hOff[k].h!==base.hashes[k].h||hOff[k].n!==base.hashes[k].n){same=false;console.log('  diff in set',k)}
ok(same,'row2: H() bit-identical on all '+Object.keys(base.hashes).length+' grids with WRD off');
// row 8: shared data
ok(JSON.stringify(G.dataSnap(off.D))===JSON.stringify(base.data),'row8: ISL/OUT/TOWN/SKY/LOCS/WP/KT/FARM/PITCH deep-equal baseline');
// row 3: WRD on => identical outside reach, continuous at the edge (only when the block exists)
if(off.W){
  const on=G.makeH(true),W=on.W,reach=W.R+W.fall;
  const S=G.sets(on.D);let diffOut=0,n=0;
  for(const k in S)for(const[x,z]of S[k]){if(Math.hypot(x-W.x,z-W.z)>=reach+.001){n++;if(on.H(x,z)!==off.H(x,z))diffOut++}}
  ok(diffOut===0,'row3: WRD on, '+n+' points outside reach identical');
  let maxJ=0;for(let a=0;a<360;a+=3){const t=a*Math.PI/180,r1=reach-1e-4,r2=reach+1e-4;maxJ=Math.max(maxJ,Math.abs(on.H(W.x+r1*Math.cos(t),W.z+r1*Math.sin(t))-on.H(W.x+r2*Math.cos(t),W.z+r2*Math.sin(t))))}
  ok(maxJ<1e-3,'row3: continuous at the reach edge (max jump '+maxJ.toExponential(2)+')');
  ok(W.on===false||true,'row3: WRD.on default checked below');
  const dflt=G.makeH();ok(dflt.W.on===false,'WRD.on defaults to false');
  // clearance from every island/feature
  let min=1e9;for(const I of on.D.ISL)min=Math.min(min,Math.hypot(I.x-W.x,I.z-W.z)-I.R*1.6-reach);
  ok(min>=300,'clearance to nearest island terrain influence >= 300 m ('+min.toFixed(0)+' m)');
} else console.log('ok row3: skipped (no WRD yet)');
process.exit(bad?1:0);
