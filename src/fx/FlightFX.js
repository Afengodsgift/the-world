// FlightFX: the visual reinforcement for flight (kept out of the pose and camera code).
//   - speed lines: a half-res 2D canvas of streaks radiating from the screen centre, scaled by boost (and faintly by cruise),
//     with a soft edge vignette. The centre stays clear so the crosshair/aim point is never obscured.
//   - hover swirl: a slowly turning wind ring at the feet of any hovering avatar (the Superman hover reference) and, when low,
//     a downwash ring on the ground.
// Globals used at runtime: THREE, scene, H.
const FlightFX=(()=>{
  let cv=null,ctx=null,W=0,Hh=0,on=false;const lines=[];
  const mkLine=()=>({a:Math.random()*6.283,r:Math.random(),len:.12+Math.random()*.25,sp:.9+Math.random()*1.3,w:1+Math.random()*1.6});
  function resize(){if(!cv)return;W=cv.width=Math.ceil(innerWidth/2);Hh=cv.height=Math.ceil(innerHeight/2)}
  function ensure(){
    if(cv)return;cv=document.createElement('canvas');
    cv.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4';
    document.body.appendChild(cv);ctx=cv.getContext('2d');resize();addEventListener('resize',resize);
    for(let i=0;i<44;i++)lines.push(mkLine());
  }
  // k = {boost:0..1, cruise:0..1} from CameraRig.speedFrac()
  function screen(dt,k){
    ensure();const amt=k.boost+k.cruise*.16;
    if(amt<.02){if(on){ctx.clearRect(0,0,W,Hh);on=false}return}
    on=true;ctx.clearRect(0,0,W,Hh);
    const cx=W/2,cy=Hh*.46,R=Math.hypot(W,Hh)/2;ctx.lineCap='round';
    for(const l of lines){
      l.r+=dt*l.sp*(.5+amt*1.6);if(l.r>1){Object.assign(l,mkLine());l.r=0}
      const c=Math.cos(l.a),s=Math.sin(l.a),r0=(.2+l.r*.8)*R,r1=r0+l.len*R*(.4+amt)*l.r;
      ctx.strokeStyle='rgba(255,255,255,'+(amt*.55*Math.sin(l.r*Math.PI)).toFixed(3)+')';ctx.lineWidth=l.w*(.7+amt);
      ctx.beginPath();ctx.moveTo(cx+c*r0,cy+s*r0);ctx.lineTo(cx+c*r1,cy+s*r1);ctx.stroke();
    }
    const g=ctx.createRadialGradient(cx,cy,R*.55,cx,cy,R);g.addColorStop(0,'rgba(210,235,255,0)');g.addColorStop(1,'rgba(210,235,255,'+(.16*amt).toFixed(3)+')');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,Hh);
  }

  // ---- hover swirl on any avatar (needs avatar.userData.fl from FlightPose) ----
  const ringMat=()=>new THREE.MeshBasicMaterial({color:'#e8f6ff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  function avatar(g,q,dt){
    const f=q.fl;if(!f)return;
    let fx=q.fx;
    const hover=f.on?f.wH*f.fw:0;
    if(!fx){if(hover<.2)return;
      fx={sw:new THREE.Mesh(new THREE.RingGeometry(.38,.6,40),ringMat()),gr:new THREE.Mesh(new THREE.RingGeometry(.5,1,40),ringMat()),t:Math.random()*9};
      fx.sw.rotation.x=fx.gr.rotation.x=-Math.PI/2;g.add(fx.sw);scene.add(fx.gr);q.fx=fx}
    fx.t+=dt;
    const alt=g.position.y-H(g.position.x,g.position.z);
    // swirl at the feet: slow turn, gentle pulse
    fx.sw.position.y=-.05;fx.sw.rotation.z+=dt*1.4;const p=1+Math.sin(fx.t*2.2)*.12;fx.sw.scale.set(p,p,1);
    fx.sw.material.opacity+=((hover>.5?.34*hover:0)-fx.sw.material.opacity)*Math.min(1,dt*6);
    // downwash on the ground when hovering low
    const low=hover>.5&&alt<7&&alt>.5;
    fx.gr.position.set(g.position.x,g.position.y-alt+.06,g.position.z);
    const ex=(fx.t*.9)%1,sz=(1.2+alt*.25)*(.6+ex*.9);fx.gr.scale.set(sz,sz,1);
    fx.gr.material.opacity+=((low?.3*(1-ex)*(1-alt/7):0)-fx.gr.material.opacity)*Math.min(1,dt*10);
    fx.sw.visible=fx.sw.material.opacity>.01;fx.gr.visible=fx.gr.material.opacity>.01;
  }
  return {screen,avatar};
})();
