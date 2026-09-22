/* Medieval castle on a forested hill - self-contained three.js scene.
   No user controls: the camera orbits the castle forever and the flag waves in the wind. */
(function () {
  'use strict';

  if (window.__noWebGL) return;
  const T = window.THREE;

  // ---------------------------------------------------------------------------
  // Deterministic pseudo random + value noise (so the world is identical every load)
  // ---------------------------------------------------------------------------
  let seed = 1337;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function hash2(ix, iz) {
    let h = (ix * 374761393 + iz * 668265263) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = smooth(x - ix), fz = smooth(z - iz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }
  function fbm(x, z) {
    let v = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < 4; i++) {
      v += amp * valueNoise(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return v / norm;
  }

  // ---------------------------------------------------------------------------
  // Terrain shape: a big hill with a flat plateau for the castle, rolling land around it
  // ---------------------------------------------------------------------------
  const WORLD = 900;          // terrain edge length
  const HILL_HEIGHT = 34;     // plateau height above the plain
  const PLATEAU_R = 44;       // flat top radius
  const HILL_R = 150;         // where the hill meets the plain

  function hillHeight(x, z) {
    const r = Math.hypot(x, z);
    if (r >= HILL_R) return 0;
    const t = Math.max(0, r - PLATEAU_R) / (HILL_R - PLATEAU_R);
    return HILL_HEIGHT * (1 - smooth(t));
  }
  function terrainHeight(x, z) {
    const r = Math.hypot(x, z);
    const rolling = (fbm(x * 0.012 + 50, z * 0.012 + 50) - 0.5) * 16 + (fbm(x * 0.05, z * 0.05) - 0.5) * 3;
    // Damp the noise on the plateau so the castle sits on solid flat ground.
    const flat = r < PLATEAU_R ? 0 : Math.min(1, (r - PLATEAU_R) / 40);
    return hillHeight(x, z) + rolling * flat;
  }
  const PLATEAU_Y = terrainHeight(0, 0);

  // ---------------------------------------------------------------------------
  // Renderer / scene / camera
  // ---------------------------------------------------------------------------
  const container = document.getElementById('app');
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const SKY_HORIZON = new T.Color(0xcfe3f5);
  scene.fog = new T.Fog(SKY_HORIZON, 160, 430);

  const camera = new T.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 1500);

  // ---------------------------------------------------------------------------
  // Sky dome (vertical gradient) and sun
  // ---------------------------------------------------------------------------
  const skyMat = new T.ShaderMaterial({
    uniforms: {
      top: { value: new T.Color(0x3d7fd0) },
      mid: { value: new T.Color(0x8fbce8) },
      bottom: { value: SKY_HORIZON },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = h < 0.15 ? mix(bottom, mid, h / 0.15) : mix(mid, top, (h - 0.15) / 0.85);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: T.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new T.Mesh(new T.SphereGeometry(1200, 32, 16), skyMat);
  scene.add(sky);

  const hemi = new T.HemisphereLight(0xbfd9ff, 0x4a6a2a, 1.25);
  scene.add(hemi);

  const sun = new T.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(140, 190, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 600;
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
  scene.add(sun.target);
  // Soft fill from the opposite side so the shaded faces still read as stone.
  const fill = new T.DirectionalLight(0xcfe0ff, 0.55);
  fill.position.set(-120, 80, -140);
  scene.add(fill);

  // Sun disc in the sky
  const sunDisc = new T.Mesh(
    new T.SphereGeometry(28, 16, 16),
    new T.MeshBasicMaterial({ color: 0xfff6d5, fog: false })
  );
  sunDisc.position.copy(sun.position).normalize().multiplyScalar(1100);
  scene.add(sunDisc);

  // ---------------------------------------------------------------------------
  // Procedural textures
  // ---------------------------------------------------------------------------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function stoneTexture() {
    const size = 256;
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    g.fillStyle = '#6f6a63';
    g.fillRect(0, 0, size, size);
    const rows = 8, bh = size / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 22;
      let x = -off;
      while (x < size) {
        const bw = 28 + rand() * 30;
        const l = 52 + rand() * 30;
        const tint = rand() * 12 - 6;
        g.fillStyle = `rgb(${(l + 8 + tint) | 0},${(l + 4) | 0},${(l - 2 - tint) | 0})`;
        g.fillRect(x + 1.5, r * bh + 1.5, bw - 3, bh - 3);
        x += bw;
      }
    }
    // subtle speckle
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(0,0,0,${rand() * 0.18})`;
      g.fillRect(rand() * size, rand() * size, 2, 2);
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  function roofTexture() {
    const size = 128;
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    g.fillStyle = '#5a3a3a';
    g.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 12) {
        const l = 70 + rand() * 40;
        g.fillStyle = `rgb(${l | 0},${(l * 0.45) | 0},${(l * 0.4) | 0})`;
        g.fillRect(x + ((y / 8) % 2) * 6, y, 11, 7);
      }
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
  function flagTexture() {
    const w = 256, h = 160;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#b8202a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c94c';
    // Gold cross band + emblem
    g.fillRect(0, h / 2 - 9, w, 18);
    g.fillRect(w * 0.42 - 9, 0, 18, h);
    g.beginPath();
    g.arc(w * 0.42, h / 2, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b8202a';
    g.beginPath();
    g.arc(w * 0.42, h / 2, 24, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2c94c';
    // simple rampant-lion-ish silhouette: a stylized star
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? 8 : 20;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = w * 0.42 + Math.cos(a) * rr, py = h / 2 + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  const stoneBase = stoneTexture();
  function stoneMaterial(repeatX, repeatY, color) {
    const tex = stoneBase.clone();
    tex.needsUpdate = true;
    tex.repeat.set(repeatX, repeatY);
    return new T.MeshStandardMaterial({ map: tex, color: color || 0xffffff, roughness: 0.92, metalness: 0.0 });
  }
  const roofTex = roofTexture();
  roofTex.repeat.set(6, 3);
  const roofMat = new T.MeshStandardMaterial({ map: roofTex, color: 0xd8c0c0, roughness: 0.85 });
  const darkMat = new T.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 });
  const woodMat = new T.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });

  // ---------------------------------------------------------------------------
  // Terrain mesh with vertex colours
  // ---------------------------------------------------------------------------
  (function buildTerrain() {
    const seg = 240;
    const geo = new T.PlaneGeometry(WORLD, WORLD, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grassLow = new T.Color(0x3f7a2a);
    const grassHigh = new T.Color(0x7fa93c);
    const dirt = new T.Color(0x8a7550);
    const rock = new T.Color(0x7b7a72);
    const tmp = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);
      const r = Math.hypot(x, z);
      const n = fbm(x * 0.03 + 7, z * 0.03 + 3);
      tmp.copy(grassLow).lerp(grassHigh, n);
      if (r < PLATEAU_R + 6) {
        // worn ground around the castle
        tmp.lerp(dirt, 0.45 + 0.3 * n);
      } else if (r < HILL_R) {
        // rocky/steep parts of the hillside
        const slope = Math.abs(hillHeight(x + 2, z) - hillHeight(x - 2, z)) + Math.abs(hillHeight(x, z + 2) - hillHeight(x, z - 2));
        tmp.lerp(rock, Math.min(0.8, slope * 0.55) * (0.6 + 0.4 * n));
      }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new T.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
  })();

  // Winding path from the gate down the hill
  (function buildPath() {
    const pts = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = PLATEAU_R - 14 + t * (HILL_R + 60 - (PLATEAU_R - 14));
      const ang = Math.PI / 2 + Math.sin(t * 3.2) * 0.55 * t;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      pts.push(new T.Vector3(x, terrainHeight(x, z) + 0.25, z));
    }
    const curve = new T.CatmullRomCurve3(pts);
    const geo = new T.TubeGeometry(curve, 120, 2.6, 6, false);
    geo.scale(1, 0.12, 1);
    // TubeGeometry scaled flat becomes a ribbon hugging the ground; re-sample y on the terrain.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, terrainHeight(x, z) + 0.3);
    }
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0x9c8760, roughness: 1 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  })();

  // ---------------------------------------------------------------------------
  // Forest: instanced trunks + two canopy tiers
  // ---------------------------------------------------------------------------
  (function buildForest() {
    const trunkGeo = new T.CylinderGeometry(0.35, 0.55, 3.2, 6);
    trunkGeo.translate(0, 1.6, 0);
    const lowerGeo = new T.ConeGeometry(3.0, 6.5, 7);
    lowerGeo.translate(0, 5.2, 0);
    const upperGeo = new T.ConeGeometry(2.1, 5.5, 7);
    upperGeo.translate(0, 8.6, 0);

    const trunkMat = new T.MeshStandardMaterial({ color: 0x5b3d23, roughness: 1 });
    const leafMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });

    const placements = [];
    const attempts = 26000;
    const half = WORLD / 2 - 10;
    for (let i = 0; i < attempts; i++) {
      const x = (rand() * 2 - 1) * half;
      const z = (rand() * 2 - 1) * half;
      const r = Math.hypot(x, z);
      if (r < PLATEAU_R + 10) continue;                 // keep the plateau clear
      // Thin the forest on the upper slopes, dense on the plain.
      const density = r < HILL_R ? smooth((r - PLATEAU_R - 10) / (HILL_R - PLATEAU_R - 10)) * 0.75 : 1;
      // Clearings from low frequency noise.
      const clearing = fbm(x * 0.01 + 200, z * 0.01 + 90);
      if (rand() > density * (clearing > 0.42 ? 1 : 0.15)) continue;
      // Keep the path clear-ish (path lies at roughly ang = pi/2 => +z side).
      if (x > -8 && x < 8 && z > PLATEAU_R - 14 && z < HILL_R + 60) continue;
      const y = terrainHeight(x, z);
      const s = 0.8 + rand() * 0.9;
      placements.push({ x, y, z, s, rot: rand() * Math.PI * 2, shade: rand() });
    }

    const count = placements.length;
    const trunks = new T.InstancedMesh(trunkGeo, trunkMat, count);
    const lower = new T.InstancedMesh(lowerGeo, leafMat, count);
    const upper = new T.InstancedMesh(upperGeo, leafMat, count);
    const m = new T.Matrix4();
    const q = new T.Quaternion();
    const e = new T.Euler();
    const p = new T.Vector3();
    const sc = new T.Vector3();
    const c = new T.Color();
    const dark = new T.Color(0x1f4d22);
    const light = new T.Color(0x4f8f2f);
    const autumn = new T.Color(0x8a7a2a);
    for (let i = 0; i < count; i++) {
      const t = placements[i];
      e.set(0, t.rot, 0);
      q.setFromEuler(e);
      p.set(t.x, t.y - 0.2, t.z);
      sc.set(t.s, t.s * (0.9 + 0.3 * t.shade), t.s);
      m.compose(p, q, sc);
      trunks.setMatrixAt(i, m);
      lower.setMatrixAt(i, m);
      upper.setMatrixAt(i, m);
      c.copy(dark).lerp(light, t.shade);
      if (t.shade > 0.93) c.lerp(autumn, 0.6);
      lower.setColorAt(i, c);
      c.multiplyScalar(1.12);
      upper.setColorAt(i, c);
    }
    for (const im of [trunks, lower, upper]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      scene.add(im);
    }
  })();

  // ---------------------------------------------------------------------------
  // Castle
  // ---------------------------------------------------------------------------
  const castle = new T.Group();
  castle.position.y = PLATEAU_Y;
  scene.add(castle);

  const WALL_HALF = 24;      // half-size of the curtain wall square
  const WALL_H = 11;
  const WALL_T = 3;

  function addMesh(geo, mat, x, y, z, parent) {
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || castle).add(mesh);
    return mesh;
  }

  // Merlons (battlements) are instanced.
  const merlonGeo = new T.BoxGeometry(2, 1.8, WALL_T + 0.2);
  const merlonMat = stoneMaterial(0.5, 0.4);
  const merlonMatrices = [];
  const tmpM = new T.Matrix4();
  function battlementLine(x0, z0, x1, z1, y, spacing) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(len / spacing);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      tmpM.makeRotationY(ang + Math.PI / 2);
      tmpM.setPosition(x, y, z);
      merlonMatrices.push(tmpM.clone());
    }
  }
  function battlementRing(cx, cz, radius, y, count) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
      tmpM.makeRotationY(-a);
      tmpM.setPosition(x, y, z);
      merlonMatrices.push(tmpM.clone());
    }
  }

  // Curtain walls
  const wallMatLong = stoneMaterial(9, 2.2);
  const wallMatCap = stoneMaterial(9, 0.6);
  const wallGeoX = new T.BoxGeometry(WALL_HALF * 2, WALL_H, WALL_T);
  const wallGeoZ = new T.BoxGeometry(WALL_T, WALL_H, WALL_HALF * 2);
  addMesh(wallGeoX, wallMatLong, 0, WALL_H / 2, -WALL_HALF);
  addMesh(wallGeoX, wallMatLong, 0, WALL_H / 2, WALL_HALF);
  addMesh(wallGeoZ, wallMatLong, -WALL_HALF, WALL_H / 2, 0);
  addMesh(wallGeoZ, wallMatLong, WALL_HALF, WALL_H / 2, 0);
  // Walkway (slightly lower inner ledge) so the wall top looks like a rampart.
  const ledgeGeoX = new T.BoxGeometry(WALL_HALF * 2, 0.6, WALL_T + 1.6);
  const ledgeGeoZ = new T.BoxGeometry(WALL_T + 1.6, 0.6, WALL_HALF * 2);
  addMesh(ledgeGeoX, wallMatCap, 0, WALL_H - 0.3, -WALL_HALF);
  addMesh(ledgeGeoX, wallMatCap, 0, WALL_H - 0.3, WALL_HALF);
  addMesh(ledgeGeoZ, wallMatCap, -WALL_HALF, WALL_H - 0.3, 0);
  addMesh(ledgeGeoZ, wallMatCap, WALL_HALF, WALL_H - 0.3, 0);

  const mY = WALL_H + 0.9;
  battlementLine(-WALL_HALF + 6, -WALL_HALF, WALL_HALF - 6, -WALL_HALF, mY, 4);
  battlementLine(-WALL_HALF, -WALL_HALF + 6, -WALL_HALF, WALL_HALF - 6, mY, 4);
  battlementLine(WALL_HALF, -WALL_HALF + 6, WALL_HALF, WALL_HALF - 6, mY, 4);
  battlementLine(-WALL_HALF + 6, WALL_HALF, -9, WALL_HALF, mY, 4);
  battlementLine(9, WALL_HALF, WALL_HALF - 6, WALL_HALF, mY, 4);

  // Corner towers
  const towerMat = stoneMaterial(5, 3);
  const towerCapMat = stoneMaterial(5, 0.5);
  function roundTower(x, z, radius, height, roofStyle) {
    const geo = new T.CylinderGeometry(radius, radius * 1.08, height, 20);
    addMesh(geo, towerMat, x, height / 2, z);
    // Corbelled ring under the top
    const ring = new T.CylinderGeometry(radius * 1.2, radius, 1.6, 20);
    addMesh(ring, towerCapMat, x, height - 0.8, z);
    if (roofStyle === 'roof') {
      const cone = new T.ConeGeometry(radius * 1.35, radius * 2.1, 20);
      addMesh(cone, roofMat, x, height + radius * 1.05, z);
      // finial
      addMesh(new T.SphereGeometry(0.45, 8, 8), darkMat, x, height + radius * 2.1 + 0.3, z);
    } else {
      // flat top with battlements
      const top = new T.CylinderGeometry(radius * 1.2, radius * 1.2, 0.5, 20);
      addMesh(top, towerCapMat, x, height + 0.25, z);
      battlementRing(x, z, radius * 1.15, height + 1.3, Math.round(radius * 2.2));
    }
    // arrow slits
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const slit = new T.BoxGeometry(0.5, 2.4, 0.4);
      const sm = addMesh(slit, darkMat, x + Math.cos(a) * radius, height * (0.4 + i * 0.15), z + Math.sin(a) * radius);
      sm.rotation.y = -a;
      sm.castShadow = false;
    }
  }
  roundTower(-WALL_HALF, -WALL_HALF, 5, 18, 'roof');
  roundTower(WALL_HALF, -WALL_HALF, 5, 18, 'battlement');
  roundTower(-WALL_HALF, WALL_HALF, 5, 18, 'battlement');
  roundTower(WALL_HALF, WALL_HALF, 5, 18, 'roof');

  // Gatehouse on the +z (front) wall
  (function gatehouse() {
    const gh = new T.Group();
    castle.add(gh);
    const gMat = stoneMaterial(3, 2.4);
    const bodyGeo = new T.BoxGeometry(18, 16, 8);
    addMesh(bodyGeo, gMat, 0, 8, WALL_HALF, gh);
    // Flanking turrets
    for (const sx of [-1, 1]) {
      const tg = new T.CylinderGeometry(3.2, 3.4, 20, 16);
      addMesh(tg, towerMat, sx * 9, 10, WALL_HALF + 3, gh);
      const cone = new T.ConeGeometry(4.2, 6, 16);
      addMesh(cone, roofMat, sx * 9, 23, WALL_HALF + 3, gh);
    }
    battlementLine(-6, WALL_HALF + 3.6, 6, WALL_HALF + 3.6, 16.9, 3);
    // Arched gate opening (dark) with a portcullis grid
    const arch = new T.Group();
    arch.position.set(0, 0, WALL_HALF + 4.05);
    gh.add(arch);
    const gateBody = new T.Mesh(new T.BoxGeometry(6, 7, 0.3), darkMat);
    gateBody.position.y = 3.5;
    arch.add(gateBody);
    const gateTop = new T.Mesh(new T.CylinderGeometry(3, 3, 0.3, 24, 1, false, 0, Math.PI), darkMat);
    gateTop.rotation.x = Math.PI / 2;
    gateTop.rotation.z = Math.PI / 2;
    gateTop.position.y = 7;
    arch.add(gateTop);
    const barMat = new T.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.6, roughness: 0.5 });
    for (let i = -2; i <= 2; i++) {
      const bar = new T.Mesh(new T.BoxGeometry(0.25, 9.5, 0.25), barMat);
      bar.position.set(i * 1.2, 4.75, 0.25);
      arch.add(bar);
    }
    for (let j = 1; j < 4; j++) {
      const bar = new T.Mesh(new T.BoxGeometry(5.6, 0.25, 0.25), barMat);
      bar.position.set(0, j * 2.3, 0.25);
      arch.add(bar);
    }
    // Wooden drawbridge / ramp leading out to the path
    const bridge = new T.Mesh(new T.BoxGeometry(7, 0.5, 12), woodMat);
    bridge.position.set(0, 0.2, WALL_HALF + 10);
    bridge.receiveShadow = true;
    bridge.castShadow = true;
    gh.add(bridge);
    for (let i = 0; i < 6; i++) {
      const plank = new T.Mesh(new T.BoxGeometry(7.2, 0.15, 0.3), darkMat);
      plank.position.set(0, 0.5, WALL_HALF + 5 + i * 2);
      gh.add(plank);
    }
  })();

  // Inner keep
  const keepMat = stoneMaterial(5, 4);
  const keepCapMat = stoneMaterial(5, 0.5);
  const KEEP_X = 2, KEEP_Z = -5;
  const KEEP_W = 20, KEEP_D = 16, KEEP_H = 24;
  addMesh(new T.BoxGeometry(KEEP_W, KEEP_H, KEEP_D), keepMat, KEEP_X, KEEP_H / 2, KEEP_Z);
  addMesh(new T.BoxGeometry(KEEP_W + 1.4, 0.8, KEEP_D + 1.4), keepCapMat, KEEP_X, KEEP_H - 0.4, KEEP_Z);
  // Keep battlements
  const kY = KEEP_H + 0.9;
  battlementLine(KEEP_X - KEEP_W / 2, KEEP_Z - KEEP_D / 2, KEEP_X + KEEP_W / 2, KEEP_Z - KEEP_D / 2, kY, 3.3);
  battlementLine(KEEP_X - KEEP_W / 2, KEEP_Z + KEEP_D / 2, KEEP_X + KEEP_W / 2, KEEP_Z + KEEP_D / 2, kY, 3.3);
  battlementLine(KEEP_X - KEEP_W / 2, KEEP_Z - KEEP_D / 2, KEEP_X - KEEP_W / 2, KEEP_Z + KEEP_D / 2, kY, 3.3);
  battlementLine(KEEP_X + KEEP_W / 2, KEEP_Z - KEEP_D / 2, KEEP_X + KEEP_W / 2, KEEP_Z + KEEP_D / 2, kY, 3.3);
  // Great hall attached to the keep with a pitched roof
  (function hall() {
    const hw = 14, hd = 11, hh = 12;
    const hx = KEEP_X - 12, hz = KEEP_Z + 9;
    addMesh(new T.BoxGeometry(hw, hh, hd), keepMat, hx, hh / 2, hz);
    // Pitched roof: a triangular prism whose ridge runs along the hall's long (x) axis.
    const tri = new T.Shape();
    tri.moveTo(-hd / 2 - 0.9, 0);
    tri.lineTo(hd / 2 + 0.9, 0);
    tri.lineTo(0, 6);
    tri.closePath();
    const roofGeo = new T.ExtrudeGeometry(tri, { depth: hw + 1.6, bevelEnabled: false });
    roofGeo.rotateY(Math.PI / 2);
    roofGeo.computeBoundingBox();
    const bb = roofGeo.boundingBox;
    roofGeo.translate(-(bb.max.x + bb.min.x) / 2, 0, -(bb.max.z + bb.min.z) / 2);
    const hallRoofTex = roofTex.clone();
    hallRoofTex.needsUpdate = true;
    hallRoofTex.repeat.set(0.35, 0.35);
    const roof = new T.Mesh(roofGeo, new T.MeshStandardMaterial({ map: hallRoofTex, color: 0xd8c0c0, roughness: 0.85 }));
    roof.position.set(hx, hh, hz);
    roof.castShadow = true;
    roof.receiveShadow = true;
    castle.add(roof);
    // Chimney
    addMesh(new T.BoxGeometry(1.4, 4, 1.4), keepMat, hx + 4, hh + 3.5, hz - 2);
  })();
  // Windows on the keep
  const winGeo = new T.BoxGeometry(1.2, 2.6, 0.3);
  const winPositions = [
    [-5, 9, KEEP_D / 2], [0, 9, KEEP_D / 2], [5, 9, KEEP_D / 2],
    [-5, 17, KEEP_D / 2], [0, 17, KEEP_D / 2], [5, 17, KEEP_D / 2],
    [-5, 13, -KEEP_D / 2], [5, 13, -KEEP_D / 2],
  ];
  for (const [wx, wy, wz] of winPositions) {
    const w = addMesh(winGeo, darkMat, KEEP_X + wx, wy, KEEP_Z + wz);
    w.castShadow = false;
  }
  for (const [wz, wy] of [[-4, 9], [4, 9], [0, 17]]) {
    const w = addMesh(winGeo, darkMat, KEEP_X + KEEP_W / 2, wy, KEEP_Z + wz);
    w.rotation.y = Math.PI / 2;
    w.castShadow = false;
  }

  // Main tower (tallest) on the keep corner, carrying the flag
  const MAIN_X = KEEP_X + KEEP_W / 2 - 1, MAIN_Z = KEEP_Z - KEEP_D / 2 + 1;
  const MAIN_R = 4.6, MAIN_H = 38;
  addMesh(new T.CylinderGeometry(MAIN_R, MAIN_R * 1.1, MAIN_H, 24), towerMat, MAIN_X, MAIN_H / 2, MAIN_Z);
  addMesh(new T.CylinderGeometry(MAIN_R * 1.25, MAIN_R, 1.8, 24), towerCapMat, MAIN_X, MAIN_H - 0.9, MAIN_Z);
  addMesh(new T.CylinderGeometry(MAIN_R * 1.25, MAIN_R * 1.25, 0.5, 24), towerCapMat, MAIN_X, MAIN_H + 0.25, MAIN_Z);
  battlementRing(MAIN_X, MAIN_Z, MAIN_R * 1.2, MAIN_H + 1.3, 11);
  // A slender turret cap in the middle of the top
  const capGeo = new T.ConeGeometry(2.6, 5, 16);
  addMesh(capGeo, roofMat, MAIN_X, MAIN_H + 2.5 + 0.5, MAIN_Z);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const sm = addMesh(new T.BoxGeometry(0.5, 2.6, 0.4), darkMat, MAIN_X + Math.cos(a) * MAIN_R, 10 + i * 7, MAIN_Z + Math.sin(a) * MAIN_R);
    sm.rotation.y = -a;
    sm.castShadow = false;
  }

  // Commit battlements
  const merlons = new T.InstancedMesh(merlonGeo, merlonMat, merlonMatrices.length);
  merlonMatrices.forEach((mm, i) => merlons.setMatrixAt(i, mm));
  merlons.castShadow = true;
  merlons.receiveShadow = true;
  castle.add(merlons);

  // Courtyard details: a well and some barrels
  (function courtyard() {
    const wellMat = stoneMaterial(2, 1);
    addMesh(new T.CylinderGeometry(2, 2, 1.6, 12), wellMat, 12, 0.8, 12);
    addMesh(new T.CylinderGeometry(1.4, 1.4, 1.7, 12), darkMat, 12, 0.8, 12);
    for (const sx of [-1, 1]) addMesh(new T.BoxGeometry(0.3, 3.2, 0.3), woodMat, 12 + sx * 1.8, 2.4, 12);
    const wr = new T.Mesh(new T.ConeGeometry(2.6, 1.4, 8), roofMat);
    wr.position.set(12, 4.6, 12);
    wr.castShadow = true;
    castle.add(wr);
    const barrelGeo = new T.CylinderGeometry(0.7, 0.7, 1.4, 10);
    for (let i = 0; i < 5; i++) addMesh(barrelGeo, woodMat, -16 + i * 1.6, 0.7, 18 + (i % 2) * 1.2);
  })();

  // ---------------------------------------------------------------------------
  // Flag on top of the main tower (vertices animated every frame)
  // ---------------------------------------------------------------------------
  const FLAG_W = 9, FLAG_H = 5.5;
  const FLAG_SEG_X = 28, FLAG_SEG_Y = 14;
  const poleHeight = 12;
  const poleBaseY = MAIN_H + 5.5;
  const pole = addMesh(new T.CylinderGeometry(0.18, 0.22, poleHeight, 8),
    new T.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.7 }), MAIN_X, poleBaseY + poleHeight / 2, MAIN_Z);
  addMesh(new T.SphereGeometry(0.45, 10, 10),
    new T.MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.8, roughness: 0.3 }), MAIN_X, poleBaseY + poleHeight + 0.3, MAIN_Z);

  const flagGeo = new T.PlaneGeometry(FLAG_W, FLAG_H, FLAG_SEG_X, FLAG_SEG_Y);
  flagGeo.translate(FLAG_W / 2, 0, 0); // hinge the flag on its left edge (x = 0) at the pole
  const flagMat = new T.MeshStandardMaterial({ map: flagTexture(), side: T.DoubleSide, roughness: 0.8 });
  const flag = new T.Mesh(flagGeo, flagMat);
  flag.castShadow = true;
  flag.position.set(MAIN_X, poleBaseY + poleHeight - FLAG_H / 2 - 0.4, MAIN_Z);
  castle.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();
  const flagPos = flagGeo.attributes.position;
  pole.castShadow = true;

  function animateFlag(t) {
    // Wind: mostly steady with gusts. The flag streams in the +x direction (rotated by windDir).
    const gust = 0.75 + 0.25 * Math.sin(t * 0.7) + 0.12 * Math.sin(t * 1.9 + 1.3);
    const arr = flagPos.array;
    for (let i = 0; i < flagPos.count; i++) {
      const bx = flagBase[i * 3], by = flagBase[i * 3 + 1];
      const u = bx / FLAG_W;                         // 0 at the pole, 1 at the free edge
      const amp = u * u * 1.4 * gust + u * 0.15;
      const wave = Math.sin(bx * 1.1 - t * 6.0 * gust) * amp
        + Math.sin(bx * 2.3 + by * 1.6 - t * 9.5 * gust) * amp * 0.35
        + Math.sin(by * 2.0 - t * 4.0) * u * 0.18;
      arr[i * 3] = bx - u * u * 0.6 * (1 - gust * 0.4);      // slight foreshortening as it flaps
      arr[i * 3 + 1] = by - u * u * 0.9 * (1.15 - gust);     // droop when the wind drops
      arr[i * 3 + 2] = wave;
    }
    flagPos.needsUpdate = true;
    flagGeo.computeVertexNormals();
  }
  flag.rotation.y = -0.6; // wind direction

  // ---------------------------------------------------------------------------
  // Clouds
  // ---------------------------------------------------------------------------
  const clouds = [];
  (function buildClouds() {
    const mat = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x556677, emissiveIntensity: 0.25, fog: false });
    const puff = new T.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 16; i++) {
      const g = new T.Group();
      const n = 5 + Math.floor(rand() * 6);
      for (let k = 0; k < n; k++) {
        const m = new T.Mesh(puff, mat);
        const s = 8 + rand() * 12;
        m.scale.set(s * (1 + rand() * 0.6), s * 0.55, s);
        m.position.set((k - n / 2) * 9 + rand() * 6, rand() * 4, (rand() - 0.5) * 10);
        g.add(m);
      }
      g.position.set((rand() - 0.5) * 900, 170 + rand() * 70, (rand() - 0.5) * 900);
      g.userData.speed = 2 + rand() * 3;
      scene.add(g);
      clouds.push(g);
    }
  })();

  // ---------------------------------------------------------------------------
  // Birds circling the castle (tiny flapping V shapes)
  // ---------------------------------------------------------------------------
  const birds = [];
  (function buildBirds() {
    const mat = new T.MeshBasicMaterial({ color: 0x222222, side: T.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const g = new T.Group();
      const wl = new T.Mesh(new T.PlaneGeometry(1.6, 0.4), mat);
      const wr = new T.Mesh(new T.PlaneGeometry(1.6, 0.4), mat);
      wl.position.x = -0.8; wr.position.x = 0.8;
      g.add(wl, wr);
      g.userData = { wl, wr, phase: rand() * 10, radius: 40 + rand() * 40, height: PLATEAU_Y + 55 + rand() * 25, speed: 0.25 + rand() * 0.2 };
      scene.add(g);
      birds.push(g);
    }
  })();

  // ---------------------------------------------------------------------------
  // Camera orbit + main loop
  // ---------------------------------------------------------------------------
  const target = new T.Vector3(0, PLATEAU_Y + 16, 0);
  const clock = new T.Clock();
  const ORBIT_PERIOD = 42; // seconds per full revolution

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  function frame() {
    const t = clock.getElapsedTime();

    // Orbit: constant angular speed, gently breathing radius and height for a cinematic feel.
    const a = (t / ORBIT_PERIOD) * Math.PI * 2;
    const radius = 118 + Math.sin(t * 0.21) * 22;
    const height = PLATEAU_Y + 46 + Math.sin(t * 0.13 + 1) * 18;
    camera.position.set(Math.cos(a) * radius, height, Math.sin(a) * radius);
    camera.lookAt(target);

    animateFlag(t);

    for (const c of clouds) {
      c.position.x += c.userData.speed * 0.016;
      if (c.position.x > 480) c.position.x = -480;
    }
    for (const b of birds) {
      const d = b.userData;
      const ang = t * d.speed + d.phase;
      b.position.set(Math.cos(ang) * d.radius, d.height + Math.sin(t * 0.8 + d.phase) * 3, Math.sin(ang) * d.radius);
      b.rotation.y = -ang;
      const flap = Math.sin(t * 9 + d.phase) * 0.6;
      d.wl.rotation.z = flap;
      d.wr.rotation.z = -flap;
    }

    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
})();
