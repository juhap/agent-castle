/* A deterministic, locally rendered highland landscape. */
(() => {
'use strict';
const T = THREE, TAU = 2 * Math.PI, V = T.Vector3;
const main = document.querySelector('#scene'), canvas = document.querySelector('#world');
const skyCanvas = document.querySelector('#sky');
let seed = 41953;
function rand(){ seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }
const between=(a,b)=>a+(b-a)*rand(), clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function smooth(a,b,x){const k=clamp((x-a)/(b-a),0,1);return k*k*(3-2*k)}
const select=a=>a[Math.floor(rand()*a.length)];
const scene=new T.Scene(), camera=new T.PerspectiveCamera(38,1,.3,950);
let renderer;
try {renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});}
catch(e){const msg=document.createElement('p');msg.className='fallback';msg.textContent='Enable WebGL in your browser to view Alderwatch Castle.';main.append(msg);return;}
renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
scene.fog=new T.Fog(0xa9baac,58,204);
scene.add(new T.HemisphereLight(0xe5efef,0xb5ab91,1.55));
const sun=new T.DirectionalLight(0xffe5bb,2.5);sun.position.set(-38,58,32);scene.add(sun);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-39,right:39,top:39,bottom:-39,near:1,far:140});sun.shadow.normalBias=.047;sun.shadow.bias=-.00025;
const bucket=new Map();
function material(map=null,unlit=false){const opt={vertexColors:true,side:T.DoubleSide};if(map)opt.map=map;return unlit?new T.MeshBasicMaterial(opt):new T.MeshLambertMaterial(opt)}
function texture(kind){
 const c=document.createElement('canvas');c.width=256;c.height=256;const g=c.getContext('2d');
 g.fillStyle=kind==='stone'?'#c6c0af':'#9a9f9c';g.fillRect(0,0,256,256);
 const row=kind==='stone'?12:9;
 for(let j=-1;j<256/row;j++){
  let x=-between(2,38);while(x<256){let w=kind==='stone'?between(23,49):between(12,22),v=Math.floor(between(225,250));
  g.fillStyle='rgb('+v+','+(v-2)+','+(v-6)+')';g.fillRect(x,j*row+1,w-1,row-1);
  g.fillStyle='#ffffff35';g.fillRect(x+1,j*row+1,w-2,1);x+=w;}
 }
 for(let i=0;i<11000;i++){g.fillStyle=rand()<.5?'#443e3220':'#ffffff28';g.fillRect(rand()*256,rand()*256,between(.5,1.9),between(.5,1.6))}
 const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}
const plain=material(), stone=material(texture('stone')), slate=material(texture('slate')), far=material(null,true);far.fog=false;
function buf(mat){if(!bucket.has(mat))bucket.set(mat,{p:[],n:[],c:[],u:[]});return bucket.get(mat);}
const colorCache=new Map();function rgb(c){if(!colorCache.has(c))colorCache.set(c,new T.Color(c));return colorCache.get(c)}
function face(a,b,c,col,mat=plain,factor=1,uv){
 const out=buf(mat),co=rgb(col);
 const abx=b[0]-a[0],aby=b[1]-a[1],abz=b[2]-a[2],acx=c[0]-a[0],acy=c[1]-a[1],acz=c[2]-a[2];
 let nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;const d=Math.hypot(nx,ny,nz)||1;nx/=d;ny/=d;nz/=d;
 for(let i=0;i<3;i++){const p=[a,b,c][i];out.p.push(...p);out.n.push(nx,ny,nz);out.c.push(co.r*factor,co.g*factor,co.b*factor);
 if(mat.map){if(uv)out.u.push(...uv[i]);else out.u.push((Math.abs(nx)>Math.abs(nz)?p[2]:p[0])/6,(Math.abs(ny)>.85?p[2]:p[1])/6);}}
}
function quad(a,b,c,d,col,mat=plain,f=1){face(a,b,c,col,mat,f);face(a,c,d,col,mat,f)}
function box(x,y,z,w,h,d,col,mat=plain,rot=0){
 const cs=Math.cos(rot),ss=Math.sin(rot);const p=(a,b,c)=>[x+a*cs+c*ss,y+b,z-a*ss+c*cs];
 const pts=[p(-w/2,0,d/2),p(w/2,0,d/2),p(w/2,h,d/2),p(-w/2,h,d/2),p(-w/2,0,-d/2),p(w/2,0,-d/2),p(w/2,h,-d/2),p(-w/2,h,-d/2)];
 for(const ids of [[0,1,2,3],[1,5,6,2],[5,4,7,6],[4,0,3,7],[3,2,6,7],[4,5,1,0]])quad(...ids.map(i=>pts[i]),col,mat);
}
function drum(x,y,z,r1,r2,h,col,mat=plain,n=16){
 for(let i=0;i<n;i++){
 const a=i*TAU/n,b=(i+1)*TAU/n,point=(r,y,t)=>[x+r*Math.sin(t),y,z+r*Math.cos(t)];
 const p=point(r1,y,a),q=point(r1,y,b),s=point(r2,y+h,a),t=point(r2,y+h,b);
 quad(p,q,t,s,col,mat);face(s,t,[x,y+h,z],col,mat);
 }
}
function bake(){
 for(const [mat,o] of bucket){const g=new T.BufferGeometry();
 for(const [name,data,size] of [['position',o.p,3],['normal',o.n,3],['color',o.c,3],['uv',o.u,2]])if(data.length)g.setAttribute(name,new T.Float32BufferAttribute(data,size));
 const m=new T.Mesh(g,mat);m.receiveShadow=mat!==far;m.castShadow=mat!==far;scene.add(m);}bucket.clear();
}
// Ground elevation follows an irregular rock shelf and softens into the valley.
const base=11;
function radial(x,z){const a=Math.atan2(z/13.1,x/16.9);return Math.hypot(x/16.9,z/13.1)/(1+.046*Math.sin(5*a+.9)+.044*Math.cos(3*a)-.018*Math.cos(9*a))}
function land(x,z){
 const r=radial(x,z);const waves=Math.sin(x*.127+z*.11)*.58+Math.cos(z*.24-x*.13)*.38+Math.sin(x*.41+z*.36)*.22;
 const height=base-.45*smooth(.86,1.06,r)-6.4*smooth(1.01,1.39,r)-5.2*smooth(1.27,2.02,r)-5*smooth(1.62,3.6,r)+waves*smooth(.87,1.72,r)+(2.8*Math.sin(x*.052+z*.033)+2.4*Math.cos(z*.059-x*.019))*smooth(2.1,5.6,r);
 if(z<9||z>43)return height;
 const roadbed=base-(z-9)*.49,shoulder=1-smooth(1.2,8.6,Math.abs(x-roadX(z)));
 return height+Math.max(0,roadbed-height)*shoulder;
}
const terrainMaterial=material();
terrainMaterial.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 groundPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngroundPosition=position;');
 shader.fragmentShader='varying vec3 groundPosition;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float distanceAlong=groundPosition.z-9.0;
 float centre=1.5-sin(distanceAlong*.152)*min(max(distanceAlong,0.0)*.61,7.0)+max(0.0,distanceAlong-21.0)*.28;
 float lateral=abs(groundPosition.x-centre);
 float grit=fract(sin(dot(floor(groundPosition.xz*24.0),vec2(12.9898,78.233)))*43758.5453);
 float width=1.03+.20*smoothstep(10.0,23.0,groundPosition.z)+.075*sin(groundPosition.z*3.45);
 float road=(1.0-smoothstep(width-.1,width+.07,lateral+grit*.06))*smoothstep(8.6,9.0,groundPosition.z)*(1.0-smoothstep(78.0,89.0,groundPosition.z));
 float ruts=1.0-smoothstep(.045,.23,abs(lateral-width*.55));
 vec3 gravel=vec3(.436,.346,.202)*(.93+.08*grit-.055*ruts);
 diffuseColor.rgb=mix(diffuseColor.rgb,gravel,road);
 `);
};
function ground(){
 const rings=[],n=130;
 for(let i=0;i<84;i++){
 const radius=i<25?i*.066:1.65+(i-25)*(.055+(i-25)*.0039);
 const ring=[];for(let j=0;j<n;j++){
 const a=(j+between(-.29,.29))*TAU/n,r=radius*(1+between(-.012,.012));
 const x=Math.cos(a)*r*16.9,z=Math.sin(a)*r*13.1,rr=radial(x,z);
 ring.push([x,land(x,z)+between(-.36,.36)*smooth(.9,1.2,rr),z]);}rings.push(ring);}
 for(let i=1;i<rings.length;i++)for(let j=0;j<n;j++){
 const k=(j+1)%n,a=rings[i-1][j],b=rings[i][j],c=rings[i][k],d=rings[i-1][k];
 for(const [p,q,t] of [[a,c,b],[a,d,c]]){
 const x=(p[0]+q[0]+t[0])/3,z=(p[2]+q[2]+t[2])/3,r=radial(x,z);
 const rocky=Math.abs(x-roadX(z))>(z>9?3.8:0)&&r>1.055+Math.sin(x*.5)*.033&&r<1.45+.09*Math.sin(z*.5+x*.3);
 const color=rocky?select([0x858276,0x999184,0xa59a86,0x8b8879,0xaaa18b,0x9b9686]):r<.96?0x87875c:r<1.9?0x929354:0x6e8054;
 face(p,q,t,color,terrainMaterial,between(.96,1.025));}}
}
ground();
// Distant ridgelines are complete rings, with individually lit rock facets.
function mountains(radius,y,amp,col,n){
 const phase=between(0,8),rows=[],levels=6,tint=rgb(col),mist=rgb(0xa9baac);
 for(let j=0;j<levels;j++){
 const row=[],v=j/(levels-1);
 for(let i=0;i<n;i++){const a=i*TAU/n,t=a+phase;
 const warp=.057*Math.sin(t*11+1.7*v)*v+.064*Math.sin(t*6-.7)*v;
 const u=t+warp;
 const folds=.34*Math.sin(u*7)+.24*Math.sin(u*13+.7)+.28*Math.cos(u*4-.8)+.16*Math.sin(u*26)+.085*Math.sin(u*41)+.036*Math.sin(u*94);
 const top=y+amp*folds,spread=(.20+.057*Math.sin(t*9.0)+.036*Math.sin(t*21))*v;
 const r=radius*(1-spread);
 const h=top*(1-v)-32*v+Math.sin(Math.PI*v)*(3.4*Math.sin(t*16+v*1.8)+4.4*Math.cos(t*9.1));
 const light=(.055*Math.sin(u*13+1.5)+.034*Math.sin(u*26+.65)+.023*Math.cos(u*7))*(1-v);
 const striation=(Math.sin(u*28+v*4)*.026+Math.cos(u*53+1.3*v)*.019)*(1-v);
 const blend=clamp((1-smooth(-6,13,h))*.90+v*.17,0,1);
 const color=tint.clone().multiplyScalar(1+light*1.35+striation).lerp(mist,blend);
 row.push({pos:[r*Math.sin(a+warp*.27),h,r*Math.cos(a+warp*.27)],color});}
 rows.push(row);}
 function ridgeFace(a,b,c){
 const out=buf(far);face(a.pos,b.pos,c.pos,col,far);const offset=out.c.length-9;
 [a,b,c].forEach((p,i)=>{const k=offset+i*3;out.c[k]=p.color.r;out.c[k+1]=p.color.g;out.c[k+2]=p.color.b;});
 }
 for(let j=1;j<levels;j++)for(let i=0;i<n;i++){const k=(i+1)%n,a=rows[j-1][i],b=rows[j-1][k],c=rows[j][k],d=rows[j][i];ridgeFace(a,b,d);ridgeFace(d,b,c);}
}
mountains(348,24,34,0xb7c0c2,320);mountains(250,8,23,0x9faeaa,260);mountains(175,-1,13,0x94aa9c,230);
// A curved wagon road connects the gate to the valley floor.
function roadX(z){const d=z-9;return 1.5-Math.sin(d*.152)*Math.min(Math.max(0,d)*.61,7)+Math.max(0,d-21)*.28;}
const cream=0xcac0a8,trim=0xe0d3b6,foot=0xa79e88, roof=0x364f5c,edge=0x2b4048,metal=0x8b7750,red=0x973f32;
// Local coordinates keep the ornament flush with each facade around the orbit.
function facade(x,z,angle){return (u,y,v)=>[x+u*Math.cos(angle)+v*Math.sin(angle),y,z-u*Math.sin(angle)+v*Math.cos(angle)]}
function archShape(P,y,w,h,depth,col){
 const r=w/2,cy=y+h-r;
 quad(P(-r,y,depth),P(r,y,depth),P(r,cy,depth),P(-r,cy,depth),col);
 for(let i=0;i<10;i++){const a=i*Math.PI/10,b=(i+1)*Math.PI/10;face(P(0,cy,depth),P(r*Math.cos(a),cy+r*Math.sin(a),depth),P(r*Math.cos(b),cy+r*Math.sin(b),depth),col);}
}
function opening(x,y,z,w,h,ang=0,gate=false){
 const P=facade(x,z,ang),m=gate?.30:.12;
 archShape(P,y-.07,w+2*m,h+m+.07,.035,trim);archShape(P,y,w,h,.05,gate?0x3f382a:0x293b38);
 const r=w/2,cy=y+h-r;
 for(let i=0;i<(gate?13:7);i++){
 const count=gate?13:7,a=i*Math.PI/count+.012,b=(i+1)*Math.PI/count-.012;
 const at=(d,t)=>P(d*Math.cos(t),cy+d*Math.sin(t),.072);
 quad(at(r,a),at(r+m,a),at(r+m,b),at(r,b),i%3===1?0xc2b79d:0xded0b1);
 }
 if(gate){for(let i=-4;i<=4;i++){const u=i*w/10,top=cy+Math.sqrt(r*r-u*u)-.13;quad(P(u-.042,y,.084),P(u+.042,y,.084),P(u+.042,top,.084),P(u-.042,top,.084),0x242a23);}
 for(const h1 of [.5,1.5,2.5]){if(h1<h-r)quad(P(-r,y+h1,.087),P(r,y+h1,.087),P(r,y+h1+.065,.087),P(-r,y+h1+.065,.087),0x242a23);}
 }else{const p=P(0,y-.12,.07);box(p[0],p[1],p[2],w+.37,.15,.24,trim,plain,ang);
 if(w>.62){quad(P(-.047,y,.075),P(.047,y,.075),P(.047,y+h-.08,.075),P(-.047,y+h-.08,.075),foot);quad(P(-r,y+h*.59,.076),P(r,y+h*.59,.076),P(r,y+h*.59+.075,.076),P(-r,y+h*.59+.075,.076),foot);}}
}
function merlon(x,y,z,w,d,rot=0){box(x,y,z,w,.66,d,cream,stone,rot);box(x,y+.62,z,w+.07,.09,d+.09,trim,plain,rot)}
function curtain(x1,z1,x2,z2,h){
 const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz),rot=-Math.atan2(dz,dx),x=(x1+x2)/2,z=(z1+z2)/2;
 box(x,base-.1,z,len,h+.1,1,cream,stone,rot);box(x,base+.1,z,len,.55,1.26,foot,stone,rot);box(x,base+h-.5,z,len,.18,1.2,trim,plain,rot);
 const count=Math.ceil(len/1.24);
 for(let i=0;i<count;i++){const f=(i+.5)/count;merlon(x1+dx*f,base+h,z1+dz*f,len/count*.57,1.07,rot);}
}
function peak(x,y,z,r,h){
 drum(x,y-.12,z,r*.99,r,.18,edge,plain,20);
 drum(x,y,z,r,r*.66,h*.25,roof,slate,20);drum(x,y+h*.25,z,r*.68,r*.29,h*.43,roof,slate,20);drum(x,y+h*.68,z,r*.30,.065,h*.32,roof,slate,20);
 drum(x,y+h-.04,z,.095,.07,.38,metal,plain,8);drum(x,y+h+.28,z,.15,0,.26,metal,plain,8);
}
function tower(x,z,r,h,cap=0){
 const y=base+h,n=16;
 drum(x,base-.3,z,r*1.14,r,1.75,foot,stone,n);drum(x,base+.9,z,r,r,h-1.05,cream,stone,n);
 drum(x,y-.75,z,r+.02,r+.28,.43,foot,stone,n);drum(x,y-.32,z,r+.28,r+.28,.64,cream,stone,n);
 drum(x,y-.02,z,r+.32,r+.32,.13,trim,plain,n);
 for(let i=0;i<8;i++){
 const a=(i+.5)*TAU/8,rad=r*Math.cos(Math.PI/n);
 if(i%2===0||h>10)opening(x+rad*Math.sin(a),y-3.3,z+rad*Math.cos(a),h>11?.75:.43,h>11?1.75:1.35,a);
 if(h<11&&i%2===0){const P=facade(x+rad*Math.sin(a),z+rad*Math.cos(a),a);
 quad(P(-.062,base+1.6,.045),P(.062,base+1.6,.045),P(.062,base+2.44,.045),P(-.062,base+2.44,.045),0x4c5042);}
 if(h>13&&i%2){opening(x+rad*Math.sin(a),y-7.7,z+rad*Math.cos(a),.42,1.35,a);}
 }
 for(let i=0;i<16;i++){const a=(i+.5)*TAU/16,rim=r+.03;box(x+rim*Math.sin(a),y-.91,z+rim*Math.cos(a),.19,.51,.26,foot,stone,a);}
 if(cap){peak(x,y+.33,z,r*1.23,cap)}else{drum(x,y+.30,z,r+.18,r+.18,.1,foot,plain,n);for(let i=0;i<10;i++){const a=i*TAU/10;merlon(x+(r+.06)*Math.sin(a),y+.38,z+(r+.06)*Math.cos(a),r*.39,.45,a)}}
 return y+(cap?cap+.33:.9);
}
function hipRoof(x,y,z,w,d,h,ridge,col=roof){
 const p=(a,b,c)=>[x+a,y+b,z+c],a=p(-w/2,0,d/2),b=p(w/2,0,d/2),c=p(w/2,0,-d/2),e=p(-w/2,0,-d/2),l=p(-ridge/2,h,0),r=p(ridge/2,h,0);
 quad(a,b,r,l,col,slate);face(b,c,r,col,slate);quad(c,e,l,r,col,slate);face(e,a,l,col,slate);box(x,y-.15,z,w,.18,d,edge);box(x,y+h-.04,z,ridge,.12,.14,edge);
}
function hall(x,z,w,d,h,roofHeight){
 box(x,base,z,w,h,d,cream,stone);box(x,base+.1,z,w+.3,.65,d+.3,foot,stone);
 for(const level of [h*.47,h-.4])box(x,base+level,z,w+.17,.18,d+.17,trim);
 for(let i=0;i<4;i++){const a=i*Math.PI*.5,span=i%2?d:w,depth=i%2?w:d,P=facade(x,z,a);
 const count=Math.max(2,Math.floor(span/2.1));
 for(let j=0;j<count;j++){let u=span*((j+.5)/count-.5);const p=P(u,0,depth/2);opening(p[0],base+h-3.05,p[2],.85,1.87,a);opening(p[0],base+h*.47-2.2,p[2],.52,1.32,a);}
 }
 // Corner quoins and projecting eaves catch the afternoon light.
 for(const i of [-1,1])for(const j of [-1,1])for(let k=1;k<h/.63;k++){box(x+i*(w/2-.12),base+k*.63,z+j*(d/2-.12),k%2?.54:.36,.28,k%2?.36:.54,0xd4c8ae);}
 hipRoof(x,base+h,z,w+.8,d+.8,roofHeight,Math.max(.25,w-d*.65));
}
curtain(-9,6.8,-2,8.2,4.6);curtain(4.7,8.2,10,5.9,4.7);curtain(10,5.9,10,-5.8,4.9);
curtain(10,-5.8,0,-8.6,5.3);curtain(0,-8.6,-9,-5.8,5.4);curtain(-9,-5.8,-9,6.8,4.9);
tower(-9,6.8,1.85,6.9);tower(10,5.9,1.95,7.5,4.15);tower(9.8,-5.7,1.8,9.5,4.8);tower(-8.8,-5.8,1.85,9.3);
hall(1.8,-3.65,8.1,5.9,12.5,3.9);
hall(-4.2,.65,4.3,5.4,7.6,3.1);
function dormer(x,z,y,rot){
 const P=facade(x,z,rot),p=P(0,y,-.52);box(p[0],y,p[2],1.28,1.1,1.12,cream,stone,rot);
 const a=P(-.78,y+1.04,.11),b=P(.78,y+1.04,.11),c=P(0,y+1.96,.11);
 face(a,b,c,trim);quad(a,c,P(0,y+1.96,-1.3),P(-.78,y+1.04,-1.3),roof,slate);
 quad(b,P(.78,y+1.04,-1.3),P(0,y+1.96,-1.3),c,roof,slate);
 opening(x,y+.13,z,.53,.95,rot);
}
for(const x of [.15,3.55]){dormer(x,-1.36,base+13.4,0);dormer(x,-5.94,base+13.4,Math.PI);}
box(3.65,base+14.6,-4.35,.64,2.7,.74,foot,stone);box(3.65,base+17.19,-4.35,.85,.24,.9,trim);

tower(5.7,-5.7,1.45,15.2,4.7);
const flagX=-2.6,flagZ=-4.6,spire=tower(flagX,flagZ,2.35,17.15,6.95);
tower(5.65,-.9,1.14,12.9,3.65);
box(-.45,base+14.8,-3.9,.67,2.6,.72,foot,stone);box(-.45,base+17.25,-3.9,.83,.26,.85,trim);
// The timber gallery projects from the keep into the enclosed courtyard.
box(1.9,base+8.37,-.39,6.5,.22,.82,0x75634d);
box(1.9,base+9.22,.05,6.5,.09,.11,0x6a5946);
for(let i=0;i<=16;i++){const x=-1.29+i*.40;box(x,base+8.51,.05,.07,.72,.08,0x76664e);}
for(let i=0;i<6;i++){const x=-1.04+i*1.16;box(x,base+7.95,-.46,.22,.47,.61,foot,stone);}
box(1.35,base,7.85,5.45,5.55,2.9,cream,stone);
opening(1.35,base+.01,9.31,2.45,3.9,0,true);
hipRoof(1.35,base+5.55,7.85,5.95,3.35,2.2,3.3);
tower(-1.42,8.62,1.25,6.6,3.1);tower(4.15,8.62,1.25,6.6,3.1);
function banner(x,y,z,w,h,a){
 const P=facade(x,z,a);quad(P(-w/2,y,0),P(w/2,y,0),P(w/2,y-h+.34,.05),P(-w/2,y-h+.34,.05),red);
 face(P(-w/2,y-h+.34,.05),P(w/2,y-h+.34,.05),P(0,y-h,.06),red);
 quad(P(-w*.39,y-.1,.02),P(w*.39,y-.1,.02),P(w*.39,y-.17,.02),P(-w*.39,y-.17,.02),0xe2bd76);
 const cy=y-h*.48;quad(P(0,cy+.34,.04),P(w*.23,cy,.04),P(0,cy-.34,.04),P(-w*.23,cy,.04),0xe3bd77);
}
banner(1.35,base+5.42,9.35,.55,1.08,0);
banner(-5.25,base+4.4,8.13,.95,2.45,-.19);banner(7.05,base+4.5,7.82,.9,2.25,.43);
banner(2.2,base+11.45,-.66,1.1,3.2,0);
const poleY=spire+.02;drum(flagX,poleY-.15,flagZ,.069,.046,3.35,metal,plain,10);drum(flagX,poleY+3.18,flagZ,.11,0,.25,0xc5a363,plain,10);
const flagCanvas=document.createElement('canvas');flagCanvas.width=256;flagCanvas.height=96;
const fg=flagCanvas.getContext('2d');fg.fillStyle='#a5352b';fg.fillRect(0,0,256,96);fg.fillStyle='#d5ab70';fg.fillRect(8,0,2,96);fg.beginPath();
for(const [i,p] of [[0,[61,26]],[1,[65,41]],[2,[74,47]],[3,[65,53]],[4,[61,68]],[5,[57,53]],[6,[48,47]],[7,[57,41]]]){if(i)fg.lineTo(...p);else fg.moveTo(...p);}fg.closePath();fg.fill();
const flagTexture=new T.CanvasTexture(flagCanvas);flagTexture.colorSpace=T.SRGBColorSpace;
const cloth=new T.PlaneGeometry(1,1,25,8);
const clothMat=new T.MeshLambertMaterial({map:flagTexture,side:T.DoubleSide});
const flag=new T.Mesh(cloth,clothMat);flag.position.set(flagX,poleY+3.05,flagZ);flag.frustumCulled=false;scene.add(flag);
function wave(t){const p=cloth.attributes.position;for(let j=0;j<=8;j++){for(let i=0;i<=25;i++){
 const u=i/25,v=j/8,a=u*9-t*3.8;let length=3.77*(1-.26*(1-Math.abs(2*v-1))*Math.pow(u,3));
 p.setXYZ(j*26+i,u*length,-v*1.42-u*.18+u*.13*Math.sin(a+v*.7),u*.55*Math.sin(a+v*.65)+u*.18*Math.sin(a*1.65));}}p.needsUpdate=true;cloth.computeVertexNormals();}
// Several overlapping whorls give each fir its own jagged silhouette.
const greens=[0x334d40,0x3b5340,0x465c43,0x3f594a,0x526348,0x566946,0x485e47,0x5b694b];
function fir(x,z,h,distant){
 const y=land(x,z)-.18,w=h*between(.18,.29),col=select(greens),n=distant?5:8,shift=between(0,TAU);
 if(!distant)drum(x,y,z,h*.039,h*.023,h*.38,0x594f3e,plain,5);
 const lean=between(-.14,.14)*w;
 for(let j=0;j<(distant?3:4);j++){
 const f=j/(distant?3:4),lift=.14+f*.70,top=Math.min(1,lift+.385),span=w*(1-f*.8),points=[];
 for(let i=0;i<n;i++){const a=TAU*i/n+shift+j*.42;const r=span*between(.90,1.15)*(i%2?.81:1.05);points.push([x+Math.sin(a)*r+lean*f,y+h*lift+between(-.06,.04)*h*(1-f*.6),z+Math.cos(a)*r]);}
 for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n],apex=[x+lean*(f+.3),y+h*(j===(distant?2:3)?1:top),z];
 face(a,b,apex,col,plain,between(.87,1.04)*(.84+.2*f));}
 }
}
for(let i=0;i<6100;i++){
 const a=rand()*TAU,r=Math.sqrt(rand())*149,x=Math.sin(a)*r,z=Math.cos(a)*r,rr=radial(x,z);
 if(rr<1.48||(z>8&&z<90&&Math.abs(x-roadX(z))<2.2))continue;
 const grove=Math.sin(x*.24+z*.13)+Math.sin(z*.24-x*.06);
 if(grove<-.86&&rand()<.73)continue;
 const h=between(2.7,7.5)*(1+.08*Math.cos(x*.2));fir(x,z,h,r>82);
}
for(let i=0;i<720;i++){
 const a=rand()*TAU,r=between(1.3,3.5),x=Math.cos(a)*16.9*r,z=Math.sin(a)*13.1*r;
 if(radial(x,z)<1.32||(z>7&&Math.abs(x-roadX(z))<2.05)||rand()<.27+.2*Math.sin(x*.4+z*.24))continue;
 fir(x,z,between(1.7,5.3),false);
}
// Broken stone at the foot of the crags and grass on the upper shelf.
function broadleaf(x,z,h){
 const y=land(x,z);
 drum(x,y-.22,z,.15,.08,h*.66,0x554b39,plain,6);
 const tint=select([0x8e8a4c,0xa29856,0x858949,0x737e4d,0xaf9e60,0x7a8555]);
 for(let l=0;l<4;l++){const a=l*2.399,cx=x+Math.sin(a)*h*.14,cz=z+Math.cos(a)*h*.14;
 const cy=y+h*(l===3?.8:between(.47,.72)),r=h*between(.20,.31),n=7,ring=[],upper=[];
 for(let j=0;j<n;j++){const t=j*TAU/n+a;
 ring.push([cx+r*Math.sin(t),cy-r*.19+between(-.17,.17),cz+r*Math.cos(t)]);
 upper.push([cx+r*.73*Math.sin(t+.25),cy+r*.60+between(-.17,.17),cz+r*.73*Math.cos(t+.25)]);}
 for(let j=0;j<n;j++){const k=(j+1)%n;
 face(ring[k],ring[j],[cx,cy-r*.79,cz],tint,plain,.86);quad(ring[j],ring[k],upper[k],upper[j],tint,plain,between(.91,1.04));face(upper[j],upper[k],[cx,cy+r,cz],tint,plain,between(.97,1.07));}
 }
}
for(let i=0;i<170;i++){const a=TAU*rand(),r=between(1.13,3.9),x=16.9*r*Math.cos(a),z=13.1*r*Math.sin(a);
 if(radial(x,z)<1.23||z>7&&Math.abs(x-roadX(z))<2.65)continue;
 broadleaf(x,z,between(1.6,4.4));
}
function boulder(x,z,s){
 const y=land(x,z)-s*.2,n=6,pts=[],tops=[],col=select([0x949283,0x858779,0xaea490,0xaca28a]);
 for(let i=0;i<n;i++){const a=i*TAU/n,r=s*between(.67,1.2);pts.push([x+Math.sin(a)*r,y,z+Math.cos(a)*r]);tops.push([x+s*.12+Math.sin(a)*r*.61,y+s*between(.4,.75),z+Math.cos(a)*r*.56]);}
 for(let i=0;i<n;i++){const k=(i+1)%n;quad(pts[i],pts[k],tops[k],tops[i],col);face(tops[i],tops[k],[x,y+s*.79,z],col);}
}
for(let i=0;i<650;i++){const a=rand()*TAU,r=between(1.05,2.65),x=16.9*r*Math.cos(a),z=13.1*r*Math.sin(a);if(z>8&&Math.abs(x-roadX(z))<1.9)continue;boulder(x,z,between(.22,1.2));}
for(let i=0;i<1600;i++){const a=rand()*TAU,r=between(.7,2.7),x=16.9*r*Math.cos(a),z=13.1*r*Math.sin(a),y=land(x,z)+.05;
 if(radial(x,z)>1.07&&radial(x,z)<1.4||z>8&&Math.abs(x-roadX(z))<1.5)continue;
 const h=between(.14,.39);for(let j=0;j<3;j++){const d=between(-.13,.13);face([x+d-.04,y,z],[x+d+.04,y,z+.04],[x+d*2,y+h*rand()+.06,z+.07],select([0x85854c,0xa7a368,0x70794f]));}}
bake();
// A small flock glides over the distant ridge.
const flockGeo=new T.BufferGeometry(),wings=new Float32Array(5*18);
flockGeo.setAttribute('position',new T.BufferAttribute(wings,3).setUsage(T.DynamicDrawUsage));
const flock=new T.Mesh(flockGeo,new T.MeshBasicMaterial({color:0x677164,side:T.DoubleSide,fog:false}));
flock.frustumCulled=false;scene.add(flock);
function birds(time){
 const layout=[[8,27,-64,.94],[14,25,-68,.72],[19,27,-71,.8],[24,25,-73,.62],[6,26,-68,.67]];
 for(let i=0;i<layout.length;i++){const [x,y,z,w]=layout[i],t=time*.15+i*.15;
 const cx=x+Math.sin(t)*2.6,cz=z+Math.cos(t)*1.8,cy=y+.15*Math.cos(t);
 const up=.28+.25*Math.sin(time*2.7+i);
 wings.set([cx-w,cy+up,cz-.12,cx,cy,cz+.07,cx-.35*w,cy+.05,cz-.17,cx,cy,cz+.07,cx+w,cy+up*.84,cz+.16,cx+.46*w,cy+.06,cz-.08],i*18);
 }
 flockGeo.attributes.position.needsUpdate=true;
}
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
// Painted sky panorama with seeded cloud banks and a warm, hazy horizon.
const skyTex=document.createElement('canvas');skyTex.width=3072;skyTex.height=768;
const sx=skyTex.getContext('2d');const grad=sx.createLinearGradient(0,0,0,768);
grad.addColorStop(0,'#9eb9c0');grad.addColorStop(.26,'#cad1c4');grad.addColorStop(.53,'#edcfaa');grad.addColorStop(.76,'#f0d7b8');grad.addColorStop(1,'#efd8bc');sx.fillStyle=grad;sx.fillRect(0,0,3072,768);
function hash(x,y){let k=Math.imul(x,374761393)+Math.imul(y,668265263);k=Math.imul(k^(k>>>13),1274126177); return ((k^(k>>>16))>>>0)/4294967295}
function noise(x,y){let i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j;u=u*u*(3-2*u);v=v*v*(3-2*v);return (1-v)*(hash(i,j)*(1-u)+hash(i+1,j)*u)+v*(hash(i,j+1)*(1-u)+hash(i+1,j+1)*u)}
const pixels=sx.getImageData(0,0,3072,768);
for(let y=0;y<768;y+=2)for(let x=0;x<3072;x+=2){
 const a=noise(x*.005,y*.017)*.48+noise(x*.012+40,y*.031)*.28+noise(x*.032,y*.07)*.16+noise(x*.071,y*.16)*.08;
 let c=smooth(.50,.79,a)*.54*(1-smooth(550,746,y));
 const grain=(hash(x,y)-.5)*1.8;for(let j=0;j<2;j++)for(let i=0;i<2;i++){const k=4*((y+j)*3072+x+i);[251,237,210].forEach((v,n)=>{pixels.data[k+n]=pixels.data[k+n]*(1-c)+v*c+grain});}
}sx.putImageData(pixels,0,0);
const skyCtx=skyCanvas.getContext('2d');let width,height,portrait,angle=.41,travel=0,wind=0,paused=false,previous=0,displayed=-1;
// High, wind-streaked clouds veil the pale sun.
const glow=sx.createRadialGradient(1480,250,5,1480,250,185);glow.addColorStop(0,'#ffebc68a');glow.addColorStop(1,'#ffe7b700');sx.fillStyle=glow;sx.fillRect(1295,65,370,370);
sx.fillStyle='#fff0cb';sx.beginPath();sx.ellipse(1480,250,18,26,0,0,TAU);sx.fill();
for(let i=0;i<65;i++){let x=rand()*3072,y=between(80,450),w=between(22,160),h=between(1,5);sx.fillStyle='rgba(255,238,202,'+between(.07,.20)+')';sx.beginPath();sx.ellipse(x,y,w,h,-.013,0,TAU);sx.fill();}
function sky(){
 const w=skyCanvas.width,h=skyCanvas.height,sw=Math.min(2450,1000*width/height),sh=1450;
 const ox=((130+angle/TAU*3072)%3072+3072)%3072,oy=65;
 skyCtx.drawImage(skyTex,ox,oy,Math.min(sw,3072-ox),sh,0,0,w*Math.min(1,(3072-ox)/sw),h);
 if(ox+sw>3072){const split=(3072-ox)/sw;skyCtx.drawImage(skyTex,0,oy,sw-(3072-ox),sh,w*split,0,w*(1-split),h);}
}
function resize(){
 width=main.clientWidth;height=main.clientHeight;portrait=width/height<1.03;renderer.setSize(width,height,false);
 skyCanvas.width=Math.min(width,1600);skyCanvas.height=Math.round(skyCanvas.width*height/width);
 camera.aspect=width/height;camera.fov=portrait?47:37.5;
 camera.setViewOffset(width,height,-width*(portrait?.015:.052),-height*(portrait?.08:.012),width,height);camera.updateProjectionMatrix();sky();
}
const degrees=document.querySelector('#degrees'),fill=document.querySelector('#fill'),needle=document.querySelector('#needle'),cardinal=document.querySelector('#cardinal');
function frame(ms){
 const dt=previous?Math.min(.12,(ms-previous)/1000):0;previous=ms;wind+=dt;
 if(!paused)travel=(travel+dt*TAU/120)%TAU;angle=.41+travel;
 const radius=portrait?Math.max(75,48/(width/height)):72;scene.fog.near=radius-19;scene.fog.far=radius+135;
 camera.position.set(Math.sin(angle)*radius,portrait?31:29.5,Math.cos(angle)*radius);camera.lookAt(0,portrait?14.8:18.1,0);
 birds(wind);wave(wind);sky();renderer.render(scene,camera);
 const d=Math.floor(travel*180/Math.PI);if(d!==displayed){
 displayed=d;degrees.textContent=String(d).padStart(3,'0')+'°';fill.style.width=d/3.6+'%';needle.setAttribute('transform','rotate('+(angle*180/Math.PI)+' 32 47)');cardinal.textContent=['N','NE','E','SE','S','SW','W','NW'][(8-Math.round(angle/TAU*8)%8)%8];}
 requestAnimationFrame(frame);
}
const play=document.querySelector('#play');play.onclick=()=>{paused=!paused;play.setAttribute('aria-pressed',String(paused));play.title=paused?'Resume orbit':'Pause orbit';play.setAttribute('aria-label',play.title);document.querySelector('#playIcon').innerHTML=paused?'<path d="M4 2l9 6-9 6z"/>':'<path d="M3 2h3.4v12H3zm6.6 0H13v12H9.6z"/>';};
const full=document.querySelector('#full');
if(!document.fullscreenEnabled)full.hidden=true;
full.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{full.hidden=true;}};
document.addEventListener('fullscreenchange',()=>{full.title=document.fullscreenElement?'Exit fullscreen':'Enter fullscreen';full.setAttribute('aria-label',full.title);});
window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);
})();
