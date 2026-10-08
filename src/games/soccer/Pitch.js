// SocPitch: everything you SEE of the football field: striped grass, markings, boards, goals with nets, corner flags, floodlight poles, the
// kick-off pad and sign, the ball mesh and the team rings. Pure visuals: no gameplay state. build() returns {mesh, rings, group}.
// Globals: THREE, scene, PITCH, SOCCER.
const SocPitch=(()=>{
  const C=SOCCER,P=PITCH,BR=C.ball,surf=()=>P.y;
  function ballTexture(){
    try{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,128,128);g.fillStyle='#1b1b1f';
      for(const [x,y] of [[22,24],[84,18],[58,62],[110,66],[28,100],[88,108]]){g.beginPath();g.arc(x,y,13,0,6.283);g.fill()}
      return new THREE.CanvasTexture(c)}catch(e){return null}}
  function label(txt){
    try{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#14361f';g.fillRect(0,0,256,64);g.fillStyle='#fff';g.font='bold 40px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,128,34);
      return new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide})}catch(e){return new THREE.MeshBasicMaterial({color:'#14361f'})}}
  function build(){
    let mesh=null;const rings=[];
    const g=new THREE.Group();g.position.set(P.x,surf(),P.z);scene.add(g);
    const std=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.95},o||{})),bas=(c,o)=>new THREE.MeshBasicMaterial(Object.assign({color:c},o||{}));
    const plane=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
    // grass stripes
    const N=8,sw=2*C.hw/N;for(let i=0;i<N;i++){const m=new THREE.Mesh(plane,std(i%2?'#58b252':'#4da84a',{polygonOffset:true,polygonOffsetFactor:-1}));m.scale.set(sw,1,2*C.hh);m.position.set(-C.hw+sw*(i+.5),.03,0);m.receiveShadow=true;g.add(m)}
    // markings
    const wm=bas('#ffffff'),line=(x1,z1,x2,z2,w)=>{const m=new THREE.Mesh(plane,wm),dx=x2-x1,dz=z2-z1;m.scale.set(Math.hypot(dx,dz)+(w||.14),1,w||.14);m.position.set((x1+x2)/2,.05,(z1+z2)/2);m.rotation.y=-Math.atan2(dz,dx);g.add(m)};
    const hw=C.hw,hh=C.hh;line(-hw,-hh,hw,-hh);line(-hw,hh,hw,hh);line(-hw,-hh,-hw,hh);line(hw,-hh,hw,hh);line(0,-hh,0,hh);
    const circ=new THREE.Mesh(new THREE.RingGeometry(4.5,4.65,48).rotateX(-Math.PI/2),wm);circ.position.y=.05;g.add(circ);
    const spot=new THREE.Mesh(new THREE.CircleGeometry(.25,16).rotateX(-Math.PI/2),wm);spot.position.y=.055;g.add(spot);
    for(const s of [-1,1]){const bx=s*(hw-5),bw=7.5;line(s*hw,-bw,bx,-bw);line(s*hw,bw,bx,bw);line(bx,-bw,bx,bw)}   // penalty-area style boxes
    // boards (visual; the physics walls are at hh / hw)
    const bm=std('#f1f0ea'),sm=std('#2f6fd0');
    for(const s of [-1,1]){const bd=new THREE.Mesh(new THREE.BoxGeometry(2*hw+1,.9,.3),bm);bd.position.set(0,.45,s*(hh+.35));bd.castShadow=true;g.add(bd);
      const st2=new THREE.Mesh(new THREE.BoxGeometry(2*hw+1,.25,.32),sm);st2.position.set(0,.75,s*(hh+.35));g.add(st2)}
    for(const e of [-1,1])for(const s of [-1,1]){const seg=hh-C.goalW/2,bd=new THREE.Mesh(new THREE.BoxGeometry(.3,.9,seg),bm);bd.position.set(e*(hw+.35),.45,s*(C.goalW/2+seg/2));bd.castShadow=true;g.add(bd)}
    // goals: posts, bar, nets. East goal belongs to RED (blue attacks it), west to BLUE.
    const netTex=(()=>{try{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.strokeStyle='rgba(255,255,255,.85)';x.lineWidth=2;for(let i=0;i<=64;i+=16){x.beginPath();x.moveTo(i,0);x.lineTo(i,64);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(64,i);x.stroke()}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(4,2);return t}catch(e){return null}})();
    const netM=()=>new THREE.MeshBasicMaterial({color:'#ffffff',map:netTex,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});
    for(const e of [-1,1]){
      const col=e>0?'#e04848':'#3a86e8',fm=std(col,{roughness:.5}),gx=e*hw,gd=C.goalD,gw=C.goalW,gh=C.goalH;
      for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,gh,10),fm);p.position.set(gx,gh/2,s*gw/2);p.castShadow=true;g.add(p);
        const bk=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,gh,8),fm);bk.position.set(gx+e*gd,gh/2,s*gw/2);g.add(bk);
        const side=new THREE.Mesh(new THREE.PlaneGeometry(gd,gh),netM());side.position.set(gx+e*gd/2,gh/2,s*gw/2);g.add(side)}
      const bar=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,gw,10).rotateX(Math.PI/2),fm);bar.position.set(gx,gh,0);g.add(bar);
      const back=new THREE.Mesh(new THREE.PlaneGeometry(gw,gh),netM());back.rotation.y=Math.PI/2;back.position.set(gx+e*gd,gh/2,0);g.add(back);
      const roof=new THREE.Mesh(new THREE.PlaneGeometry(gd,gw),netM());roof.rotation.x=Math.PI/2;roof.position.set(gx+e*gd/2,gh,0);g.add(roof);
    }
    // corner flags + floodlight poles
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.5,6),std('#ffffff'));pole.position.set(sx*hw,.75,sz*hh);g.add(pole);
      const fl=new THREE.Mesh(new THREE.PlaneGeometry(.5,.32),bas('#ffd24a',{side:THREE.DoubleSide}));fl.position.set(sx*hw+.25,1.35,sz*hh);g.add(fl);
      const lp=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,9,8),std('#6b6f78'));lp.position.set(sx*(hw+3),4.5,sz*(hh+3));lp.castShadow=true;g.add(lp);
      const lh=new THREE.Mesh(new THREE.BoxGeometry(1.2,.5,.6),bas('#fff6c8'));lh.position.set(sx*(hw+3),9.1,sz*(hh+3));g.add(lh)}
    // kick-off pad on the town side + sign
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.6,.3,28),std('#3ddc84',{emissive:'#14a85a',emissiveIntensity:.5}));pad.position.set(0,.15,hh+5);g.add(pad);
    const sg=new THREE.Mesh(new THREE.PlaneGeometry(4.2,1.05),label('⚽ KICK OFF'));sg.position.set(0,3.4,hh+5);g.add(sg);g.userData.sign=sg;
    // ball
    mesh=new THREE.Mesh(new THREE.SphereGeometry(BR.r,20,16),new THREE.MeshStandardMaterial({color:'#ffffff',map:ballTexture(),roughness:.5}));mesh.castShadow=true;scene.add(mesh);
    // team rings under the players during a match
    for(const c of ['#4aa3ff','#ff5a5a']){const r=new THREE.Mesh(new THREE.RingGeometry(.5,.68,28).rotateX(-Math.PI/2),bas(c,{transparent:true,opacity:.85,side:THREE.DoubleSide}));r.visible=false;scene.add(r);rings.push(r)}
    return {mesh,rings,group:g};
  }
  return {build};
})();
