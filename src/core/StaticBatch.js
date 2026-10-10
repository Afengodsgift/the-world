// StaticBatch: cuts scene objects, matrix work and draw calls for scenery that never moves.
//  merge(roots,{parent,cell}) : bakes every mesh under `roots` (already positioned in the scene) into world space and merges meshes that share a
//                               material into few big meshes, one per spatial cell (so frustum culling still works). The originals are removed.
//  freeze(root)               : stops recomputing a subtree's matrices every frame (matrixAutoUpdate=false) after updating them once.
// Why: the scene had ~3,700 objects and updating their matrices cost 5-6 ms per frame on a desktop CPU (phones are several times slower), even over empty sea.
// ONLY use on things that never move. Moving/animated objects must stay as they are.
const StaticBatch=(()=>{
  const _v=new THREE.Vector3(),_n=new THREE.Vector3(),_nm=new THREE.Matrix3();
  function freeze(root){return freezeGuarded(root)}   // for scenery known to be static; same tripwire as autoFreeze, so it is safe even if some code moves it later
  // freezeGuarded: freeze + a tripwire. Any later write to position / rotation / scale / quaternion (set(), x=, copy(), lookAt(), applyMatrix4(),
  // the AnimationMixer, ...) thaws the object automatically, so freezing something that turns out to move can never leave it stuck.
  // A frozen object also has matrixWorldAutoUpdate=false, so three skips its whole subtree during updateMatrixWorld (no walking at all).
  // To keep that safe, anything that thaws (or gets a new child) re-opens the path from the scene down to itself.
  function openPath(o){for(let p=o;p;p=p.parent)if(p.matrixWorldAutoUpdate===false)p.matrixWorldAutoUpdate=true}
  function thaw(o){if(!o.matrixAutoUpdate){o.matrixAutoUpdate=true;o.matrixWorldNeedsUpdate=true}openPath(o)}
  function guardVec(o,v){for(const k of ['x','y','z']){let val=v[k];Object.defineProperty(v,k,{get(){return val},set(n){if(n!==val){val=n;thaw(o)}},configurable:true,enumerable:true})}}
  function guardOne(o){
    if(o.__guarded){o.updateMatrix();o.matrixWorldNeedsUpdate=false;o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;return}
    o.__guarded=true;guardVec(o,o.position);guardVec(o,o.scale);
    const r=o.rotation._onChangeCallback,q=o.quaternion._onChangeCallback;
    o.rotation._onChange(()=>{r();thaw(o)});o.quaternion._onChange(()=>{q();thaw(o)});
    const add=o.add;o.add=function(){openPath(this);return add.apply(this,arguments)};   // a child added later must be reachable by updateMatrixWorld
    o.updateMatrix();o.matrixWorldNeedsUpdate=false;o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;   // world matrices were just computed, so no pending update
  }
  function freezeGuarded(root){
    root.updateWorldMatrix(true,true);
    let n=0;root.traverse(o=>{if(!o.matrixAutoUpdate||o.isCamera||o.isLight||o===root.parent||o.userData.noFreeze)return;guardOne(o);n++});return n;
  }
  // everything currently in the scene that has not been frozen yet (call once the world is built and settled)
  function autoFreeze(scene){scene.updateMatrixWorld(true);const n=freezeGuarded(scene);scene.matrixAutoUpdate=false;scene.matrixWorldAutoUpdate=true;return n}   // the root itself must always be visited
  function sig(g){const a=g.attributes;return (a.normal?'n':'-')+(a.uv?'u':'-')+(a.color?'c'+a.color.itemSize:'--')}   // indexed and non-indexed geometries can share one merged mesh
  function merge(roots,opt){
    const parent=opt.parent,cell=opt.cell||1e9,groups=new Map(),src=[];
    for(const r of roots){r.updateMatrixWorld(true);r.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh&&!o.isInstancedMesh&&!Array.isArray(o.material)&&o.geometry&&o.geometry.attributes.position)src.push(o)})}
    for(const o of src){
      _v.setFromMatrixPosition(o.matrixWorld);
      const key=o.material.uuid+'|'+Math.floor(_v.x/cell)+','+Math.floor(_v.z/cell)+'|'+sig(o.geometry)+'|'+(o.castShadow?1:0)+(o.receiveShadow?1:0);
      let e=groups.get(key);if(!e)groups.set(key,e={mat:o.material,list:[],cs:o.castShadow,rs:o.receiveShadow,sg:sig(o.geometry)});e.list.push(o);
    }
    const out=[];
    for(const e of groups.values()){
      let nv=0,ni=0;const hasN=e.sg[0]==='n',hasUV=e.sg[1]==='u',cItem=e.sg[2]==='c'?+e.sg[3]:0;
      for(const o of e.list){const g=o.geometry;nv+=g.attributes.position.count;ni+=g.index?g.index.count:g.attributes.position.count}
      const pos=new Float32Array(nv*3),nor=hasN?new Float32Array(nv*3):null,uv=hasUV?new Float32Array(nv*2):null,col=cItem?new Float32Array(nv*cItem):null,idx=new (nv>65535?Uint32Array:Uint16Array)(ni);
      let vo=0,io=0;
      for(const o of e.list){
        const g=o.geometry,a=g.attributes,m=o.matrixWorld,cnt=a.position.count;_nm.getNormalMatrix(m);
        for(let i=0;i<cnt;i++){_v.fromBufferAttribute(a.position,i).applyMatrix4(m);pos[(vo+i)*3]=_v.x;pos[(vo+i)*3+1]=_v.y;pos[(vo+i)*3+2]=_v.z;
          if(hasN){_n.fromBufferAttribute(a.normal,i).applyMatrix3(_nm).normalize();nor[(vo+i)*3]=_n.x;nor[(vo+i)*3+1]=_n.y;nor[(vo+i)*3+2]=_n.z}
          if(hasUV){uv[(vo+i)*2]=a.uv.getX(i);uv[(vo+i)*2+1]=a.uv.getY(i)}
          if(cItem){for(let k=0;k<cItem;k++)col[(vo+i)*cItem+k]=a.color.getComponent?a.color.getComponent(i,k):(k===0?a.color.getX(i):k===1?a.color.getY(i):a.color.getZ(i))}}
        if(g.index){const ix=g.index;for(let i=0;i<ix.count;i++)idx[io+i]=ix.getX(i)+vo;io+=ix.count}else{for(let i=0;i<cnt;i++)idx[io+i]=vo+i;io+=cnt}
        vo+=cnt;
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      if(nor)geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));if(uv)geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));if(col)geo.setAttribute('color',new THREE.BufferAttribute(col,cItem));
      geo.setIndex(new THREE.BufferAttribute(idx,1));geo.computeBoundingSphere();geo.computeBoundingBox();
      const mesh=new THREE.Mesh(geo,e.mat);mesh.castShadow=e.cs;mesh.receiveShadow=e.rs;mesh.updateMatrix();mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=false;parent.add(mesh);out.push(mesh);
    }
    for(const r of roots)if(r.parent)r.parent.remove(r);
    return out;
  }
  return {merge,freeze,freezeGuarded,autoFreeze};
})();
