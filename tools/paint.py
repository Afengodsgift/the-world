import trimesh,numpy as np,sys
m=trimesh.load('ship12_raw.glb',force='mesh')
m.apply_transform(trimesh.transformations.rotation_matrix(np.pi,[0,1,0]))   # nose to +z
m.apply_translation(-(m.bounds[0]+m.bounds[1])/2);L=m.bounds[1][2]-m.bounds[0][2];m.apply_scale(20/L)
m=trimesh.Trimesh(m.vertices[m.faces].reshape(-1,3),np.arange(len(m.faces)*3).reshape(-1,3),process=False)
F=m.vertices[m.faces];c=F.mean(1);n=m.face_normals;b=m.bounds;hx=b[1][0];z0,z1=b[0][2],b[1][2]
col=np.zeros((len(c),3))
base=np.array([.17,.27,.48])
for i in range(len(c)):
    x,y,z=c[i];ny=n[i][1];col[i]=base
    if ny>.4:col[i]=np.array([.30,.42,.66])             # lit upper plates
    elif ny<-.4:col[i]=np.array([.09,.12,.2])           # belly
    if abs(x)>.62*hx and z<z1*.2+3:col[i]=np.array([.95,.45,.1])  # wing tips: orange
    if z>z1*.78:col[i]=np.array([.92,.92,.95])                 # white nose
    if z<z0*.86:col[i]=np.array([.12,.12,.15])                 # engine block
    if abs(x)<.9 and ny>.5 and -3<z<5:col[i]=np.array([.95,.78,.2])  # gold dorsal stripe
    col[i]*=0.9+0.2*((hash((round(x,1),round(z,1)))%7)/7)
m.visual=trimesh.visual.ColorVisuals(m,face_colors=np.c_[(col.clip(0,1)*255).astype(np.uint8),np.full(len(c),255,np.uint8)])
m.export('/home/claude/the-world/assets/sky/ship.glb');print(len(m.faces),m.bounds)
# top height near center for the turret mount
v=m.vertices;sel=(abs(v[:,0])<2)&(abs(v[:,2])<4);print('top y near centre',v[sel,1].max())
