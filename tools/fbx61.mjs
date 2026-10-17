// Minimal reader for BINARY FBX 6.1 (FileVersion 6100) skinned characters, which three.js's FBXLoader (7.x only) and Blender >= 2.8 refuse.
// parse61(arrayBuffer, THREE) -> THREE.Group shaped like an FBXLoader result for a Mixamo-style download:
//   Bone tree (names sanitized like FBXLoader: "mixamorig:Hips" -> "mixamorigHips"), SkinnedMesh per mesh model (non-indexed, skinIndex/skinWeight top-4, groups per material),
//   skeleton.boneInverses = inverse(Cluster.TransformLink), bindMatrix = Cluster.Transform, material.map.image.src = blob URL of the embedded diffuse PNG
//   (needs globalThis.window.URL.createObjectURL(blob) -> url, exactly like tools/pack_mixamo_char.mjs stubs it). No animations (these files carry none).
// Units stay centimetres. Usage: import {parse61} from './fbx61.mjs'
import zlib from 'zlib';
function readNodes(b){
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  function prop(o){const t=String.fromCharCode(b[o]);o++;
    switch(t){
      case 'Y':return[dv.getInt16(o,true),o+2];case 'C':return[b[o]!==0,o+1];case 'I':return[dv.getInt32(o,true),o+4];case 'F':return[dv.getFloat32(o,true),o+4];
      case 'D':return[dv.getFloat64(o,true),o+8];case 'L':return[Number(dv.getBigInt64(o,true)),o+8];
      case 'f':case 'd':case 'l':case 'i':case 'b':{const n=dv.getUint32(o,true),enc=dv.getUint32(o+4,true),cl=dv.getUint32(o+8,true);o+=12;let raw=b.subarray(o,o+cl);o+=cl;if(enc===1)raw=zlib.inflateSync(raw);
        const sz={f:4,d:8,l:8,i:4,b:1}[t],a=new Uint8Array(n*sz);a.set(raw.subarray(0,n*sz));const dv2=new DataView(a.buffer);const out=new Array(n);
        for(let i=0;i<n;i++)out[i]=t==='f'?dv2.getFloat32(i*4,true):t==='d'?dv2.getFloat64(i*8,true):t==='i'?dv2.getInt32(i*4,true):t==='l'?Number(dv2.getBigInt64(i*8,true)):a[i];
        return[out,o]}
      case 'S':{const n=dv.getUint32(o,true);o+=4;return[Buffer.from(b.subarray(o,o+n)).toString('latin1'),o+n]}
      case 'R':{const n=dv.getUint32(o,true);o+=4;return[Buffer.from(b.subarray(o,o+n)),o+n]}
      default:throw new Error('FBX prop type '+t)}}
  function node(o){const end=dv.getUint32(o,true),np=dv.getUint32(o+4,true),pl=dv.getUint32(o+8,true),nl=b[o+12];o+=13;if(end===0)return[null,o];
    const name=Buffer.from(b.subarray(o,o+nl)).toString('latin1');o+=nl;const props=[];let po=o;for(let i=0;i<np;i++){const r=prop(po);props.push(r[0]);po=r[1]}o+=pl;const kids=[];
    while(o<end){const r=node(o);if(r[0]===null){o=r[1];break}kids.push(r[0]);o=r[1]}return[{n:name,p:props,c:kids},end]}
  const top=[];let o=27;while(o<b.length-13){const r=node(o);if(r[0]===null)break;top.push(r[0]);o=r[1]}return top}
const nm=s=>String(s).split('\0')[0];
const san=s=>nm(s).replace(/:/g,'').replace(/ /g,'_');
export function parse61(ab,THREE){
  const b=Buffer.from(ab);if(b.readUInt32LE(23)!==6100)throw new Error('not FBX 6100');
  const top=readNodes(b),get=(n,k)=>n.c.find(c=>c.n===k),Obj=get({c:top},'Objects'),Con=get({c:top},'Connections');
  const byName={};for(const o of Obj.c)(byName[o.n+'|'+nm(o.p[0])]=o);
  const prop=(m,k)=>{const P=get(m,'Properties60');const q=P&&P.c.find(c=>c.p[0]===k);return q?q.p.slice(3):null};
  const models={};
  for(const m of Obj.c)if(m.n==='Model'){const T=prop(m,'Lcl Translation')||[0,0,0],R=prop(m,'Lcl Rotation')||[0,0,0],S=prop(m,'Lcl Scaling')||[1,1,1],PR=prop(m,'PreRotation')||[0,0,0],d=Math.PI/180;
    const isBone=m.p[1]==='LimbNode'||m.p[1]==='Limb'||m.p[1]==='Root';
    const obj=isBone?new THREE.Bone():new THREE.Group();obj.name=san(m.p[0]);obj.position.set(T[0],T[1],T[2]);
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(PR[0]*d,PR[1]*d,PR[2]*d,'ZYX')).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(R[0]*d,R[1]*d,R[2]*d,'ZYX')));
    obj.quaternion.copy(q);obj.scale.set(S[0],S[1],S[2]);models[nm(m.p[0])]={m,obj,isBone,type:m.p[1]}}
  const root=new THREE.Group();root.name='Scene';
  const conns=Con.c.map(c=>({t:c.p[0],a:nm(c.p[1]),b:nm(c.p[2]),pr:c.p[3]}));
  for(const c of conns){const ch=models[c.a];if(!ch||c.t!=='OO')continue;const par=models[c.b];if(par)par.obj.add(ch.obj);else if(c.b==='Scene')root.add(ch.obj)}   // (bone->cluster links also have a model as child: those are not hierarchy)
  for(const k in models)if(!models[k].obj.parent)root.add(models[k].obj);
  const M4=a=>new THREE.Matrix4().fromArray(a);
  const meshes=Object.values(models).filter(x=>x.type==='Mesh');
  // bind pose from the clusters themselves (TransformLink = bone world matrix at bind): robust against pivots / pre-rotations the Lcl properties do not capture
  {const TL=new Map();for(const cl of Obj.c)if(cl.n==='Deformer'&&cl.p[1]==='Cluster'){const bc=conns.find(c=>c.t==='OO'&&c.b===nm(cl.p[0])&&models[c.a]&&models[c.a].isBone);if(bc&&!TL.has(bc.a))TL.set(bc.a,M4(get(cl,'TransformLink').p))}
    const world=(o)=>{const k=Object.keys(models).find(n=>models[n].obj===o);return k&&TL.get(k)};
    const _p=new THREE.Vector3(),_q=new THREE.Quaternion(),_s=new THREE.Vector3();
    for(const k of Object.keys(models)){const m=models[k];if(!m.isBone||!TL.has(k))continue;const pw=m.obj.parent&&m.obj.parent.isBone?world(m.obj.parent):null;
      const loc=pw?pw.clone().invert().multiply(TL.get(k)):TL.get(k).clone();loc.decompose(_p,_q,_s);m.obj.position.copy(_p);m.obj.quaternion.copy(_q);m.obj.scale.copy(_s)}}

  for(const mm of meshes){
    const geoNode=mm.m;   // FBX 6.1 stores the geometry inside the mesh Model node
    if(!geoNode)continue;
    const V=get(geoNode,'Vertices').p,PVI=get(geoNode,'PolygonVertexIndex').p;
    const nl=get(geoNode,'LayerElementNormal'),ul=get(geoNode,'LayerElementUV'),ml=get(geoNode,'LayerElementMaterial');
    const N=nl?get(nl,'Normals').p:null,nByV=nl&&get(nl,'MappingInformationType').p[0]==='ByVertice';
    const UV=ul?get(ul,'UV').p:null,UVI=ul&&get(ul,'UVIndex')?get(ul,'UVIndex').p:null;
    const matIdx=ml&&get(ml,'MappingInformationType').p[0]==='ByPolygon'?get(ml,'Materials').p:null;
    // skin: clusters connected to the Skin deformer connected to this model
    const skin=conns.find(c=>c.t==='OO'&&c.b===nm(mm.m.p[0])&&byName['Deformer|'+c.a]&&byName['Deformer|'+c.a].p[1]==='Skin');
    const clusters=skin?conns.filter(c=>c.t==='OO'&&c.b===skin.a&&byName['Deformer|'+c.a]&&byName['Deformer|'+c.a].p[1]==='Cluster').map(c=>byName['Deformer|'+c.a]):[];
    const bones=[],inv=[],vw=[];let bind=new THREE.Matrix4();
    clusters.forEach((cl,ci)=>{const bc=conns.find(c=>c.t==='OO'&&c.b===nm(cl.p[0])&&models[c.a]&&models[c.a].isBone);if(!bc)return;
      const bj=bones.length;bones.push(models[bc.a].obj);inv.push(M4(get(cl,'Transform').p));   // FBX 6.1: Cluster.Transform is already the inverse bind matrix (mesh space -> bone space); the mesh itself sits at identity

      const ix=get(cl,'Indexes'),wt=get(cl,'Weights');if(ix&&wt)ix.p.forEach((vi,k)=>{(vw[vi]||(vw[vi]=[])).push([bj,wt.p[k]])})});
    // polygons -> triangles (fan), one vertex per polygon corner
    const pos=[],nor=[],uv=[],si=[],sw=[],tm=[];let corner=0,poly=[],pc=[],pi=0;
    const emit=(vi,ci)=>{pos.push(V[vi*3],V[vi*3+1],V[vi*3+2]);if(N)nor.push(...(nByV?[N[vi*3],N[vi*3+1],N[vi*3+2]]:[N[ci*3],N[ci*3+1],N[ci*3+2]]));else nor.push(0,1,0);
      if(UV){const u=UVI?UVI[ci]:ci;uv.push(UV[u*2],UV[u*2+1])}else uv.push(0,0);
      const w=(vw[vi]||[]).slice().sort((x,y)=>y[1]-x[1]).slice(0,4);let s=w.reduce((a,x)=>a+x[1],0)||1;for(let k=0;k<4;k++){si.push(w[k]?w[k][0]:0);sw.push(w[k]?w[k][1]/s:0)}};
    for(let i=0;i<PVI.length;i++){const e=PVI[i]<0,vi=e?~PVI[i]:PVI[i];poly.push(vi);pc.push(corner++);
      if(e){for(let k=1;k<poly.length-1;k++){for(const j of[0,k,k+1])emit(poly[j],pc[j]);tm.push(matIdx?matIdx[pi]:0)}poly=[];pc=[];pi++}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
    // material(s)
    const mats=[...new Set(conns.filter(c=>c.t==='OO'&&c.b===nm(mm.m.p[0])&&byName['Material|'+c.a]).map(c=>c.a))];
    const mlist=mats.map(mn=>{const mat=new THREE.MeshStandardMaterial({name:mn});const tc=conns.find(c=>c.t==='OP'&&c.b===mn&&c.pr==='DiffuseColor');
      if(tc){const tex=byName['Texture|'+nm(tc.a)],vc=tex&&conns.find(c=>c.t==='OO'&&c.b===nm(tc.a)&&byName['Video|'+c.a]);const vid=vc&&byName['Video|'+vc.a];let ct=vid&&get(vid,'Content');if(vid&&!(ct&&ct.p[0]&&ct.p[0].length>100)){const fn=x=>nm(get(x,'Filename').p[0]).split(/[\\/]/).pop(),my=fn(vid);const alt=Obj.c.find(o=>o.n==='Video'&&get(o,'Filename')&&fn(o)===my&&get(o,'Content')&&get(o,'Content').p[0]&&get(o,'Content').p[0].length>100);if(alt)ct=get(alt,'Content')}   // same file embedded under another Video node
        
        if(ct&&ct.p[0]&&ct.p[0].length>100){const url=globalThis.window.URL.createObjectURL(new Blob([ct.p[0]]));mat.map={image:{src:url}}}}return mat});
    if(!mlist.length)mlist.push(new THREE.MeshStandardMaterial());
    if(mlist.length>1&&matIdx){const order=[];tm.forEach((m,t)=>order.push(t));/* keep simple: groups per run */let st=0;for(let t=1;t<=tm.length;t++)if(t===tm.length||tm[t]!==tm[st]){g.addGroup(st*3,(t-st)*3,tm[st]);st=t}}
    else g.addGroup(0,pos.length/3,0);
    const sm=new THREE.SkinnedMesh(g,mlist.length>1?mlist:mlist[0]);sm.name=san(mm.m.p[0]);sm.frustumCulled=false;
    root.add(sm);root.updateMatrixWorld(true);sm.bind(new THREE.Skeleton(bones,inv),bind);
  }
  return root}
