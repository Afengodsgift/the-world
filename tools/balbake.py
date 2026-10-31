import trimesh,numpy as np,fast_simplification as fs
from scipy.spatial import cKDTree
f='/mnt/user-data/attachments/949313b2-d708-5421-9c34-d716c1573f11/2a09af53-march_of_war_shogunate_war_balloon.glb'
sc=trimesh.load(f,force='scene');V=[];Fc=[];C=[];off=0
for n in sc.graph.nodes_geometry:
    t,g=sc.graph[n];m=sc.geometry[g].copy();m.apply_transform(t)
    if m.bounds[0][0]<-1.05:continue
    try:c=m.visual.to_color().vertex_colors[:,:3]
    except Exception:c=np.full((len(m.vertices),3),120,np.uint8)
    V.append(m.vertices);Fc.append(m.faces+off);C.append(c);off+=len(m.vertices)
V=np.vstack(V);F=np.vstack(Fc);C=np.vstack(C);print(len(F),'tris kept',V.min(0),V.max(0))
red=1-6000/len(F);v2,f2=fs.simplify(V.astype(np.float32),F.astype(np.uint32),target_reduction=red)
_,ix=cKDTree(V).query(v2);c2=C[ix];print(len(f2))
m=trimesh.Trimesh(v2,f2,process=False);m.apply_translation(-(m.bounds[0]+m.bounds[1])/2);L=(m.bounds[1]-m.bounds[0]);print(L);m.apply_scale(26/L.max())
m=trimesh.Trimesh(m.vertices[m.faces].reshape(-1,3),np.arange(len(m.faces)*3).reshape(-1,3),process=False)
fc=c2[f2].mean(1);m.visual=trimesh.visual.ColorVisuals(m,face_colors=np.c_[fc.astype(np.uint8),np.full(len(fc),255,np.uint8)])
m.export('/home/claude/the-world/assets/sky/balloon.glb');print(m.bounds,fc.mean(0))
