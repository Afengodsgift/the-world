#!/usr/bin/env python3
"""Bakes a textured GLB into a tiny vertex-coloured low-poly GLB (for phones).
Usage: python3 tools/lowpoly_glb.py in.glb out.glb [TARGET_TRIS]"""
import sys,numpy as np,trimesh,fast_simplification as fs
src,dst=sys.argv[1],sys.argv[2];T=int(sys.argv[3]) if len(sys.argv)>3 else 3500
sc=trimesh.load(src,force='scene');parts=[]
for name,g in sc.geometry.items():
    g=g.copy();tf=None
    for n in sc.graph.nodes_geometry:
        t,gn=sc.graph[n]
        if gn==name:tf=t;break
    if tf is not None:g.apply_transform(tf)
    col=None
    try:
        col=g.visual.to_color().vertex_colors[:,:3]
    except Exception as e:print('color fail',e)
    if col is None:col=np.full((len(g.vertices),3),160,np.uint8)
    parts.append((g.vertices.copy(),g.faces.copy(),col))
tot=sum(len(f) for _,f,_ in parts);out=[]
for v,f,c in parts:
    tgt=max(200,int(T*len(f)/tot));red=1-tgt/len(f)
    if red>0:
        v2,f2=fs.simplify(v.astype(np.float32),f.astype(np.uint32),target_reduction=red)
        from scipy.spatial import cKDTree
        _,ix=cKDTree(v).query(v2);c2=c[ix]
    else:v2,f2,c2=v,f,c
    out.append(trimesh.Trimesh(v2,f2,vertex_colors=np.c_[c2,np.full(len(c2),255,np.uint8)],process=False));print(len(f),'->',len(f2))
m=trimesh.util.concatenate(out);m.export(dst);print(dst,len(m.faces),'tris')
