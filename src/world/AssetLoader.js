// Loads and caches all external GLB/texture assets. Pure loading layer: no gameplay
// logic here — consumers (dress(), buildWorld(), buildKartTrack()) read the populated
// AM / AM_KART / clips / skinT globals once the returned promises resolve.
const SKINS=['skaterMaleA','skaterFemaleA','criminalMaleA','cyborgFemaleA'];
const AURL='assets/',AM={},AM_KART={};
const ALIST=['tree_pineDefaultA','tree_pineRoundA','tree_oak','tree_fat','tree_palmTall','plant_bushLarge','stone_largeA','rock_tallB','wall-wood','wall-wood-door','wall-wood-window-small','roof-gable','roof-gable-end','fountain-round','lantern','stall-red','stall-green','cart'];
// Skins 4..7 are Mixamo characters re-skinned onto the game rig (tools/transplant_char.mjs -> assets/chars/<n>.glb): same bones + same clips, own mesh/textures. Fetched only when somebody picks them.
const NEWCHARS=['crypto','medea','eve','coolguy'],charBufs={};
let assetsP,charP,charBuf,clips={},nclips={},skinT=[],panP,panBuf; // clips = legacy 3 clips (fallback); nclips = baked UAL set from assets/anims.json
function loadAssets(){
  if(!assetsP&&!THREE.GLTFLoader)assetsP=Promise.resolve();
  if(!assetsP){const gl=new THREE.GLTFLoader();
    assetsP=Promise.all(ALIST.map(n=>new Promise(r=>gl.load(AURL+n+'.glb',g=>{AM[n]=g.scene;r()},undefined,()=>r()))))}
  return assetsP;
}
// The Quaternius nature + village kits (assets/nature.glb ~2.4 MB, assets/village.glb ~1 MB) are loaded AFTER the main assets so the world appears first;
// every top-level piece lands in AM by its own name (CommonTree_3, Wall_Plaster_Straight, ...) so place()/scatter() work on them. The floating island waits for this.
let packsP;
function loadPacks(){
  if(!packsP&&!THREE.GLTFLoader)packsP=Promise.resolve();
  if(!packsP){const gl=new THREE.GLTFLoader();
    packsP=Promise.all(['nature','village'].map(n=>new Promise(r=>gl.load(AURL+n+'.glb',g=>{g.scene.children.forEach(c=>{AM[c.name]=c});r()},undefined,()=>r()))))}
  return packsP;
}
let kartAssetsP;
function loadKartAssets(){
  if(!kartAssetsP&&!THREE.GLTFLoader)kartAssetsP=Promise.resolve();
  if(!kartAssetsP)kartAssetsP=new Promise(r=>new THREE.GLTFLoader().load(AURL+'kart_track.glb',g=>{
    g.scene.children.forEach(c=>{if(c.name==='Track_Standard_Straight_Single')AM_KART.straight=c;if(c.name==='Track_Standard_Finish_Line_Single_Checkered')AM_KART.finish=c});r()},undefined,()=>r()));
  return kartAssetsP;
}
function loadChar(){
  if(!charP)charP=(async()=>{
    if(!THREE.GLTFLoader)throw new Error('no GLTFLoader');
    if(typeof FlightAnim!=='undefined')FlightAnim.load();   // flight clips (small json) ready before the first takeoff
    const gl=new THREE.GLTFLoader(),tl=new THREE.TextureLoader(),buf=async n=>(await fetch(AURL+n)).arrayBuffer();
    const parse=b=>new Promise((res,rej)=>gl.parse(b,AURL,res,rej));
    charBuf=await buf('char.glb');
    for(const n of ['idle','run','jump']){const g=await parse(await buf('anim_'+n+'.glb'));clips[n]=g.animations.find(c=>!c.name.includes('Targeting'))||g.animations[g.animations.length-1]}
    try{const aj=await (await fetch(AURL+'anims.json')).json();for(const c of aj){const ac=THREE.AnimationClip.parse(c);ac.name=c.name;nclips[c.name]=ac}}catch(e){nclips={}} // tools/retarget_ual.js; if it fails we fall back to the legacy clips
    skinT=await Promise.all(SKINS.map(n=>tl.loadAsync(AURL+n+'.png').then(t=>{t.flipY=false;t.encoding=THREE.sRGBEncoding;return t})));
  })();
  return charP;
}
function loadPan(){
  if(!panP)panP=(async()=>{if(!THREE.GLTFLoader)throw new Error('no GLTFLoader');panBuf=await (await fetch(AURL+'pan.glb')).arrayBuffer()})();
  return panP;
}
// -> {b: ArrayBuffer, own: true when it is the character's own model (keeps its own materials)}; any failure falls back to the stock model + stock skin texture
function skinBuf(skin){
  const k=skin-SKINS.length;if(k<0||k>=NEWCHARS.length)return Promise.resolve({b:charBuf,own:false});
  const n=NEWCHARS[k];
  return (charBufs[n]||(charBufs[n]=fetch(AURL+'chars/'+n+'.glb').then(r=>{if(!r.ok)throw new Error(n);return r.arrayBuffer()}))).then(b=>({b,own:true}),()=>{delete charBufs[n];return {b:charBuf,own:false}});
}
