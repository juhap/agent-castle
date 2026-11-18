"use strict";

(() => {
  const canvas = document.getElementById("landscape");
  const error = document.getElementById("render-error");
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
  let animationFrame;

  function showError() {
    canvas.closest(".atlas").classList.add("unavailable");
    error.hidden = false;
  }

  if (!gl) {
    showError();
    return;
  }

  const TAU = Math.PI * 2;
  const PERIOD = 52;
  const START_ANGLE = 34 * Math.PI / 180;
  const LIGHT = normalize([.53, .75, .39]);
  const STONE = 0;
  const EARTH = 1;
  const NEEDLES = 2;
  const SLATE = 3;
  const WOOD = 4;
  const IRON = 5;
  const AMBER = 6;
  const BANNER = 7;
  const ROCK = 8;
  const BIRD = 9;

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const shade = (color, factor) => color.map(value => value * factor);
  const blend = (a, b, t) => a.map((value, i) => mix(value, b[i], t));
  const subtract = (a, b) => a.map((value, i) => value - b[i]);
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

  function normalize(vector) {
    const length = Math.hypot(...vector) || 1;
    return vector.map(value => value / length);
  }

  function smoothstep(low, high, value) {
    const t = clamp((value - low) / (high - low), 0, 1);
    return t * t * (3 - 2 * t);
  }

  let seed = 614205;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function hash(x, y) {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function noise(x, y) {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = smoothstep(0, 1, x - i);
    const v = smoothstep(0, 1, y - j);
    return mix(mix(hash(i, j), hash(i + 1, j), u), mix(hash(i, j + 1), hash(i + 1, j + 1), u), v);
  }

  function hill(x, z) {
    const radius = Math.hypot(x, z);
    const distortion = (noise(x * .085 + 10, z * .085) - .5) * 6.5;
    const crest = 11.4 * (1 - smoothstep(11, 30, radius + distortion));
    const apron = 2.0 * (1 - smoothstep(16, 46, radius));
    const ledges = smoothstep(9, 18, radius) * (1 - smoothstep(23, 37, radius))
      * ((noise(x * .23, z * .23) - .5) * 2.3 + Math.sin(radius * 1.15) * .32);
    const valley = (noise(x * .044, z * .044) * 3.2 + noise(x * .12, z * .12) * .95 - 2.1)
      * smoothstep(8, 35, radius);
    const uplands = smoothstep(35, 128, radius) * (noise(x * .018 + 8, z * .018 - 3) * 22
      + noise(x * .043 - 4, z * .043) * 8 - 6);
    const mountains = smoothstep(88, 199, radius) * (noise(x * .011 - 3, z * .011 + 8) ** 1.7 * 34
      + noise(x * .025, z * .025) * 10);
    return crest + apron + ledges + valley + uplands + mountains;
  }

  function pathX(z) {
    const t = z - 6.5;
    return Math.sin(t * .33) * 1.75 + .095 * t + 1.65 * Math.sin(Math.max(t - 6, 0) * .16);
  }

  class Mesh {
    constructor() {
      this.data = [];
    }

    vertex(p, n, color, uv, material) {
      this.data.push(...p, ...n, ...color, ...uv, material);
    }

    triangle(a, b, c, color, material, normals, uv = [[0, 0], [1, 0], [1, 1]], colors) {
      const normal = normals ? null : normalize(cross(subtract(b, a), subtract(c, a)));
      this.vertex(a, normals ? normals[0] : normal, colors ? colors[0] : color, uv[0], material);
      this.vertex(b, normals ? normals[1] : normal, colors ? colors[1] : color, uv[1], material);
      this.vertex(c, normals ? normals[2] : normal, colors ? colors[2] : color, uv[2], material);
    }

    quad(a, b, c, d, color, material, normal, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const n = normal ? [normal, normal, normal] : undefined;
      this.triangle(a, b, c, color, material, n, [uv[0], uv[1], uv[2]]);
      this.triangle(a, c, d, color, material, n, [uv[0], uv[2], uv[3]]);
    }

    box(x, y, z, width, height, depth, color, material, angle = 0) {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const w = width / 2;
      const d = depth / 2;
      const faces = [
        [[-w, 0, d], [w, 0, d], [w, height, d], [-w, height, d]],
        [[w, 0, d], [w, 0, -d], [w, height, -d], [w, height, d]],
        [[w, 0, -d], [-w, 0, -d], [-w, height, -d], [w, height, -d]],
        [[-w, 0, -d], [-w, 0, d], [-w, height, d], [-w, height, -d]],
        [[-w, height, d], [w, height, d], [w, height, -d], [-w, height, -d]],
        [[-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d]],
      ];
      faces.forEach((face, i) => {
        const points = face.map(([px, py, pz]) => [x + px * cosine - pz * sine, y + py, z + px * sine + pz * cosine]);
        const across = i % 2 === 0 || i >= 4 ? width : depth;
        const up = i < 4 ? y + height : y + depth;
        const offset = x * .73 + z * .41 + i * .28;
        this.quad(...points, color, material, undefined, [
          [offset, y], [offset + across, y], [offset + across, up], [offset, up],
        ]);
      });
    }

    round(x, y, z, bottom, top, height, sides, color, material) {
      const slope = (bottom - top) / height;
      const circumference = TAU * Math.max(bottom, top);
      for (let i = 0; i < sides; i++) {
        const a = TAU * i / sides;
        const b = TAU * (i + 1) / sides;
        const ax = Math.cos(a), az = Math.sin(a), bx = Math.cos(b), bz = Math.sin(b);
        const pa = [x + bottom * ax, y, z + bottom * az];
        const pb = [x + bottom * bx, y, z + bottom * bz];
        const qa = [x + top * ax, y + height, z + top * az];
        const qb = [x + top * bx, y + height, z + top * bz];
        const na = normalize([ax, slope, az]);
        const nb = normalize([bx, slope, bz]);
        const u = circumference * i / sides;
        const v = circumference * (i + 1) / sides;
        this.triangle(pa, qa, qb, color, material, [na, na, nb], [[u, y], [u, y + height], [v, y + height]]);
        this.triangle(pa, qb, pb, color, material, [na, nb, nb], [[u, y], [v, y + height], [v, y]]);
        this.triangle(qa, [x, y + height, z], qb, color, material);
      }
    }
  }

  function terrain(mesh) {
    const steps = [];
    for (let value = 0; value < 360; value += value < 35 ? 1.13 : value < 83 ? 2.7 : value < 160 ? 4.6 : 7.5) {
      steps.push(value);
    }
    const axis = steps.slice(1).reverse().map(value => -value).concat(steps);
    const vertices = axis.map(z => axis.map(x => {
      const y = hill(x, z);
      const dx = (hill(x - .4, z) - hill(x + .4, z)) / .8;
      const dz = (hill(x, z - .4) - hill(x, z + .4)) / .8;
      const n = normalize([dx, 1, dz]);
      const radius = Math.hypot(x, z);
      const grass = noise(x * .16 + 10, z * .16) * .58 + noise(x * .046, z * .046 + 12) * .42;
      const meadow = blend([.19, .235, .104], [.395, .439, .194], grass);
      const forest = blend([.10, .17, .103], [.23, .30, .147], grass);
      const rock = blend([.275, .28, .225], [.46, .435, .339], grass);
      const crag = smoothstep(.16, .80, Math.hypot(dx, dz)) * (1 - smoothstep(28, 39, radius));
      const fleck = (noise(x * .5, z * .5) - .5) * .12;
      const color = shade(blend(blend(meadow, forest, smoothstep(21, 38, radius)), rock, crag * .98), 1 + fleck);
      return { p: [x, y, z], n, color };
    }));

    function facet(a, b, c) {
      mesh.triangle(a.p, b.p, c.p, null, EARTH, [a.n, b.n, c.n], undefined, [a.color, b.color, c.color]);
    }

    for (let z = 0; z < axis.length - 1; z++) {
      for (let x = 0; x < axis.length - 1; x++) {
        const a = vertices[z][x], b = vertices[z][x + 1], c = vertices[z + 1][x + 1], d = vertices[z + 1][x];
        if ((x + z) % 2 === 0) {
          facet(a, d, c);
          facet(a, c, b);
        } else {
          facet(a, d, b);
          facet(b, d, c);
        }
      }
    }
  }

  function boulder(mesh, x, z, size, height, color, offsetY = 0) {
    const y = hill(x, z) + offsetY;
    const sides = 5 + Math.floor(random() * 3);
    const rotation = random() * TAU;
    const stretch = .7 + random() * .6;
    const rings = Array.from({ length: 3 }, () => []);
    for (let i = 0; i < sides; i++) {
      const angle = rotation + i * TAU / sides;
      const w = size * (.76 + random() * .48);
      const dx = Math.cos(angle) * w;
      const dz = Math.sin(angle) * w * stretch;
      rings[0].push([x + dx, y - height * .48 - size * .55, z + dz]);
      rings[1].push([x + dx, y + height * (.15 + .23 * random()), z + dz]);
      rings[2].push([x + dx * .61 - size * .18, y + height * (.53 + .31 * random()), z + dz * .67]);
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const tone = shade(color, .83 + random() * .26);
      mesh.quad(rings[0][i], rings[1][i], rings[1][j], rings[0][j], tone, ROCK);
      mesh.quad(rings[1][i], rings[2][i], rings[2][j], rings[1][j], shade(tone, 1.07), ROCK);
      mesh.triangle(rings[2][i], [x - size * .18, y + height * .73, z], rings[2][j], shade(tone, 1.12), ROCK);
    }
  }

  function crags(mesh) {
    for (let i = 0; i < 208; i++) {
      const angle = random() * TAU;
      const radius = 12 + random() * 23;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const onPath = z > 5 && Math.abs(x - pathX(z)) < 1.75;
      if (onPath || (radius < 16 && random() < .55)) continue;
      const shelf = Math.sin(angle * 5 + .6) + Math.cos(angle * 9 - radius * .19);
      const size = (.23 + random() ** 2 * 1.9) * (.85 + .20 * shelf);
      const color = blend([.29, .32, .23], [.48, .47, .36], random());
      boulder(mesh, x, z, size, size * (.64 + random() * .77), color, -.12);
    }
  }

  function conifer(mesh, x, z, height, color, detailed) {
    const y = hill(x, z) - .12;
    const spread = height * (.185 + random() * .075);
    const sides = detailed ? 8 : 6;
    const tiers = detailed ? 5 : 4;
    const spin = random() * TAU;
    const lean = (random() - .5) * height * .09;
    if (detailed) mesh.round(x, y, z, spread * .13, spread * .048, height * .68, 5, [.25, .22, .15], WOOD);

    for (let tier = 0; tier < tiers; tier++) {
      const t = tier / (tiers - 1);
      const base = y + height * (.15 + t * .51);
      const tip = y + height * (.53 + t * .47);
      const radius = spread * (1 - t * .60) * (.86 + random() * .22);
      const rings = Array.from({ length: 3 }, () => []);
      const tierColor = shade(color, .72 + t * .27 + random() * .18);
      for (let i = 0; i < sides; i++) {
        const angle = spin + tier * .49 + i * TAU / sides;
        const width = radius * (.74 + random() * .40);
        const dx = Math.cos(angle) * width;
        const dz = Math.sin(angle) * width;
        const dip = (random() - .5) * height * .075;
        rings[0].push([x + dx, base + dip, z + dz]);
        rings[1].push([x + dx * .61 + lean * .28, mix(base, tip, .38) + dip * .55, z + dz * .61]);
        rings[2].push([x + dx * .24 + lean * .52, mix(base, tip, .71) + dip * .26, z + dz * .24]);
      }
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        const tone = shade(tierColor, .83 + random() * .29);
        mesh.triangle(rings[0][i], [x, base + height * .075, z], rings[0][j], shade(tone, .65), NEEDLES);
        mesh.quad(rings[0][i], rings[1][i], rings[1][j], rings[0][j], tone, NEEDLES);
        if (detailed) {
          mesh.quad(rings[1][i], rings[2][i], rings[2][j], rings[1][j], shade(tone, 1.08), NEEDLES);
          mesh.triangle(rings[2][i], [x + lean, tip, z], rings[2][j], shade(tone, 1.13), NEEDLES);
        } else {
          mesh.triangle(rings[1][i], [x + lean, tip, z], rings[1][j], shade(tone, 1.1), NEEDLES);
        }
      }
    }
  }

  function distantConifer(mesh, x, z, height, color) {
    const y = hill(x, z) - .12;
    const spread = height * (.18 + random() * .07);
    const spin = random() * TAU;
    const sides = 5;
    for (let tier = 0; tier < 3; tier++) {
      const base = y + height * (.15 + tier * .23);
      const tip = [x + tier * .04, y + height * (.62 + tier * .19), z];
      const radius = spread * (1 - tier * .275);
      const rim = [];
      for (let i = 0; i < sides; i++) {
        const angle = spin + tier * .5 + i * TAU / sides;
        rim.push([x + Math.cos(angle) * radius, base + (random() - .5) * height * .055, z + Math.sin(angle) * radius]);
      }
      for (let i = 0; i < sides; i++) {
        const a = rim[i], b = rim[(i + 1) % sides];
        const tone = shade(color, .79 + tier * .13 + random() * .14);
        mesh.triangle(a, tip, b, tone, NEEDLES);
        mesh.triangle(a, b, [x, base, z], shade(tone, .74), NEEDLES);
      }
    }
  }

  function forest() {
    const chunks = new Map();
    function groveAt(x, z) {
      const key = Math.floor(x / 32) + "," + Math.floor(z / 32);
      if (!chunks.has(key)) chunks.set(key, new Mesh());
      return chunks.get(key);
    }

    for (let i = 0; i < 6075; i++) {
      const near = i < 950;
      const radius = near ? Math.sqrt(mix(20 ** 2, 76 ** 2, random())) : Math.sqrt(mix(76 ** 2, 219 ** 2, random()));
      const angle = random() * TAU;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (z > 4 && z < 44 && Math.abs(x - pathX(z)) < 2.05) continue;
      if (radius < 26 && random() < .48) continue;
      const grove = noise(x * .072 + 21, z * .072) * .64 + noise(x * .16, z * .16 + 10) * .36;
      if (grove < .23 && random() < .77) continue;
      const green = blend([.092, .175, .114], [.225, .318, .171], random() * .82 + grove * .18);
      const height = (2.45 + random() ** .9 * 7.2) * (.73 + grove * .42) * mix(.68, 1, smoothstep(20, 36, radius));
      const mesh = groveAt(x, z);
      if (near) conifer(mesh, x, z, height, green, radius < 46);
      else distantConifer(mesh, x, z, height, green);
    }
    for (let i = 0; i < 132; i++) {
      const angle = random() * TAU;
      const radius = 10.6 + random() * 12.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (z > 5 && Math.abs(x - pathX(z)) < 1.65) continue;
      if (Math.abs(x) < 9.3 && Math.abs(z) < 8.6) continue;
      const size = .17 + random() ** 2 * .75;
      const color = blend([.20, .28, .12], [.44, .48, .20], random());
      conifer(groveAt(x, z), x, z, size * 1.5, color, false);
    }
    return Array.from(chunks.values());
  }

  const LIMESTONE = [.64, .61, .52];
  const TRIM = [.72, .68, .57];
  const DARK_STONE = [.51, .51, .444];
  const ROOF = [.244, .313, .293];
  const OAK = [.25, .16, .095];
  const BLACKENED = [.13, .141, .123];
  const CASTLE_Y = 13.27;
  const POLE_X = -2.18;
  const POLE_Z = -2.60;

  function facade(x, z, angle) {
    const normal = [Math.sin(angle), 0, Math.cos(angle)];
    const tangent = [normal[2], 0, -normal[0]];
    return {
      normal,
      point: (u, y, offset = 0) => [x + tangent[0] * u + normal[0] * offset, y, z + tangent[2] * u + normal[2] * offset],
    };
  }

  function arch(mesh, face, center, bottom, width, body, color, material, rim) {
    const radius = width / 2;
    const shoulder = bottom + body;
    const inset = .018;
    const p = (u, y, d = inset) => face.point(center + u, y, d);
    mesh.quad(p(-radius, bottom), p(radius, bottom), p(radius, shoulder), p(-radius, shoulder), color, material, face.normal,
      [[0, 0], [width, 0], [width, body], [0, body]]);
    const count = width > 1 ? 13 : 7;

    for (let i = 0; i < count; i++) {
      const a = Math.PI * i / count;
      const b = Math.PI * (i + 1) / count;
      const ax = Math.cos(a), ay = Math.sin(a), bx = Math.cos(b), by = Math.sin(b);
      mesh.triangle(p(0, shoulder), p(radius * ax, shoulder + radius * ay), p(radius * bx, shoulder + radius * by),
        color, material, [face.normal, face.normal, face.normal],
        [[radius, body], [radius * (1 + ax), body + radius * ay], [radius * (1 + bx), body + radius * by]]);
      const outer = radius + rim;
      const gap = .023;
      const ca = Math.cos(a + gap), sa = Math.sin(a + gap), cb = Math.cos(b - gap), sb = Math.sin(b - gap);
      mesh.quad(p(radius * ca, shoulder + radius * sa, .065), p(outer * ca, shoulder + outer * sa, .065),
        p(outer * cb, shoulder + outer * sb, .065), p(radius * cb, shoulder + radius * sb, .065),
        shade(TRIM, .86 + random() * .25), ROCK, face.normal);
    }

    for (const direction of [-1, 1]) {
      const u = radius * direction;
      const q = u + rim * direction;
      mesh.quad(p(u, bottom, .065), p(q, bottom, .065), p(q, shoulder, .065), p(u, shoulder, .065), TRIM, STONE,
        face.normal, [[0, bottom], [rim, bottom], [rim, shoulder], [0, shoulder]]);
    }
  }

  function windowArch(mesh, face, x, y, width, height, amber = false) {
    arch(mesh, face, x, y, width, height, amber ? [.62, .33, .095] : [.145, .148, .124], amber ? AMBER : IRON, .09);
    const p = (u, v) => face.point(x + u, y + v, .088);
    const sill = width * .66;
    mesh.quad(p(-sill, -.06), p(sill, -.06), p(sill, .022), p(-sill, .022), TRIM, ROCK, face.normal);
    if (width > .55) {
      mesh.quad(p(-.035, 0), p(.035, 0), p(.035, height + width * .4), p(-.035, height + width * .4), BLACKENED, IRON, face.normal);
    }
  }

  function parapet(mesh, x, z, y, length, angle, solidHeight = .44) {
    const direction = [Math.cos(angle), Math.sin(angle)];
    const count = Math.max(2, Math.round(length / 1.12));
    const step = length / count;
    mesh.box(x, y, z, length, solidHeight, .61, LIMESTONE, STONE, angle);
    mesh.box(x, y + solidHeight - .06, z, length + .04, .12, .69, TRIM, STONE, angle);
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * step;
      const px = x + direction[0] * offset;
      const pz = z + direction[1] * offset;
      mesh.box(px, y + solidHeight, pz, step * .62, .70, .65, LIMESTONE, STONE, angle);
      mesh.box(px, y + solidHeight + .64, pz, step * .66, .13, .73, TRIM, STONE, angle);
    }
  }

  function curtain(mesh, x, z, length, angle, height) {
    const y = CASTLE_Y - .54;
    mesh.box(x, y, z, length, height, 1.22, LIMESTONE, STONE, angle);
    mesh.box(x, y, z, length, .66, 1.40, DARK_STONE, STONE, angle);
    mesh.box(x, y + height - .28, z, length, .21, 1.40, TRIM, STONE, angle);
    parapet(mesh, x - Math.sin(angle) * .36, z + Math.cos(angle) * .36, y + height - .06, length, angle);
    parapet(mesh, x + Math.sin(angle) * .38, z - Math.cos(angle) * .38, y + height - .06, length, angle, .29);
  }

  function tower(mesh, x, z, radius, height, roofHeight = 0) {
    const y = CASTLE_Y - .45;
    const top = y + height;
    const sides = 28;
    mesh.round(x, y, z, radius * 1.20, radius * 1.04, .72, sides, DARK_STONE, STONE);
    mesh.round(x, y + .69, z, radius * 1.05, radius, height - .69, sides, LIMESTONE, STONE);
    mesh.round(x, top - .67, z, radius, radius * 1.13, .36, sides, DARK_STONE, STONE);
    mesh.round(x, top - .31, z, radius * 1.13, radius * 1.13, .19, sides, TRIM, STONE);
    mesh.round(x, top - .12, z, radius * 1.12, radius * 1.12, .34, sides, LIMESTONE, STONE);
    for (let i = 0; i < 6; i++) {
      const angle = TAU * i / 6 + .27;
      const fx = x + Math.sin(angle) * (radius * 1.012);
      const fz = z + Math.cos(angle) * (radius * 1.012);
      const face = facade(fx, fz, angle);
      windowArch(mesh, face, 0, top - 2.03, .34, .77, i % 3 === 1);
      if (height > 6.5) windowArch(mesh, face, 0, top - 4.1, .23, .59);
    }

    if (roofHeight > 0) {
      const eave = top + .14;
      mesh.round(x, eave, z, radius * 1.22, radius * 1.23, .18, sides, shade(ROOF, .67), SLATE);
      const tiers = [[0, 1.22], [.20, .92], [.49, .57], [.77, .29], [1, .025]];
      for (let i = 0; i < tiers.length - 1; i++) {
        const [low, wide] = tiers[i], [high, narrow] = tiers[i + 1];
        mesh.round(x, eave + .15 + roofHeight * low, z, radius * wide, radius * narrow,
          roofHeight * (high - low), sides, shade(ROOF, 1 + i * .055), SLATE);
      }
      mesh.round(x, eave + roofHeight, z, .075, .045, .43, 8, [.42, .34, .18], IRON);
      mesh.round(x, eave + roofHeight + .37, z, .10, 0, .22, 8, [.62, .48, .24], IRON);
    } else {
      const count = Math.max(8, Math.round(TAU * radius / .99));
      for (let i = 0; i < count; i++) {
        const angle = TAU * i / count;
        const px = x + Math.cos(angle) * radius * .98;
        const pz = z + Math.sin(angle) * radius * .98;
        const width = TAU * radius / count * .66;
        mesh.box(px, top + .20, pz, width, .68, .52, LIMESTONE, STONE, angle + Math.PI / 2);
        mesh.box(px, top + .82, pz, width + .08, .12, .60, TRIM, STONE, angle + Math.PI / 2);
      }
    }
    return top;
  }

  function gatehouse(mesh) {
    const x = 0, z = 6.0, y = CASTLE_Y - .25;
    const width = 4.0, height = 5.25, depth = 2.65;
    mesh.box(x, y, z, width, height, depth, LIMESTONE, STONE);
    mesh.box(x, y + height - .37, z, width + .30, .28, depth + .28, TRIM, STONE);
    parapet(mesh, x, z + depth / 2, y + height - .08, width + .26, 0);
    parapet(mesh, x, z - depth / 2, y + height - .08, width + .26, 0);
    parapet(mesh, x - width / 2, z, y + height - .08, depth, Math.PI / 2);
    parapet(mesh, x + width / 2, z, y + height - .08, depth, Math.PI / 2);
    const front = facade(x, z + depth / 2, 0);
    const back = facade(x, z - depth / 2, Math.PI);
    arch(mesh, front, 0, y + .12, 2.19, 1.79, shade(OAK, .79), WOOD, .29);
    arch(mesh, back, 0, y + .18, 1.94, 1.83, shade(OAK, .83), WOOD, .22);
    const p = (u, v) => front.point(u, y + v, .077);
    for (const bar of [.66, 1.54]) {
      mesh.quad(p(-1.07, bar), p(1.07, bar), p(1.07, bar + .105), p(-1.07, bar + .105), BLACKENED, IRON, front.normal);
      for (let i = 0; i < 7; i++) {
        const xx = -.94 + i * .31;
        mesh.quad(p(xx - .022, bar + .034), p(xx + .022, bar + .034), p(xx + .022, bar + .073), p(xx - .022, bar + .073),
          [.53, .43, .28], IRON, front.normal);
      }
    }
    mesh.quad(p(-.032, .13), p(.032, .13), p(.032, 2.99), p(-.032, 2.99), BLACKENED, IRON, front.normal);
    mesh.box(0, y - .17, z + depth / 2 + .23, 2.9, .32, .68, DARK_STONE, STONE);
    windowArch(mesh, front, 0, y + 3.67, .54, .62, true);
    for (const side of [-1, 1]) {
      const tx = side * 1.58;
      mesh.box(tx, y + 1.78, z + depth / 2 + .12, .11, .4, .16, BLACKENED, IRON);
      mesh.round(tx, y + 2.09, z + depth / 2 + .17, .088, .021, .22, 6, [.91, .51, .17], AMBER);
    }
  }

  function hall(mesh) {
    const x = 3.25, z = -.64, y = CASTLE_Y;
    const width = 4.52, depth = 7.25, wallHeight = 5.2;
    const top = y + wallHeight;
    mesh.box(x, y, z, width, wallHeight, depth, DARK_STONE, STONE);
    const w = width * .54, d = depth * .53, rise = 2.65;
    const ridgeA = [x, top + rise, z - d], ridgeB = [x, top + rise, z + d];
    mesh.quad([x - w, top, z - d], [x - w, top, z + d], ridgeB, ridgeA, ROOF, SLATE,
      undefined, [[0, 0], [depth, 0], [depth, rise], [0, rise]]);
    mesh.quad([x + w, top, z + d], [x + w, top, z - d], ridgeA, ridgeB, shade(ROOF, .88), SLATE,
      undefined, [[0, 0], [depth, 0], [depth, rise], [0, rise]]);
    mesh.triangle([x - w, top, z + d - .09], [x + w, top, z + d - .09], [x, top + rise, z + d - .09], LIMESTONE, STONE,
      undefined, [[0, top], [width, top], [width / 2, top + rise]]);
    mesh.triangle([x + w, top, z - d + .09], [x - w, top, z - d + .09], [x, top + rise, z - d + .09], LIMESTONE, STONE,
      undefined, [[0, top], [width, top], [width / 2, top + rise]]);
    mesh.box(x, top + rise - .09, z, .16, .2, depth + .62, shade(ROOF, 1.18), SLATE);
    mesh.box(x + 1.14, top + .67, z - 2.01, .6, 1.79, .62, DARK_STONE, STONE);
    mesh.box(x + 1.14, top + 2.38, z - 2.01, .76, .20, .76, TRIM, ROCK);
    for (const sign of [-1, 1]) {
      const face = facade(x + sign * width / 2, z, sign * Math.PI / 2);
      for (const u of [-2.29, 0, 2.29]) windowArch(mesh, face, u, top - 2.22, .51, 1.11, u === 0);
      windowArch(mesh, facade(x, z + sign * depth / 2, sign > 0 ? 0 : Math.PI), 0, top - 2.1, .65, 1.34, true);
    }
  }

  function castle(mesh) {
    const y = CASTLE_Y;
    curtain(mesh, 0, 5.82, 15.1, 0, 3.90);
    curtain(mesh, 0, -5.83, 15.1, 0, 4.24);
    curtain(mesh, 7.42, 0, 11.7, -Math.PI / 2, 4.02);
    curtain(mesh, -7.42, 0, 11.7, Math.PI / 2, 4.02);
    tower(mesh, -7.33, 5.80, 1.69, 6.05);
    tower(mesh, 7.35, 5.77, 1.66, 6.85, 3.26);
    tower(mesh, -7.35, -5.78, 1.74, 7.25, 3.15);
    tower(mesh, 7.29, -5.75, 1.76, 6.2);
    gatehouse(mesh);
    hall(mesh);

    const x = POLE_X, z = POLE_Z;
    const width = 5.13, depth = 4.75, height = 11.75;
    const top = y + height;
    const keepStone = shade(LIMESTONE, 1.04);
    mesh.box(x, y - .4, z, width + .74, 1.08, depth + .62, DARK_STONE, STONE);
    mesh.box(x, y, z, width, height, depth, keepStone, STONE);
    mesh.box(x, y + 4.81, z, width + .15, .20, depth + .15, TRIM, STONE);
    mesh.box(x, top - 1.0, z, width + .36, .24, depth + .36, TRIM, STONE);
    mesh.box(x, top - .72, z, width + .56, .28, depth + .56, keepStone, STONE);
    mesh.box(x, top - .46, z, width + .68, .31, depth + .68, TRIM, STONE);
    for (const sign of [-1, 1]) {
      parapet(mesh, x, z + sign * (depth + .17) / 2, top - .17, width + .64, 0);
      parapet(mesh, x + sign * (width + .22) / 2, z, top - .17, depth + .05, Math.PI / 2);
      const a = facade(x, z + sign * depth / 2, sign > 0 ? 0 : Math.PI);
      const b = facade(x + sign * width / 2, z, sign * Math.PI / 2);
      for (const face of [a, b]) {
        for (const u of [-1.27, 0, 1.27]) windowArch(mesh, face, u, top - 3.05, .52, 1.13, u === 0);
        for (const u of [-.82, .82]) windowArch(mesh, face, u, top - 5.97, .38, .94);
      }
    }
    for (const sideX of [-1, 1]) {
      for (const sideZ of [-1, 1]) {
        const px = x + sideX * (width / 2 - .04);
        const pz = z + sideZ * (depth / 2 - .04);
        for (let step = 0; step < 15; step++) {
          const short = step % 2 === 0;
          mesh.box(px, y + .75 * step, pz, short ? .43 : .51, .33, short ? .51 : .43, shade(TRIM, .91), ROCK);
        }
      }
    }
    tower(mesh, x - 2.32, z - 2.0, .98, height + 1.63, 2.12);
    mesh.round(x, top - .05, z, .077, .042, 5.59, 10, [.53, .43, .239], IRON);
    mesh.round(x, top + 5.49, z, .12, .12, .14, 10, [.72, .57, .27], IRON);
    mesh.round(x, top + 5.63, z, .12, 0, .20, 10, [.79, .63, .30], IRON);
    return top + 5.35;
  }

  function perspective(fov, aspect, near, far, shiftX, shiftY) {
    const f = 1 / Math.tan(fov / 2);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      -shiftX, -shiftY, (far + near) / (near - far), -1,
      0, 0, 2 * far * near / (near - far), 0,
    ];
  }

  function viewFrom(eye, target) {
    const back = normalize(subtract(eye, target));
    const right = normalize(cross([0, 1, 0], back));
    const up = cross(back, right);
    const matrix = [
      right[0], up[0], back[0], 0,
      right[1], up[1], back[1], 0,
      right[2], up[2], back[2], 0,
      -dot(right, eye), -dot(up, eye), -dot(back, eye), 1,
    ];
    return { matrix, right, up, forward: shade(back, -1) };
  }

  function multiply(a, b) {
    const product = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < 4; i++) product[column * 4 + row] += a[i * 4 + row] * b[column * 4 + i];
      }
    }
    return product;
  }

  function orthographic(span, near, far) {
    return [
      1 / span, 0, 0, 0,
      0, 1 / span, 0, 0,
      0, 0, -2 / (far - near), 0,
      0, 0, -(far + near) / (far - near), 1,
    ];
  }

  function frustumPlanes(matrix) {
    const planes = [];
    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [-1, 1]) {
        planes.push([matrix[3] + sign * matrix[axis], matrix[7] + sign * matrix[4 + axis],
          matrix[11] + sign * matrix[8 + axis], matrix[15] + sign * matrix[12 + axis]]);
      }
    }
    return planes;
  }

  function visible(range, planes) {
    return planes.every(([x, y, z, offset]) => {
      const [min, max] = range.bounds;
      return x * (x < 0 ? min[0] : max[0]) + y * (y < 0 ? min[1] : max[1])
        + z * (z < 0 ? min[2] : max[2]) + offset >= 0;
    });
  }

  const mathGLSL = `
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
                 mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1)), u.x), u.y);
    }

    vec3 airlight(vec3 ray, vec3 light) {
      float glow = pow(max(0.0, dot(ray, normalize(vec3(light.x, .04, light.z)))), 6.0);
      return mix(vec3(.54, .64, .59), vec3(.80, .75, .56), glow * .80);
    }
  `;

  const skyVertex = `#version 300 es
    out vec2 screen;
    void main() {
      vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      screen = corner * 2.0 - 1.0;
      gl_Position = vec4(screen, 1.0, 1.0);
    }
  `;

  const skyFragment = `#version 300 es
    precision highp float;
    in vec2 screen;
    uniform vec3 forward, right, up, light;
    uniform vec2 lens, shift;
    uniform float time;
    out vec4 pixel;
    ${mathGLSL}

    void main() {
      vec2 viewport = (screen - shift) * lens;
      vec3 ray = normalize(forward + right * viewport.x + up * viewport.y);
      float h = max(0.0, ray.y);
      vec3 haze = airlight(ray, light);
      vec3 zenith = vec3(.255, .390, .382);
      vec3 color = mix(haze, zenith, 1.0 - exp(-h * 7.5));
      vec3 glowDirection = normalize(vec3(light.x, .12, light.z));
      float glow = pow(max(0.0, dot(ray, glowDirection)), 20.0);
      color += vec3(.16, .112, .055) * glow;
      vec2 cloud = ray.xz / max(.11, ray.y + .17) * vec2(2.25, 3.2) + vec2(.012 * time, 4.0);
      float wisps = noise(cloud * vec2(.9, 2.7)) * .54 + noise(cloud * 2.8) * .30 + noise(cloud * 5.3) * .16;
      float streaks = smoothstep(.46, .81, wisps) * smoothstep(-.018, .13, ray.y);
      vec3 cloudColor = mix(vec3(.74, .77, .67), vec3(.93, .84, .61), glow);
      color = mix(color, cloudColor, streaks * .68);
      color += (hash21(gl_FragCoord.xy) - .5) * .007;
      pixel = vec4(color, 1);
    }
  `;

  const sceneryVertex = `#version 300 es
    layout(location = 0) in vec3 position;
    layout(location = 1) in vec3 normal;
    layout(location = 2) in vec3 color;
    layout(location = 3) in vec2 uv;
    layout(location = 4) in float material;
    uniform mat4 camera, lightCamera;
    out vec3 world, surfaceNormal, pigment;
    out vec2 local;
    out vec4 shadow;
    flat out int kind;

    void main() {
      world = position;
      surfaceNormal = normal;
      pigment = color;
      local = uv;
      kind = int(material);
      shadow = lightCamera * vec4(position, 1.0);
      gl_Position = camera * vec4(position, 1.0);
    }
  `;

  const sceneryFragment = `#version 300 es
    precision highp float;
    in vec3 world, surfaceNormal, pigment;
    in vec2 local;
    in vec4 shadow;
    flat in int kind;
    uniform vec3 eye, light;
    uniform highp sampler2DShadow depthMap;
    uniform float shadowTexel;
    out vec4 pixel;
    ${mathGLSL}

    float sunlight(vec3 normal) {
      vec3 p = shadow.xyz / shadow.w * .5 + .5;
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
      float slope = 1.0 - max(0.0, dot(normal, light));
      float depth = p.z - (.00056 + .00110 * slope);
      float spread = shadowTexel * 1.35;
      float visibility = texture(depthMap, vec3(p.xy, depth)) * .36;
      visibility += texture(depthMap, vec3(p.xy + vec2(spread, 0), depth)) * .16;
      visibility += texture(depthMap, vec3(p.xy - vec2(spread, 0), depth)) * .16;
      visibility += texture(depthMap, vec3(p.xy + vec2(0, spread), depth)) * .16;
      visibility += texture(depthMap, vec3(p.xy - vec2(0, spread), depth)) * .16;
      return visibility;
    }

    void main() {
      vec3 normal = normalize(surfaceNormal);
      vec3 color = pigment;
      vec2 ground = world.xz;
      float grain = noise(ground * 9.0 + world.y * vec2(5.6, 3.3));
      float direct = max(dot(normal, light), 0.0);
      float emission = 0.0;

      if (kind == 0) {
        vec2 warped = local + (noise(local * 15.5) - .5) * .037;
        float course = floor(warped.y / .42);
        float height = fract(warped.y / .42);
        float stoneX = warped.x / .86 + mod(course, 2.0) * .50;
        float seam = fract(stoneX);
        float stone = hash21(vec2(floor(stoneX), course + 34.0));
        float edge = min(min(seam, 1.0 - seam) * 1.45, min(height, 1.0 - height));
        float mortar = smoothstep(.008, .058, edge);
        color *= mix(.67, .94 + stone * .16, mortar);
        color *= .93 + noise(local * 7.0) * .13 + grain * .08;
        color *= mix(.75, 1.0, smoothstep(12.7, 15.8, world.y));
        color = mix(color, color * vec3(.73, .82, .58), (1.0 - smoothstep(13.0, 16.4, world.y)) * noise(ground * 1.77) * .48);
      } else if (kind == 1) {
        float moss = noise(ground * .77) * .37 + grain * .63;
        color *= .72 + moss * .52;
        float strata = noise(vec2(noise(ground * .40) * 1.6 + world.x * .18, world.y * 3.4 + world.z * .22));
        color *= mix(1.0, .80 + strata * .37, 1.0 - smoothstep(.48, .92, normal.y));
        float t = world.z - 6.5;
        float trail = sin(t * .33) * 1.75 + .095 * t + 1.65 * sin(max(t - 6.0, 0.0) * .16);
        float width = mix(1.15, .58, smoothstep(7.0, 42.0, world.z));
        float path = 1.0 - smoothstep(width - .26, width + .44, abs(world.x - trail) + (moss - .5) * .65);
        path *= smoothstep(6.65, 7.45, world.z) * (1.0 - smoothstep(40.0, 46.0, world.z));
        color = mix(color, mix(vec3(.32, .276, .179), vec3(.51, .43, .275), moss), path * .86);
      } else if (kind == 2) {
        color *= .88 + .24 * grain;
        direct = mix(direct, .30 + .54 * direct, .36);
      } else if (kind == 3) {
        vec2 tile = vec2(local.x / .35, local.y / .29);
        tile.x += mod(floor(tile.y), 2.0) * .5;
        float edge = min(fract(tile.x), fract(tile.y) * 1.7);
        color *= mix(.65, .89 + .23 * hash21(floor(tile)), smoothstep(.0, .093, edge));
        color *= .91 + grain * .19;
      } else if (kind == 4) {
        vec2 plank = vec2(local.x / .22, local.y);
        float seam = smoothstep(.02, .14, fract(plank.x));
        float fibers = noise(vec2(local.x * 63.0, local.y * 2.8));
        color *= mix(.38, .86 + .23 * hash21(vec2(floor(plank.x), 15)), seam) * (.73 + fibers * .40);
      } else if (kind == 6) {
        emission = .59 + .27 * grain;
      } else if (kind == 7) {
        vec2 p = (local - vec2(.36, .49)) * vec2(2.0, 1.0);
        float d = abs(p.x) + abs(p.y) * .79;
        float embroidery = 1.0 - smoothstep(.143, .162, abs(d - .20) + .15);
        float center = 1.0 - smoothstep(.086, .112, d);
        float petal = (1.0 - smoothstep(.038, .059, min(abs(p.x), abs(p.y))))
          * (1.0 - smoothstep(.16, .255, length(p)));
        float edge = min(local.y, 1.0 - local.y);
        float thread = (1.0 - smoothstep(.012, .022, abs(edge - .074))) * smoothstep(.015, .044, local.x);
        float hem = max(thread, max(embroidery, max(center, petal)) * .91);
        color = mix(color, vec3(.84, .66, .34), hem);
        color *= .84 + noise(local * vec2(430, 165)) * .26;
        direct = .28 + abs(dot(normal, light)) * .62;
      } else if (kind == 8) {
        color *= .88 + grain * .22 + noise(vec2(world.x * 5.2, world.y * 11.0 + world.z * 4.2)) * .11;
      }

      float visibility = direct == 0.0 || kind == 7 || kind == 9 ? 1.0 : sunlight(normal);
      float skylight = .73 + .27 * max(0.0, normal.y);
      vec3 ambient = vec3(.61, .65, .64) * skylight;
      vec3 warm = vec3(.66, .59, .43) * direct * mix(.17, 1.0, visibility);
      vec3 reflected = vec3(.11, .125, .068) * (.40 + .6 * max(0.0, -normal.y));
      vec3 lit = color * (ambient + warm + reflected);
      lit = mix(lit, color * 1.54, emission);
      float distanceToCamera = length(eye - world);
      vec3 ray = (world - eye) / distanceToCamera;
      float fog = 1.0 - exp(-pow(max(distanceToCamera - 34.0, 0.0) * .0067, 1.44));
      fog += .11 * smoothstep(36.0, 101.0, distanceToCamera) * (1.0 - smoothstep(0.0, 18.0, world.y));
      vec3 mist = airlight(ray, light) * vec3(.92, .96, .95);
      color = mix(lit, mist, min(fog, .97));
      pixel = vec4(color, 1);
    }
  `;

  const depthVertex = `#version 300 es
    layout(location = 0) in vec3 position;
    uniform mat4 lightCamera;
    void main() {
      gl_Position = lightCamera * vec4(position, 1.0);
    }
  `;
  const depthFragment = `#version 300 es
    precision mediump float;
    void main() {}
  `;

  function makeProgram(vertexCode, fragmentCode, names) {
    function compile(type, code) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    const vertex = compile(gl.VERTEX_SHADER, vertexCode);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentCode);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return { program, uniform: Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) };
  }

  function makeBuffer(data, usage) {
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    const fields = [[3, 0], [3, 3], [3, 6], [2, 9], [1, 11]];
    fields.forEach(([size, offset], i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, 48, 4 * offset);
    });
    return { vao, buffer, count: data.length / 12 };
  }

  function combineScenery(meshes) {
    const data = new Float32Array(meshes.reduce((size, mesh) => size + mesh.data.length, 0));
    let offset = 0;
    const ranges = meshes.map(mesh => {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < mesh.data.length; i += 12) {
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], mesh.data[i + axis]);
          max[axis] = Math.max(max[axis], mesh.data[i + axis]);
        }
      }
      data.set(mesh.data, offset);
      const range = { start: offset / 12, count: mesh.data.length / 12, bounds: [min, max] };
      offset += mesh.data.length;
      mesh.data.length = 0;
      return range;
    });
    return { ...makeBuffer(data, gl.STATIC_DRAW), ranges };
  }

  function bakeShadows(mesh, depth, lightCamera) {
    const size = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const map = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, map);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, map, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete shadow framebuffer");

    gl.viewport(0, 0, size, size);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(depth.program);
    gl.uniformMatrix4fv(depth.uniform.lightCamera, false, lightCamera);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    return { map, texel: 1 / size };
  }

  const bannerColor = [.60, .145, .11];

  function animateBanner(mesh, anchor, time) {
    const columns = 24, rows = 9;
    const knots = [];
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      for (let i = 0; i <= columns; i++) {
        const u = i / columns;
        const ripple = Math.sin(u * 10.2 - time * 4.4 + v * 1.7) * .53
          + Math.sin(u * 20.1 - time * 6.7 - v * 3.1) * .16;
        const drape = Math.sin(u * 11.2 - time * 4.4 + v) * u * .24;
        const tail = 1 - .19 * (1 - Math.abs(v * 2 - 1));
        const across = u * 5.6 * tail;
        knots.push([POLE_X + .05 + across, anchor - v * 2.35 - u * .32 + drape,
          POLE_Z + across * .19 + ripple * u ** .83]);
      }
    }
    const stride = columns + 1;
    const normals = knots.map((point, index) => {
      const x = index % stride;
      const left = x === 0 ? point : knots[index - 1];
      const right = x === columns ? point : knots[index + 1];
      const top = index < stride ? point : knots[index - stride];
      const bottom = index >= rows * stride ? point : knots[index + stride];
      return normalize(cross(subtract(right, left), subtract(top, bottom)));
    });
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        const a = j * stride + i, b = a + 1, d = a + stride, c = d + 1;
        const u = i / columns, v = j / rows, nextU = (i + 1) / columns, nextV = (j + 1) / rows;
        mesh.triangle(knots[a], knots[b], knots[c], bannerColor, BANNER, [normals[a], normals[b], normals[c]],
          [[u, v], [nextU, v], [nextU, nextV]]);
        mesh.triangle(knots[a], knots[c], knots[d], bannerColor, BANNER, [normals[a], normals[c], normals[d]],
          [[u, v], [nextU, nextV], [u, nextV]]);
      }
    }
  }

  function animateBirds(mesh, time) {
    for (let i = 0; i < 7; i++) {
      const angle = .43 + time * .16 + i * .036;
      const radius = 37 + Math.sin(i * 6.21) * 6.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 11;
      const y = 29.8 + Math.sin(i * 7.24) * 2.6 + Math.sin(angle * 2 + i) * .86;
      const sideways = [Math.cos(angle), 0, Math.sin(angle)];
      const forwards = [-sideways[2], 0, sideways[0]];
      const lift = Math.sin(time * 8 + i * 2.73) * .17;
      const p = (width, depth, v) => [x + sideways[0] * width + forwards[0] * depth, y + v,
        z + sideways[2] * width + forwards[2] * depth];
      const back = p(0, -.20, -.015);
      const torso = p(0, .13, 0);
      const ink = [.13, .16, .133];
      for (const sign of [-1, 1]) {
        const bend = p(sign * .24, .045, lift * .37);
        const tip = p(sign * .57, -.16, lift);
        mesh.triangle(torso, bend, back, ink, BIRD);
        mesh.triangle(bend, tip, back, ink, BIRD);
      }
    }
  }

  function start() {
    const sky = makeProgram(skyVertex, skyFragment, ["forward", "right", "up", "light", "lens", "shift", "time"]);
    const scenery = makeProgram(sceneryVertex, sceneryFragment, ["camera", "lightCamera", "eye", "light", "depthMap", "shadowTexel"]);
    const depth = makeProgram(depthVertex, depthFragment, ["lightCamera"]);

    const land = new Mesh();
    const keep = new Mesh();
    terrain(land);
    crags(land);
    const poleTop = castle(keep);
    const staticMesh = combineScenery([keep, land, ...forest()]);

    const moving = new Mesh();
    animateBanner(moving, poleTop, 0);
    animateBirds(moving, 0);
    const dynamicData = new Float32Array(moving.data);
    const dynamicMesh = makeBuffer(dynamicData, gl.DYNAMIC_DRAW);
    const emptyVao = gl.createVertexArray();
    const lightEye = [LIGHT[0] * 95, LIGHT[1] * 95 + 9, LIGHT[2] * 95];
    const lightCamera = multiply(orthographic(51, 2, 184), viewFrom(lightEye, [0, 9, 0]).matrix);
    const shadow = bakeShadows(staticMesh, depth, lightCamera);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadow.map);

    const percent = document.getElementById("orbit-percent");
    const progress = document.getElementById("orbit-progress");
    const heading = document.getElementById("heading");
    const needle = document.getElementById("needle");
    let startedAt;
    let shownDegrees = -1;
    let shownPercent = -1;
    let previousFrame;
    let drawnAt;
    let frameInterval = 16.7;
    let renderScale = 1;
    let scaleChangedAt = 0;

    function draw(now) {
      if (gl.isContextLost()) return;
      if (previousFrame) {
        const ready = gl.clientWaitSync(previousFrame, 0, 0);
        if (ready === gl.TIMEOUT_EXPIRED) {
          animationFrame = requestAnimationFrame(draw);
          return;
        }
        gl.deleteSync(previousFrame);
      }

      // Keep frames from queueing up and lower the pixel load on slower renderers.
      const measuredAt = performance.now();
      if (drawnAt !== undefined && measuredAt - drawnAt < 800) {
        frameInterval = mix(frameInterval, measuredAt - drawnAt, .14);
        if (measuredAt - scaleChangedAt > 1150) {
          const nextScale = frameInterval > 42 ? Math.max(.64, renderScale - .12)
            : frameInterval < 23 ? Math.min(1, renderScale + .06) : renderScale;
          if (nextScale !== renderScale) {
            renderScale = nextScale;
            scaleChangedAt = measuredAt;
          }
        }
      }
      drawnAt = measuredAt;

      startedAt ??= now;
      const time = (now - startedAt) / 1000;
      const cycle = time / PERIOD % 1;
      const angle = START_ANGLE + cycle * TAU;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5, 1824 / canvas.clientWidth) * renderScale;
      const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const aspect = width / height;
      const desktop = smoothstep(.9, 1.58, aspect);
      const radius = mix(57, 51.5, desktop);
      const eye = [Math.sin(angle) * radius, mix(29.6, 28.7, desktop) + Math.sin(cycle * TAU) * 1.6,
        Math.cos(angle) * radius];
      const view = viewFrom(eye, [0, 17.1, 0]);
      const tangent = Math.max(Math.tan(mix(.84, .70, desktop) / 2), .235 / aspect);
      const fov = 2 * Math.atan(tangent);
      const shiftX = .27 * desktop;
      const shiftY = mix(.25, .010, desktop);
      const projection = perspective(fov, aspect, .15, 480, shiftX, shiftY);
      const camera = multiply(projection, view.matrix);

      gl.viewport(0, 0, width, height);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(scenery.program);
      gl.uniformMatrix4fv(scenery.uniform.camera, false, camera);
      gl.uniformMatrix4fv(scenery.uniform.lightCamera, false, lightCamera);
      gl.uniform3fv(scenery.uniform.eye, eye);
      gl.uniform3fv(scenery.uniform.light, LIGHT);
      gl.uniform1i(scenery.uniform.depthMap, 0);
      gl.uniform1f(scenery.uniform.shadowTexel, shadow.texel);
      gl.bindVertexArray(staticMesh.vao);
      const planes = frustumPlanes(camera);
      for (const range of staticMesh.ranges) {
        if (visible(range, planes)) gl.drawArrays(gl.TRIANGLES, range.start, range.count);
      }

      moving.data.length = 0;
      animateBanner(moving, poleTop, time);
      animateBirds(moving, time);
      dynamicData.set(moving.data);
      gl.bindVertexArray(dynamicMesh.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, dynamicMesh.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dynamicData);
      gl.drawArrays(gl.TRIANGLES, 0, dynamicMesh.count);

      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.useProgram(sky.program);
      gl.uniform3fv(sky.uniform.forward, view.forward);
      gl.uniform3fv(sky.uniform.right, view.right);
      gl.uniform3fv(sky.uniform.up, view.up);
      gl.uniform3fv(sky.uniform.light, LIGHT);
      gl.uniform2f(sky.uniform.lens, tangent * aspect, tangent);
      gl.uniform2f(sky.uniform.shift, shiftX, shiftY);
      gl.uniform1f(sky.uniform.time, time);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
      previousFrame = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();

      const degrees = Math.floor(angle * 180 / Math.PI) % 360;
      const percentage = Math.floor(cycle * 100);
      if (degrees !== shownDegrees) {
        heading.textContent = String(degrees).padStart(3, "0") + "°";
        shownDegrees = degrees;
      }
      if (percentage !== shownPercent) {
        percent.textContent = String(percentage).padStart(2, "0") + "%";
        shownPercent = percentage;
      }
      needle.style.transform = `rotate(${angle}rad)`;
      progress.style.transform = `scaleX(${cycle})`;
      animationFrame = requestAnimationFrame(draw);
    }

    animationFrame = requestAnimationFrame(draw);
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    cancelAnimationFrame(animationFrame);
    showError();
  });

  canvas.addEventListener("webglcontextrestored", () => {
    seed = 614205;
    launch();
  });

  function launch() {
    try {
      start();
      canvas.closest(".atlas").classList.remove("unavailable");
      error.hidden = true;
    } catch (failure) {
      console.error(failure);
      showError();
    }
  }

  launch();
})();
