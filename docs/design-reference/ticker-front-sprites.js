
class Component extends DCLogic {
  MAP = {
    normal: { up: '#FF4D5A', 'up-deep': '#B32330', down: '#2E86FF', 'down-deep': '#1A4E9E' },
    cb:     { up: '#FFB000', 'up-deep': '#B37A00', down: '#0072B2', 'down-deep': '#004E7A' }
  };

  applyTint() {
    const c = this.props.colorblindMode === true ? this.MAP.cb : this.MAP.normal;
    document.querySelectorAll('[data-tint]').forEach(el => {
      const k = el.dataset.tint;
      if (k === 'up' || k === 'up-fill') el.style.background = c.up;
      else if (k === 'up-deep') el.style.background = c['up-deep'];
      else if (k === 'down' || k === 'down-fill') el.style.background = c.down;
      else if (k === 'down-deep') el.style.background = c['down-deep'];
      else if (k === 'up-text') el.style.color = c.up;
      else if (k === 'down-text') el.style.color = c.down;
      else if (k === 'up-hex') el.textContent = c.up + ' · ' + c['up-deep'] + ' (음영)';
      else if (k === 'down-hex') el.textContent = c.down + ' · ' + c['down-deep'] + ' (음영)';
    });
  }

  PAL = { '.': null, '0': '#05070C', '1': '#070A12', '2': '#0F1524', '3': '#1A2236',
          m: '#7C89A3', w: '#E8ECF4', r: '#FF4D5A', d: '#B32330',
          b: '#2E86FF', n: '#1A4E9E', g: '#FFC53D', p: '#9B6BFF' };

  mk(w, h) {
    const g = Array.from({ length: h }, () => new Array(w).fill('.'));
    const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    const api = {
      w: w, h: h, g: g,
      px(x, y, c) { x = Math.round(x); y = Math.round(y); if (inb(x, y)) g[y][x] = c; return api; },
      rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) api.px(x + i, y + j, c); return api; },
      disc(cx, cy, r, c) { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.45) api.px(cx + i, cy + j, c); return api; },
      poly(pts, c) {
        const ys = pts.map(p => p[1]);
        const y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
        for (let y = y0; y <= y1; y++) {
          const xs = [];
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i], bb = pts[(i + 1) % pts.length];
            if ((a[1] <= y && bb[1] > y) || (bb[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (bb[1] - a[1]) * (bb[0] - a[0]));
          }
          xs.sort((u, v) => u - v);
          for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) api.px(x, y, c);
        }
        return api;
      },
      line(x0, y0, x1, y1, c) {
        const st = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
        for (let i = 0; i <= st; i++) api.px(x0 + (x1 - x0) * i / st, y0 + (y1 - y0) * i / st, c);
        return api;
      },
      outline(c) {
        const cp = g.map(r => r.slice());
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (cp[y][x] !== '.') continue;
          if (nb.some(dd => inb(x + dd[0], y + dd[1]) && cp[y + dd[1]][x + dd[0]] !== '.')) g[y][x] = c;
        }
        return api;
      },
      rim(c) {
        const cp = g.map(r => r.slice());
        for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
          const v = cp[y][x];
          if (v === '.' || v === '0' || v === c) continue;
          const up = cp[y - 1][x];
          if (up === '.' || up === '0') g[y][x] = c;
        }
        return api;
      }
    };
    return api;
  }

  allyRookie() {
    const c = this.mk(26, 34);
    c.rect(8, 26, 4, 6, '2').rect(14, 27, 4, 5, '2');
    c.rect(6, 32, 7, 2, '3').rect(13, 32, 7, 2, '3');
    c.rect(7, 15, 12, 12, '3').rect(7, 15, 12, 3, '2');
    c.rect(10, 19, 4, 6, 'w').rect(7, 21, 12, 2, 'r');
    c.rect(18, 18, 6, 3, '3').rect(23, 14, 3, 9, 'm');
    c.disc(13, 9, 6, 'm').rect(7, 9, 13, 3, 'm').rect(12, 11, 8, 3, '2');
    return c.outline('0').rim('w').g;
  }

  allyScout() {
    const c = this.mk(26, 34);
    c.disc(5, 18, 4, 'm').disc(5, 18, 2, '2');
    c.line(11, 12, 21, 3, 'm').px(21, 3, 'r').px(22, 2, 'm');
    c.rect(9, 25, 4, 7, '2').rect(15, 26, 4, 6, '2');
    c.rect(8, 32, 6, 2, '3').rect(14, 32, 6, 2, '3');
    c.rect(8, 13, 11, 13, '3').rect(8, 13, 11, 3, '2');
    c.rect(11, 17, 4, 7, 'w').rect(8, 19, 11, 2, 'r');
    c.line(8, 16, 18, 24, 'w').line(8, 24, 18, 16, 'w');
    c.disc(13, 8, 5, '3').rect(15, 6, 4, 3, 'r');
    c.rect(17, 16, 4, 3, '3').rect(20, 15, 5, 3, 'm').rect(24, 14, 2, 2, 'r');
    return c.outline('0').rim('w').g;
  }

  allyAnchor() {
    const c = this.mk(28, 34);
    c.rect(6, 25, 5, 7, '2').rect(15, 25, 5, 7, '2');
    c.rect(4, 32, 8, 2, '3').rect(14, 32, 8, 2, '3');
    c.rect(6, 12, 13, 14, '3').rect(6, 12, 13, 3, '2');
    c.disc(6, 14, 4, '3').disc(19, 14, 4, '3');
    c.rect(9, 16, 5, 7, 'w').rect(6, 18, 13, 2, 'r');
    c.disc(12, 7, 5, '3').rect(14, 5, 4, 3, 'r');
    c.rect(21, 10, 6, 19, 'm').rect(22, 11, 4, 17, '3');
    c.disc(24, 19, 2, 'm').rect(21, 14, 6, 1, 'm').rect(21, 24, 6, 1, 'm');
    return c.outline('0').rim('w').g;
  }

  enemyRusher() {
    const c = this.mk(26, 34);
    c.poly([[18, 12], [23, 17], [20, 32], [7, 32], [5, 18], [10, 12]], '2');
    c.poly([[18, 12], [23, 17], [21, 22], [17, 16]], 'n');
    c.poly([[14, 3], [22, 10], [20, 14], [12, 15], [8, 9]], '3');
    c.rect(13, 9, 5, 4, '1');
    c.line(12, 15, 22, 13, 'b');
    c.line(6, 6, 3, 28, 'm').poly([[2, 26], [6, 24], [3, 33]], 'b');
    c.poly([[7, 32], [12, 30], [11, 34], [6, 34]], '2');
    return c.outline('0').rim('w').g;
  }

  enemyBlocker() {
    const c = this.mk(28, 34);
    c.rect(8, 26, 5, 6, '2').rect(16, 26, 5, 6, '2');
    c.rect(6, 32, 8, 2, '3').rect(15, 32, 8, 2, '3');
    c.poly([[7, 13], [21, 13], [23, 26], [5, 26]], '3');
    c.poly([[7, 13], [21, 13], [22, 18], [6, 18]], 'n');
    c.poly([[5, 13], [10, 10], [9, 17], [3, 16]], '3');
    c.poly([[18, 10], [24, 13], [24, 18], [18, 16]], '3');
    c.rect(10, 5, 9, 7, '3').rect(11, 7, 7, 3, '1');
    c.rect(11, 19, 8, 2, 'b');
    c.rect(1, 14, 5, 15, 'm').rect(2, 15, 3, 13, '2').line(2, 20, 4, 20, 'b');
    c.rect(23, 8, 3, 10, 'm').rect(22, 6, 5, 4, 'm');
    return c.outline('0').rim('w').g;
  }

  enemyTank() {
    const c = this.mk(30, 34);
    c.rect(9, 25, 5, 7, '2').rect(18, 25, 5, 7, '2');
    c.rect(7, 32, 9, 2, '3').rect(17, 32, 9, 2, '3');
    c.poly([[7, 11], [23, 11], [26, 26], [4, 26]], '3');
    c.poly([[7, 11], [23, 11], [24, 17], [6, 17]], 'n');
    c.poly([[13, 18], [19, 18], [16, 24]], 'b');
    c.rect(11, 4, 9, 8, '3').rect(12, 6, 7, 3, '1');
    c.poly([[4, 13], [9, 12], [8, 20], [2, 19]], '3');
    c.rect(23, 13, 6, 4, 'm').poly([[27, 15], [30, 22], [24, 24], [24, 17]], 'm');
    c.line(24, 22, 30, 21, 'n');
    return c.outline('0').rim('w').g;
  }

  enemyKite() {
    const c = this.mk(36, 22);
    c.poly([[16, 1], [27, 10], [16, 19], [5, 10]], '2');
    c.line(16, 1, 16, 19, 'm').line(5, 10, 27, 10, 'm');
    c.poly([[16, 4], [23, 10], [16, 16], [9, 10]], '3');
    c.rect(14, 8, 5, 4, 'w');
    for (let i = 0; i < 4; i++) c.line(16 - i * 4, 19 + 0, 12 - i * 4, 15, i % 2 ? 'b' : 'n');
    c.line(5, 10, 0, 8, 'b');
    return c.outline('0').rim('w').g;
  }

  enemySiren() {
    const c = this.mk(36, 24);
    c.rect(14, 6, 8, 7, '3').rect(14, 6, 8, 2, 'n');
    [8, 18, 28].forEach((x, i) => {
      c.poly([[x - 4, 14 + i % 2], [x + 4, 14 + i % 2], [x + 2, 21 + i % 2], [x - 2, 21 + i % 2]], '2');
      c.rect(x - 1, 11 + i % 2, 3, 4, 'm');
      c.line(x - 4, 21 + i % 2, x + 4, 21 + i % 2, 'b');
    });
    c.rect(12, 3, 12, 2, 'm').rect(17, 1, 3, 3, 'n');
    return c.outline('0').rim('w').g;
  }

  towerBasic() {
    const c = this.mk(32, 22);
    c.rect(3, 18, 20, 3, '3').rect(3, 18, 20, 1, 'm');
    c.poly([[6, 8], [18, 8], [20, 18], [4, 18]], '3');
    c.rect(7, 10, 11, 3, 'r').rect(7, 14, 11, 2, '2');
    c.rect(18, 10, 12, 4, 'm').rect(29, 9, 3, 6, '3');
    c.rect(2, 20, 4, 2, 'm').rect(20, 20, 4, 2, 'm');
    c.rect(9, 5, 6, 4, '3').rect(10, 6, 4, 2, 'r');
    return c.outline('0').rim('w').g;
  }

  towerAA() {
    const c = this.mk(32, 26);
    c.rect(5, 21, 18, 4, '3').rect(5, 21, 18, 1, 'm');
    c.rect(8, 12, 12, 10, '3').rect(9, 14, 10, 2, 'r').rect(9, 18, 10, 2, '2');
    [9, 13, 17].forEach(x => { c.rect(x, 2, 3, 11, 'm'); c.rect(x, 2, 3, 2, '2'); });
    c.disc(26, 9, 5, 'm').disc(26, 9, 3, '3').rect(23, 13, 3, 8, '3');
    c.rect(4, 24, 5, 2, 'm').rect(19, 24, 5, 2, 'm');
    return c.outline('0').rim('w').g;
  }

  towerSplash() {
    const c = this.mk(34, 22);
    c.rect(3, 18, 24, 3, '3').rect(3, 18, 24, 1, 'm');
    c.poly([[6, 10], [22, 10], [24, 18], [4, 18]], '3');
    c.rect(7, 12, 14, 3, 'r');
    c.poly([[20, 6], [32, 2], [33, 10], [20, 13]], 'm');
    c.poly([[22, 7], [31, 4], [31, 9], [22, 11]], '2');
    c.disc(9, 14, 3, 'm').disc(9, 14, 1, '2');
    c.rect(2, 20, 5, 2, 'm').rect(23, 20, 5, 2, 'm');
    return c.outline('0').rim('w').g;
  }

  baseAlly() {
    const c = this.mk(76, 40);
    const st = [[3, 30, 12], [20, 22, 13], [38, 12, 14], [58, 3, 15]];
    st.forEach((s, i) => {
      const x = s[0], top = s[1], bw = s[2];
      c.rect(x, top, bw, 37 - top, '3');
      c.rect(x, top, bw, 2, '2');
      for (let y = top + 3; y < 36; y += 4)
        for (let px = x + 2; px < x + bw - 1; px += 3) c.px(px, y, (px + y) % 2 ? 'w' : 'm');
      c.rect(x, 34, bw, 3, '2');
      c.rect(x + 1, 33, bw - 2, 1, 'r');
      if (i === 3) { c.rect(x + 6, top - 3, 2, 3, 'm'); c.rect(x + 4, top - 5, 6, 2, 'r'); }
      if (i >= 2) c.rect(x + 2, top - 2, 1, 2, 'm');
    });
    c.rect(0, 37, 76, 3, '2');
    return c.outline('0').rim('w').g;
  }

  baseEnemy() {
    const c = this.mk(30, 44);
    c.poly([[3, 14], [9, 8], [14, 13], [20, 6], [27, 16], [27, 40], [3, 40]], '3');
    c.poly([[3, 14], [9, 8], [14, 13], [20, 6], [27, 16], [27, 22], [3, 22]], '2');
    c.rect(10, 28, 12, 12, 'n');
    c.disc(16, 34, 4, '3').disc(16, 34, 2, 'b');
    for (let y = 18; y < 28; y += 4) for (let x = 5; x < 26; x += 5) c.rect(x, y, 2, 2, '1');
    c.line(4, 24, 26, 24, 'b');
    c.poly([[13, 12], [19, 12], [16, 20]], 'b');
    c.rect(0, 40, 30, 4, '2');
    return c.outline('0').rim('w').g;
  }

  boss() {
    const c = this.mk(34, 46);
    c.rect(10, 34, 6, 9, '2').rect(19, 34, 6, 9, '2');
    c.rect(8, 43, 9, 3, '3').rect(18, 43, 9, 3, '3');
    c.poly([[7, 14], [26, 14], [30, 40], [4, 40]], '3');
    c.poly([[7, 14], [26, 14], [28, 24], [5, 24]], '2');
    c.poly([[10, 6], [24, 6], [26, 14], [8, 14]], '3');
    c.rect(11, 9, 12, 3, '1');
    c.poly([[8, 10], [3, 4], [10, 3]], 'n').poly([[25, 10], [31, 4], [24, 3]], 'n');
    c.poly([[15, 26], [21, 26], [18, 34]], 'b');
    c.poly([[28, 18], [34, 22], [30, 40], [26, 34]], 'm');
    c.line(27, 24, 33, 26, 'b').line(27, 30, 31, 33, 'b');
    c.rect(1, 20, 6, 7, 'm').rect(2, 21, 4, 5, 'n');
    return c.outline('0').rim('w').g;
  }

  bgFar(region) {
    const c = this.mk(104, 30);
    c.rect(0, 0, 104, 30, '1');
    const put = (x, top, bw, col, winCol) => {
      c.rect(x, top, bw, 26 - top, col);
      if (winCol) for (let y = top + 2; y < 26; y += 3) for (let px = x + 1; px < x + bw - 1; px += 2) if ((px * 7 + y * 3) % 5 < 2) c.px(px, y, winCol);
    };
    if (region === 1) {
      for (let x = 0; x < 104; x += 2) { c.px(x, 19, '2'); c.px(x + 1, 20, '2'); }
      c.rect(0, 21, 104, 2, '2');
      [[2, 8, 7], [10, 4, 6], [17, 12, 5], [23, 2, 8], [32, 9, 6], [39, 13, 7], [47, 5, 7], [55, 11, 6], [62, 6, 9], [72, 12, 6], [79, 9, 7], [87, 4, 8], [96, 11, 6]]
        .forEach((t, i) => put(t[0], t[1], t[2], i % 2 ? '2' : '3', i % 3 === 0 ? 'm' : null));
      c.rect(0, 26, 104, 4, '2');
      for (let i = 0; i < 104; i += 3) c.px(i, 27, '3');
      for (let i = 6; i < 104; i += 16) c.rect(i, 23, 1, 3, '3');
    } else if (region === 2) {
      [[3, 16, 15], [20, 14, 12], [34, 17, 17], [53, 13, 14], [69, 18, 13], [84, 15, 16]]
        .forEach((t, i) => put(t[0], t[1], t[2], i % 2 ? '2' : '3', 'm'));
      [12, 44, 76].forEach(x => { c.rect(x, 6, 1, 8, '3'); c.px(x, 5, 'b'); });
      c.rect(0, 26, 104, 4, '2');
    } else {
      [[6, 9], [26, 6], [48, 10], [70, 7], [92, 11]].forEach((t, i) => {
        c.rect(t[0], t[1], 3, 26 - t[1], i % 2 ? '2' : '3');
        c.rect(t[0] - 1, t[1], 5, 1, '3');
        for (let k = 0; k < 6; k++) c.px(t[0] + 1 + (k % 2), t[1] - 2 - k, '2');
      });
      [[16, 11], [40, 8], [62, 12], [84, 9]].forEach(t => {
        c.rect(t[0], t[1], 2, 26 - t[1], '3');
        c.rect(t[0] - 7, t[1], 16, 1, '3');
        c.rect(t[0] + 6, t[1] + 1, 1, 6, '2');
        c.rect(t[0] + 5, t[1] + 7, 3, 2, '3');
      });
      for (let x = 0; x < 104; x += 2) c.px(x, 22, '2');
      c.rect(0, 26, 104, 4, '2');
    }
    return c.g;
  }

  bgMid(region) {
    const c = this.mk(104, 30);
    c.rect(0, 0, 104, 30, '1');
    c.rect(0, 25, 104, 5, '3');
    if (region === 1) {
      [[2, 22], [26, 22], [50, 22], [74, 22]].forEach(t => {
        const x = t[0];
        c.rect(x, 6, 20, 19, '2');
        c.rect(x, 6, 20, 2, '3');
        for (let px = x + 2; px < x + 19; px += 4) c.rect(px, 9, 2, 14, '3');
        c.rect(x + 3, 11, 14, 6, '1').rect(x + 3, 11, 14, 1, 'm');
        c.rect(x + 1, 23, 18, 2, '3');
      });
      for (let i = 0; i < 104; i += 13) { c.rect(i, 14, 1, 11, '3'); c.rect(i - 1, 13, 3, 1, 'm'); }
    } else if (region === 2) {
      [[1, 10], [27, 8], [55, 11], [80, 9]].forEach(t => {
        const x = t[0], top = t[1];
        c.rect(x, top, 22, 25 - top, '2').rect(x, top, 22, 2, '3');
        for (let y = top + 3; y < 24; y += 4) c.rect(x + 2, y, 18, 2, '1');
        c.rect(x + 4, top - 2, 6, 2, '3');
      });
      for (let i = 4; i < 104; i += 9) c.rect(i, 22, 3, 3, '2');
    } else {
      c.rect(0, 12, 104, 3, '2').rect(0, 18, 104, 3, '2');
      for (let i = 0; i < 104; i += 12) { c.rect(i, 10, 2, 15, '3'); c.rect(i - 1, 15, 4, 2, 'm'); }
      [14, 52, 88].forEach(x => { c.rect(x, 4, 14, 7, '2'); c.rect(x, 4, 14, 1, 'm'); });
      for (let i = 6; i < 104; i += 22) { c.rect(i, 21, 8, 4, '3'); c.rect(i, 21, 8, 1, 'm'); }
    }
    return c.g;
  }

  ground(region, state) {
    const c = this.mk(104, 16);
    c.rect(0, 4, 104, 12, '3');
    c.rect(0, 4, 104, 1, 'm');
    c.rect(0, 5, 104, 1, '2');
    if (region === 1) {
      for (let i = 0; i < 104; i += 8) c.rect(i, 6, 1, 10, '2');
      for (let i = 12; i < 104; i += 34) { c.disc(i, 11, 2, '2'); c.px(i, 11, 'm'); }
      c.rect(0, 14, 104, 2, '2');
    } else if (region === 2) {
      for (let i = 0; i < 104; i += 6) c.rect(i, 8, 3, 1, 'm');
      c.rect(0, 12, 104, 2, '2');
      for (let i = 2; i < 104; i += 5) c.px(i, 13, '3');
    } else {
      for (let i = 0; i < 104; i += 14) c.rect(i, 7, 10, 1, 'm');
      for (let i = 4; i < 104; i += 9) c.rect(i, 10, 2, 2, '2');
      c.rect(0, 13, 104, 3, '2');
    }
    if (state >= 2) {
      for (let i = 5; i < 104; i += 17) { c.line(i, 4, i + 4, 12, '2'); c.px(i + 1, 5, '1'); }
    }
    if (state >= 3) {
      for (let i = 9; i < 104; i += 13) { c.line(i, 4, i - 5, 14, '1'); c.px(i, 5, 'b'); c.px(i - 2, 8, 'n'); }
      c.rect(0, 4, 104, 1, 'n');
    }
    return c.g;
  }

  groundSlot() {
    const c = this.mk(60, 20);
    c.rect(0, 12, 60, 8, '3').rect(0, 12, 60, 1, 'm');
    const box = (x, col, style) => {
      if (style === 'dot') { for (let i = 0; i < 14; i += 2) { c.px(x + i, 6, col); c.px(x + i, 15, col); } for (let j = 6; j < 16; j += 2) { c.px(x, j, col); c.px(x + 13, j, col); } }
      else { c.rect(x, 6, 14, 1, col).rect(x, 15, 14, 1, col).rect(x, 6, 1, 10, col).rect(x + 13, 6, 1, 10, col); }
      if (style === 'bracket') { c.rect(x - 1, 5, 3, 1, col).rect(x + 12, 5, 3, 1, col).rect(x - 1, 16, 3, 1, col).rect(x + 12, 16, 3, 1, col); }
      if (style === 'hatch') for (let i = 0; i < 12; i += 3) c.line(x + i, 15, x + i + 4, 7, col);
    };
    box(4, 'm', 'dot');
    box(24, 'r', 'bracket');
    box(44, 'm', 'hatch');
    return c.g;
  }

  weather(kind) {
    const c = this.mk(80, 44);
    c.rect(0, 0, 80, 44, '1');
    if (kind === 1) {
      for (let i = -10; i < 90; i += 5) c.line(i, 0, i - 7, 30, ((i / 5) | 0) % 3 ? 'n' : 'b');
      for (let i = 4; i < 80; i += 11) c.poly([[i, 6], [i + 3, 10], [i, 16], [i - 3, 10]], 'b');
      for (let x = 0; x < 80; x++) { c.px(x, 0, '0'); c.px(x, 43, '0'); }
      for (let y = 0; y < 44; y++) { c.rect(0, y, 3, 1, '0'); c.rect(77, y, 3, 1, '0'); }
      c.line(2, 12, 40, 26, 'n').line(40, 26, 78, 38, 'n');
    } else if (kind === 2) {
      for (let i = -6; i < 90; i += 5) c.line(i, 44, i + 6, 14, ((i / 5) | 0) % 3 ? 'd' : 'r');
      for (let i = 6; i < 80; i += 9) c.poly([[i, 30 - (i % 7)], [i + 2, 34 - (i % 7)], [i - 2, 34 - (i % 7)]], 'r');
      c.rect(0, 41, 80, 3, 'd');
      c.line(2, 34, 40, 22, 'd').line(40, 22, 78, 8, 'd');
    } else if (kind === 3) {
      c.rect(0, 26, 80, 5, '2').rect(0, 33, 80, 4, '3');
      for (let i = 0; i < 80; i += 3) { c.px(i, 25, '2'); c.px(i + 1, 32, '3'); }
      for (let i = 0; i < 80; i += 6) c.rect(i, 38, 4, 2, '2');
      c.rect(0, 20, 80, 1, '2');
    } else {
      for (let y = 0; y < 44; y += 2) c.rect(0, y, 80, 1, '0');
      c.rect(0, 12, 80, 3, 'm').rect(0, 30, 80, 2, 'm');
      c.rect(0, 15, 80, 1, 'w');
      for (let i = 0; i < 80; i += 7) c.px(i, 31, 'w');
    }
    return c.g;
  }

  fx(kind) {
    const c = this.mk(36, 36);
    c.rect(0, 0, 36, 36, '1');
    if (kind === 1) {
      for (let a = 0; a < 16; a++) {
        const t = a / 16 * Math.PI * 2, len = a % 2 ? 15 : 10;
        c.line(18 + Math.cos(t) * 4, 18 + Math.sin(t) * 4, 18 + Math.cos(t) * len, 18 + Math.sin(t) * len, a % 2 ? 'g' : 'w');
      }
      c.disc(18, 18, 3, 'w');
      [[5, 7], [28, 9], [8, 28], [27, 26]].forEach(pt => c.rect(pt[0], pt[1], 3, 2, 'm'));
    } else if (kind === 2) {
      [6, 11, 16].forEach((r, i) => {
        for (let a = 0; a < 28; a++) {
          const t = a / 28 * Math.PI * 2;
          c.px(18 + Math.cos(t) * r, 12 + i * 4 + Math.sin(t) * r * 0.35, i === 1 ? 'r' : 'd');
        }
      });
      [[10, 26], [18, 30], [26, 25], [14, 20], [23, 18]].forEach(pt => c.poly([[pt[0], pt[1]], [pt[0] + 2, pt[1] + 3], [pt[0] - 2, pt[1] + 3]], 'r'));
    } else {
      for (let a = 0; a <= 20; a++) {
        const t = Math.PI + a / 20 * Math.PI;
        c.px(18 + Math.cos(t) * 15, 30 + Math.sin(t) * 15, 'p');
      }
      for (let y = 16; y < 30; y += 4) for (let x = 6; x < 31; x += 4) if ((x + y) % 8 === 0) c.poly([[x, y], [x + 2, y + 2], [x, y + 4], [x - 2, y + 2]], 'p');
      c.rect(2, 30, 32, 1, 'p');
    }
    return c.g;
  }

  /* --- 스킬 이펙트 5프레임 시퀀스 --- */
  ringPx(c, cx, cy, r, sq, col, step) {
    const n = Math.max(12, Math.round(r * 5));
    for (let a = 0; a < n; a++) {
      if (step && a % step) continue;
      const t = a / n * Math.PI * 2;
      c.px(cx + Math.cos(t) * r, cy + Math.sin(t) * r * sq, col);
    }
  }

  /* S-01 공시 폭탄: 예고 → 섬광 → 파편링 → 확산 → 잔재 */
  fxBomb(f) {
    const c = this.mk(44, 40);
    c.rect(0, 0, 44, 40, '1');
    const cx = 22, cy = 22;
    if (f === 0) {
      this.ringPx(c, cx, cy, 13, 0.42, 'g', 3);
      c.rect(cx - 1, 2, 2, 12, 'g');
      c.poly([[cx, 15], [cx + 3, 11], [cx - 3, 11]], 'w');
    } else if (f === 1) {
      c.disc(cx, cy, 9, 'w');
      this.ringPx(c, cx, cy, 12, 0.5, 'g');
      for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; c.line(cx + Math.cos(t) * 10, cy + Math.sin(t) * 5, cx + Math.cos(t) * 20, cy + Math.sin(t) * 11, 'g'); }
    } else if (f === 2) {
      c.disc(cx, cy, 5, 'g');
      this.ringPx(c, cx, cy, 11, 0.45, 'w');
      this.ringPx(c, cx, cy, 17, 0.45, 'g', 2);
      for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2 + 0.2; c.rect(cx + Math.cos(t) * 19, cy + Math.sin(t) * 9, 2, 2, a % 2 ? 'w' : 'm'); }
    } else if (f === 3) {
      c.disc(cx, cy, 2, 'g');
      this.ringPx(c, cx, cy, 20, 0.42, 'g', 2);
      for (let a = 0; a < 10; a++) { const t = a / 10 * Math.PI * 2 + 0.5; c.rect(cx + Math.cos(t) * 15 - (a % 3), cy + Math.sin(t) * 8, 3, 2, 'm'); }
      c.rect(2, 34, 40, 1, 'g');
    } else {
      for (let a = 0; a < 9; a++) { const t = a / 9 * Math.PI * 2; c.rect(cx + Math.cos(t) * 13, cy + Math.sin(t) * 7 + 3 + (a % 3), 3, 2, 'm'); }
      this.ringPx(c, cx, cy, 23, 0.4, 'm', 4);
    }
    return c.g;
  }

  /* S-02 배당 살포: 낙하 → 착지링 → 상승 입자 → 흡수 → 잔광 */
  fxHeal(f) {
    const c = this.mk(44, 40);
    c.rect(0, 0, 44, 40, '1');
    const cx = 22, gy = 31;
    if (f === 0) {
      for (let i = 0; i < 5; i++) c.rect(8 + i * 7, 2 + (i % 3) * 3, 2, 6, 'd');
      c.rect(cx - 1, 1, 2, 14, 'r');
      this.ringPx(c, cx, gy, 12, 0.3, 'd', 4);
    } else if (f === 1) {
      this.ringPx(c, cx, gy, 8, 0.32, 'w');
      this.ringPx(c, cx, gy, 14, 0.32, 'r');
      for (let i = 0; i < 5; i++) c.rect(8 + i * 7, 12 + (i % 3) * 3, 2, 5, 'r');
    } else if (f === 2) {
      [9, 14, 19].forEach((r, i) => this.ringPx(c, cx, gy - i * 2, r, 0.32, i === 1 ? 'r' : 'd', i ? 2 : 1));
      [[11, 22], [18, 17], [26, 20], [33, 24]].forEach(p => c.poly([[p[0], p[1]], [p[0] + 2, p[1] + 4], [p[0] - 2, p[1] + 4]], 'r'));
    } else if (f === 3) {
      this.ringPx(c, cx, gy, 18, 0.3, 'd', 2);
      [[10, 14], [17, 8], [25, 12], [32, 16], [21, 5]].forEach(p => c.poly([[p[0], p[1]], [p[0] + 2, p[1] + 4], [p[0] - 2, p[1] + 4]], 'r'));
      c.rect(cx - 6, gy, 13, 1, 'w');
    } else {
      [[16, 6], [24, 9], [30, 5]].forEach(p => c.px(p[0], p[1], 'r'));
      this.ringPx(c, cx, gy, 21, 0.28, 'd', 5);
      c.rect(cx - 9, gy + 1, 19, 1, 'd');
    }
    return c.g;
  }

  /* S-03 실드: 스파크 → 격자 전개 → 완성 → 피격 파문 → 소멸 */
  fxShield(f) {
    const c = this.mk(44, 40);
    c.rect(0, 0, 44, 40, '1');
    const cx = 22, gy = 34, R = 17;
    const dome = (r, col, step) => { const n = 40; for (let a = 0; a <= n; a++) { const t = Math.PI + a / n * Math.PI; if (step && a % step) continue; c.px(cx + Math.cos(t) * r, gy + Math.sin(t) * r, col); } };
    const hexes = (col, dense) => {
      for (let y = gy - R + 3; y < gy - 1; y += 5) for (let x = cx - R + 3; x < cx + R - 2; x += 5) {
        const dx = (x - cx) / R, dy = (y - gy) / R;
        if (dx * dx + dy * dy > 0.86) continue;
        if (!dense && (x + y) % 10 > 4) continue;
        c.poly([[x, y], [x + 2, y + 2], [x, y + 4], [x - 2, y + 2]], col);
      }
    };
    if (f === 0) {
      c.rect(cx - 12, gy, 25, 1, 'p');
      for (let i = 0; i < 6; i++) c.px(cx - 10 + i * 4, gy - 2 - (i % 3) * 2, 'p');
    } else if (f === 1) {
      dome(R * 0.6, 'p'); hexes('p', false);
      c.rect(cx - 13, gy, 27, 1, 'p');
    } else if (f === 2) {
      dome(R, 'p'); dome(R - 1, 'p', 3);
      hexes('p', true);
      c.rect(cx - R, gy, R * 2 + 1, 1, 'w');
    } else if (f === 3) {
      dome(R, 'w'); dome(R - 3, 'p', 2); dome(R - 6, 'p', 3);
      hexes('p', true);
      for (let a = 0; a < 5; a++) { const t = Math.PI + 0.4 + a * 0.5; c.px(cx + Math.cos(t) * (R + 3), gy + Math.sin(t) * (R + 3), 'b'); }
      c.rect(cx - R, gy, R * 2 + 1, 1, 'w');
    } else {
      dome(R, 'p', 3); hexes('p', false);
      for (let i = 0; i < 7; i++) c.px(cx - 12 + i * 4, gy - 6 - (i % 4) * 3, 'p');
    }
    return c.g;
  }

  fxSeq(kind) {
    const fn = kind === 1 ? this.fxBomb : kind === 2 ? this.fxHeal : this.fxShield;
    return this.strip([0, 1, 2, 3, 4].map(i => fn.call(this, i)), 4);
  }

  /* 스킬 발동 시 화면 레벨 연출: 플래시 · 셰이크 · 방사선 */
  fxScreen() {
    const c = this.mk(96, 40);
    c.rect(0, 0, 96, 40, '1');
    const panel = (ox, tint) => {
      c.rect(ox, 4, 28, 32, '2');
      c.rect(ox, 4, 28, 1, 'm').rect(ox, 35, 28, 1, 'm');
      c.rect(ox + 2, 26, 24, 8, '3');
      c.rect(ox + 6, 20, 3, 6, 'r').rect(ox + 12, 22, 3, 4, 'r');
      c.rect(ox + 20, 21, 3, 5, 'b');
      if (tint) for (let y = 5; y < 35; y++) for (let x = ox + 1; x < ox + 27; x++) if ((x * 2 + y * 3) % 7 === 0) c.px(x, y, tint);
    };
    panel(2, null);
    panel(34, 'g');
    for (let a = 0; a < 20; a++) { const t = a / 20 * Math.PI * 2; c.line(48 + Math.cos(t) * 6, 20 + Math.sin(t) * 6, 48 + Math.cos(t) * 15, 20 + Math.sin(t) * 15, a % 2 ? 'g' : 'w'); }
    panel(66, null);
    for (let y = 5; y < 35; y += 3) c.rect(67, y, 26, 1, '1');
    c.rect(66, 4, 28, 1, 'w');
    return c.g;
  }

  proj(kind) {
    const c = this.mk(28, 14);
    c.rect(0, 0, 28, 14, '1');
    if (kind === 1) { c.poly([[20, 7], [10, 3], [12, 7], [10, 11]], 'r'); c.line(9, 5, 2, 4, 'd').line(9, 9, 2, 10, 'd'); }
    else if (kind === 2) { c.rect(8, 6, 12, 3, 'm'); c.poly([[20, 4], [26, 7], [20, 11]], 'w'); c.rect(6, 5, 2, 5, '3'); }
    else if (kind === 3) { c.poly([[8, 6], [18, 4], [16, 8], [18, 12]], 'b'); c.poly([[8, 6], [4, 9], [9, 10]], 'n'); }
    else {
      c.disc(7, 7, 3, 'r'); for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; c.px(7 + Math.cos(t) * 5, 7 + Math.sin(t) * 5, 'd'); }
      c.disc(17, 7, 3, 'b'); for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; c.px(17 + Math.cos(t) * 5, 7 + Math.sin(t) * 5, 'n'); }
      c.disc(25, 7, 2, 'm');
    }
    return c.g;
  }

  uiChart() {
    const c = this.mk(80, 30);
    c.rect(0, 0, 80, 30, '2');
    c.rect(0, 0, 80, 1, 'm').rect(0, 29, 80, 1, 'm').rect(0, 0, 1, 30, 'm').rect(79, 0, 1, 30, 'm');
    c.rect(0, 0, 80, 4, '3').rect(0, 4, 80, 1, 'm');
    [[0, 0], [76, 0], [0, 26], [76, 26]].forEach(pt => { c.rect(pt[0], pt[1], 4, 1, 'w'); c.rect(pt[0] + (pt[0] ? 3 : 0), pt[1], 1, 4, 'w'); });
    for (let y = 8; y < 28; y += 4) c.rect(1, y, 2, 1, 'm');
    for (let x = 6; x < 78; x += 6) c.rect(x, 27, 1, 2, 'm');
    return c.g;
  }

  uiButtons() {
    const c = this.mk(40, 34);
    c.rect(0, 0, 40, 34, '1');
    c.poly([[2, 2], [37, 2], [39, 14], [4, 14]], 'r');
    c.poly([[16, 5], [24, 11], [8, 11]], 'w');
    c.poly([[2, 19], [37, 19], [39, 31], [4, 31]], 'b');
    c.poly([[16, 28], [8, 22], [24, 22]], 'w');
    return c.outline('0').g;
  }

  uiIcons() {
    const c = this.mk(54, 34);
    c.rect(0, 0, 54, 34, '1');
    const cx = [9, 27, 45], cy = [9, 25];
    c.disc(cx[0], cy[0], 4, 'g').rect(cx[0] - 4, cy[0] + 2, 9, 2, 'g');
    c.rect(cx[1] - 5, cy[0] - 3, 11, 8, 'p').rect(cx[1] - 2, cy[0] - 5, 5, 2, 'p').poly([[cx[1], cy[0] - 1], [cx[1] + 3, cy[0] + 2], [cx[1] - 3, cy[0] + 2]], '1');
    c.poly([[cx[2] - 5, cy[0] - 5], [cx[2] + 5, cy[0] - 5], [cx[2], cy[0] + 5]], 'r').rect(cx[2] - 2, cy[0] - 3, 4, 5, '1');
    c.poly([[cx[0] + 4, cy[1] - 4], [cx[0] - 4, cy[1]], [cx[0] + 4, cy[1] + 4], [cx[0] + 1, cy[1]]], 'b');
    for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; c.px(cx[1] + Math.cos(t) * 5, cy[1] + Math.sin(t) * 5, 'w'); }
    c.rect(cx[1] - 6, cy[1], 13, 1, 'w').rect(cx[1], cy[1] - 6, 1, 13, 'w');
    c.disc(cx[2], cy[1], 4, 'm').rect(cx[2] - 1, cy[1] - 4, 2, 8, '1');
    return c.g;
  }

  uiReveal() {
    const c = this.mk(80, 44);
    c.rect(0, 0, 80, 44, '1');
    for (let x = 4; x < 78; x += 6) {
      const top = 14 + ((x * 5) % 11), len = 6 + ((x * 3) % 9);
      c.rect(x, top, 3, len, '2');
      c.rect(x + 1, top - 2, 1, len + 4, '2');
    }
    for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; c.px(40 + Math.cos(t) * 9, 22 + Math.sin(t) * 6, 'g'); }
    c.rect(26, 21, 28, 1, 'g').rect(38, 12, 4, 1, 'g').rect(38, 31, 4, 1, 'g');
    [[12, 8], [66, 10], [18, 36], [62, 34]].forEach(pt => c.px(pt[0], pt[1], 'm'));
    return c.g;
  }

  /* --- A-01 근거리: 칼 휘두르기 4프레임 --- */
  meleeFrame(f) {
    const c = this.mk(30, 34);
    const lean = [0, 1, 2, 1][f];
    c.rect(8 + lean, 26, 4, 6, '2').rect(14 + lean, 27, 4, 5, '2');
    c.rect(6 + lean, 32, 7, 2, '3').rect(13 + lean, 32, 7, 2, '3');
    c.rect(7 + lean, 15, 12, 12, '3').rect(7 + lean, 15, 12, 3, '2');
    c.rect(10 + lean, 19, 4, 6, 'w').rect(7 + lean, 21, 12, 2, 'r');
    c.disc(13 + lean, 9, 6, 'm').rect(7 + lean, 9, 13, 3, 'm').rect(12 + lean, 11, 8, 3, '2');
    const hx = 19 + lean, hy = [16, 12, 18, 22][f];
    c.rect(hx - 1, hy - 1, 3, 3, '3');
    const blade = [
      [[hx, hy], [hx - 4, hy - 12]],
      [[hx, hy], [hx + 9, hy - 8]],
      [[hx, hy], [hx + 12, hy + 3]],
      [[hx, hy], [hx + 6, hy + 9]]
    ][f];
    const a = blade[0], b = blade[1];
    c.line(a[0], a[1], b[0], b[1], 'w');
    c.line(a[0] + 1, a[1], b[0] + 1, b[1], 'm');
    c.line(a[0] - 1, a[1] + 1, a[0] + 2, a[1] - 1, 'r');
    if (f === 2) for (let k = 0; k < 9; k++) { const t = -0.7 + k * 0.19; c.px(hx + Math.cos(t) * 13, hy + Math.sin(t) * 13, 'r'); }
    if (f === 3) for (let k = 0; k < 7; k++) { const t = 0.1 + k * 0.16; c.px(hx + Math.cos(t) * 12, hy + Math.sin(t) * 12, 'd'); }
    return c.outline('0').rim('w').g;
  }

  /* --- A-02 원거리: 캔 정지 + 회전 4프레임 --- */
  canFrame(f) {
    const c = this.mk(16, 20);
    const body = ['r', 'd', 'r', 'd'][f];
    c.rect(4, 3, 8, 14, body);
    c.rect(4, 3, 8, 2, 'm').rect(4, 15, 8, 2, 'm');
    c.rect(5, 1, 6, 2, 'm').rect(7, 0, 2, 1, 'w');
    if (f === 0) { c.rect(6, 7, 4, 6, 'w'); c.rect(7, 8, 2, 4, 'd'); }
    else if (f === 1) { c.rect(8, 6, 3, 8, 'w'); c.rect(4, 7, 2, 6, 'd'); }
    else if (f === 2) { c.rect(5, 7, 2, 6, 'd'); c.rect(9, 7, 2, 6, 'd'); }
    else { c.rect(5, 6, 3, 8, 'w'); c.rect(10, 7, 2, 6, 'd'); }
    c.rect(4, 5, 1, 10, 'w');
    return c.outline('0').g;
  }

  canSpin() {
    const c = this.mk(84, 22);
    for (let i = 0; i < 4; i++) {
      const g = this.canFrame(i);
      this.stamp(c.g, g, 3 + i * 20, 1);
      if (i) for (let k = 0; k < 4; k++) c.px(1 + i * 20 - k, 11 + (k % 2), 'd');
    }
    return c.g;
  }

  throwFrame(f) {
    const c = this.mk(30, 34);
    const back = f === 0 || f === 1;
    c.disc(5, 18, 4, 'm').disc(5, 18, 2, '2');
    c.rect(9, 25, 4, 7, '2').rect(15, 26, 4, 6, '2');
    c.rect(8, 32, 6, 2, '3').rect(14, 32, 6, 2, '3');
    c.rect(8, 13, 11, 13, '3').rect(8, 13, 11, 3, '2');
    c.rect(11, 17, 4, 7, 'w').rect(8, 19, 11, 2, 'r');
    c.disc(13, 8, 5, '3').rect(15, 6, 4, 3, 'r');
    const arm = [[[19, 15], [14, 6]], [[19, 15], [22, 5]], [[19, 15], [27, 12]], [[19, 15], [26, 20]]][f];
    c.line(arm[0][0], arm[0][1], arm[1][0], arm[1][1], '3');
    c.line(arm[0][0], arm[0][1] + 1, arm[1][0], arm[1][1] + 1, '3');
    const cx = arm[1][0], cy = arm[1][1] - 2;
    if (f < 3) { c.rect(cx - 1, cy, 3, 5, f === 1 ? 'd' : 'r'); c.rect(cx - 1, cy, 3, 1, 'm'); }
    else { c.rect(cx + 2, cy - 2, 3, 5, 'r'); c.rect(cx + 2, cy - 2, 3, 1, 'm'); for (let k = 1; k < 5; k++) c.px(cx + 1 - k * 2, cy + (k % 2), 'd'); }
    return c.outline('0').rim('w').g;
  }

  /* --- A-03 탱커: 방패 대기 / 밀치기 --- */
  shieldFrame(f) {
    const c = this.mk(34, 34);
    const push = [0, 0, 3, 6][f];
    c.rect(6, 25, 5, 7, '2').rect(15 + (f > 1 ? 1 : 0), 25, 5, 7, '2');
    c.rect(4, 32, 8, 2, '3').rect(14, 32, 8, 2, '3');
    c.rect(6, 12, 13, 14, '3').rect(6, 12, 13, 3, '2');
    c.disc(6, 14, 4, '3').disc(19, 14, 4, '3');
    c.rect(9, 16, 5, 7, 'w').rect(6, 18, 13, 2, 'r');
    c.disc(12, 7, 5, '3').rect(14, 5, 4, 3, 'r');
    const sx = 21 + push;
    c.rect(sx, f === 1 ? 8 : 10, 6, 19, 'm');
    c.rect(sx + 1, (f === 1 ? 8 : 10) + 1, 4, 17, '3');
    c.disc(sx + 3, (f === 1 ? 8 : 10) + 9, 2, 'm');
    c.rect(sx, (f === 1 ? 8 : 10) + 4, 6, 1, 'm');
    c.rect(sx, (f === 1 ? 8 : 10) + 14, 6, 1, 'm');
    if (f === 3) { for (let k = 0; k < 6; k++) c.px(sx + 7 + (k % 3), 12 + k * 2, 'r'); c.rect(sx + 7, 14, 2, 10, 'd'); }
    if (f === 1) c.rect(sx - 1, 7, 8, 1, 'w');
    return c.outline('0').rim('w').g;
  }

  strip(frames, gap) {
    const gs = frames.map(g => g);
    const w = gs.reduce((a, g) => a + g[0].length + gap, gap);
    const h = Math.max.apply(null, gs.map(g => g.length)) + 2;
    const c = this.mk(w, h);
    let x = gap;
    gs.forEach(g => { this.stamp(c.g, g, x, h - g.length - 1); x += g[0].length + gap; });
    return c.g;
  }

  allyParts() {
    const c = this.mk(76, 34);
    c.rect(4, 6, 12, 14, '3').rect(4, 6, 12, 3, '2').rect(7, 10, 4, 6, 'w').rect(4, 12, 12, 2, 'r');
    c.disc(10, 3, 4, '3');
    c.rect(24, 8, 8, 4, '3');
    c.rect(24, 16, 7, 4, '3').rect(30, 17, 2, 2, 'w');
    c.rect(40, 6, 5, 9, '2');
    c.rect(40, 19, 4, 8, '2').rect(38, 26, 7, 2, '3');
    c.rect(54, 8, 4, 16, 'm').rect(52, 6, 8, 3, 'm').rect(55, 12, 2, 8, '2');
    c.rect(66, 10, 6, 12, 'm').rect(67, 12, 4, 8, '3').disc(69, 16, 1, 'm');
    return c.outline('0').rim('w').g;
  }

  MOOD = {
    dawn: { sky: ['#161B3A', '#232A55', '#3B3F6E', '#6E5A7E', '#B07A78'], sun: null, moon: '#D8CFE6',
            far: '#4A4468', mid: '#2A2C4A', near: '#171B30', win: '#F2C98A', winDim: '#3A3C60', gnd: '#101427' },
    noon: { sky: ['#5C8FA8', '#79A8BC', '#94BECD', '#AFD1DB', '#C9E1E7'], sun: '#FFFFFF',
            far: '#7FA3AE', mid: '#3F6B72', near: '#22454B', win: '#CFE9EE', winDim: '#2F5A61', gnd: '#1B383C' },
    dusk: { sky: ['#F0704F', '#F58A5E', '#FBA875', '#FFC79A', '#FFE0B8'], sun: '#FFF6DC',
            far: '#F08A72', mid: '#2F5F55', near: '#16332F', win: '#FFD9A0', winDim: '#3E6E62', gnd: '#122A27' },
    night: { sky: ['#070A12', '#0B0F1C', '#101728', '#161F35', '#1D2842'], sun: null, moon: '#E8ECF4',
            far: '#1A2340', mid: '#101728', near: '#080B14', win: '#FFD9A0', winDim: '#2E86FF', gnd: '#060810' },
    rain: { sky: ['#16283F', '#1B3350', '#214063', '#284D76', '#325A85'], sun: null,
            far: '#2E5075', mid: '#1B3350', near: '#0F2136', win: '#8FC4E8', winDim: '#23405F', gnd: '#0C1A2B' },
    snow: { sky: ['#8E9BAB', '#9EAAB9', '#AFBAC7', '#C0C9D4', '#D2D9E2'], sun: null,
            far: '#AEB8C6', mid: '#63707F', near: '#3A444F', win: '#FFE9C4', winDim: '#4E5A67', gnd: '#C8D2DD', snow: '#E6ECF2' },
    dust: { sky: ['#8A6A2E', '#A5813A', '#BE9B4C', '#D4B466', '#E4CB8A'], sun: '#F3E0A8',
            far: null, mid: '#6B5527', near: '#3E3216', win: '#F0D89A', winDim: '#5C4A22', gnd: '#2C2412' }
  };

  scene(key, w, h, opts) {
    const m = this.MOOD[key], o = opts || {};
    const c = this.mk(w, h);
    const bands = m.sky.length, top = 0, skyH = Math.round(h * 0.62);
    for (let y = 0; y < skyH; y++) {
      const f = y / skyH * (bands - 1), i = Math.min(bands - 2, Math.floor(f)), t = f - i;
      for (let x = 0; x < w; x++) {
        const dith = ((x + y) % 2 === 0 ? 0.35 : 0.65);
        c.px(x, y, t > dith ? m.sky[i + 1] : m.sky[i]);
      }
    }
    if (m.sun) { const sx = Math.round(w * 0.74), sy = Math.round(skyH * 0.34); c.disc(sx, sy, Math.round(h * 0.11), m.sun); }
    if (m.moon) {
      const sx = Math.round(w * 0.78), sy = Math.round(skyH * 0.28), r = Math.round(h * 0.07);
      c.disc(sx, sy, r, m.moon); c.disc(sx + Math.round(r * 0.6), sy - Math.round(r * 0.35), r, m.sky[1]);
    }
    const R = o.region || 1;
    const LAY = {
      1: {
        far: [[0.02, .30], [0.09, .42], [0.16, .24], [0.24, .48], [0.62, .26], [0.70, .40], [0.78, .20], [0.87, .35], [0.94, .28]],
        mid: [[0.30, .52, .08], [0.39, .66, .07], [0.47, .44, .09], [0.56, .58, .06]],
        near: [[-0.01, .36, .13], [0.11, .46, .10], [0.20, .30, .12], [0.63, .34, .14], [0.76, .42, .11], [0.88, .28, .14]]
      },
      2: {
        far: [[0.04, .16], [0.14, .22], [0.26, .14], [0.66, .18], [0.78, .13], [0.90, .20]],
        mid: [[0.30, .26, .13], [0.45, .20, .15], [0.60, .28, .12]],
        near: [[0.00, .20, .18], [0.18, .26, .16], [0.66, .22, .17], [0.86, .18, .18]]
      },
      3: {
        far: [[0.03, .34], [0.13, .26], [0.70, .30], [0.84, .24], [0.94, .34]],
        mid: [[0.32, .30, .10], [0.46, .24, .12], [0.58, .34, .09]],
        near: [[0.00, .24, .16], [0.16, .30, .14], [0.68, .26, .16], [0.88, .22, .16]]
      }
    }[R];
    if (m.far) LAY.far.forEach(t => {
      const x = Math.round(t[0] * w), bw = Math.round(w * (R === 2 ? 0.09 : 0.06)), bh = Math.round(h * t[1]);
      c.rect(x, skyH - bh, bw, bh + 4, m.far);
      for (let y = skyH - bh + 3; y < skyH; y += 3)
        for (let px = x + 1; px < x + bw - 1; px += 2) if ((px * 5 + y * 3) % 7 < 3) c.px(px, y, m.win);
    });
    LAY.mid.forEach(t => {
      const x = Math.round(t[0] * w), bw = Math.round(t[2] * w), bh = Math.round(h * t[1]);
      c.rect(x, skyH - bh, bw, bh + 5, m.mid);
      c.rect(x, skyH - bh, bw, 1, m.near);
      if (m.snow) c.rect(x, skyH - bh - 1, bw, 1, m.snow);
      for (let y = skyH - bh + 3; y < skyH + 3; y += 3)
        for (let px = x + 1; px < x + bw - 1; px += 2) c.px(px, y, (px * 3 + y) % 5 < 2 ? m.win : m.winDim);
    });
    if (R === 1) [[0.34, 0.72], [0.52, 0.78]].forEach(t => {
      const x = Math.round(t[0] * w); c.rect(x, Math.round(skyH * (1 - t[1])) - 6, 1, 8, m.near);
    });
    if (R === 2) for (let i = 0; i < 4; i++) {
      const x = Math.round(w * (0.24 + i * 0.14)); c.rect(x, Math.round(skyH * 0.42), 1, Math.round(h * 0.10), m.mid); c.px(x, Math.round(skyH * 0.42) - 1, m.win);
    }
    if (R === 3) {
      [[0.24, .40], [0.40, .46], [0.54, .38]].forEach(t => {
        const x = Math.round(t[0] * w), ty = skyH - Math.round(h * t[1]);
        c.rect(x, ty, 2, Math.round(h * t[1]) + 4, m.mid);
        c.rect(x - Math.round(w * 0.05), ty, Math.round(w * 0.11), 2, m.mid);
        c.rect(x + Math.round(w * 0.045), ty + 2, 1, Math.round(h * 0.10), m.mid);
        c.rect(x + Math.round(w * 0.035), ty + 2 + Math.round(h * 0.10), 3, 3, m.near);
      });
      [[0.18, .30], [0.64, .34]].forEach(t => {
        const x = Math.round(t[0] * w), ty = skyH - Math.round(h * t[1]);
        c.rect(x, ty, 3, Math.round(h * t[1]) + 4, m.near);
        c.rect(x - 1, ty, 5, 2, m.mid);
        for (let k = 0; k < 5; k++) c.px(x + 1 + (k % 2), ty - 3 - k * 2, m.sky[Math.min(4, 3 + k % 2)]);
      });
    }
    LAY.near.forEach(t => {
      const x = Math.round(t[0] * w), bw = Math.round(t[2] * w), bh = Math.round(h * t[1]), ty = h - Math.round(h * 0.10) - bh;
      c.rect(x, ty, bw, bh + Math.round(h * 0.10), m.near);
      if (m.snow) c.rect(x, ty - 1, bw, 1, m.snow);
      for (let y = ty + 3; y < h - Math.round(h * 0.10); y += 4)
        for (let px = x + 2; px < x + bw - 2; px += 3) c.rect(px, y, 2, 2, (px * 7 + y * 5) % 6 < 3 ? m.win : m.winDim);
    });
    if (R === 1) { const by = h - Math.round(h * 0.10); c.rect(0, by - 3, w, 1, m.mid); for (let i = 4; i < w; i += 9) c.rect(i, by - 6, 1, 3, m.mid); }
    c.rect(0, h - Math.round(h * 0.10), w, Math.round(h * 0.10) + 2, m.gnd);
    if (m.snow) c.rect(0, h - Math.round(h * 0.10), w, 2, m.snow);
    if (o.rain) for (let i = -12; i < w + 12; i += 4) c.line(i, 0, i - Math.round(h * 0.22), h, ((i / 4) | 0) % 3 ? '#3A6E9E' : '#8FC4E8');
    if (o.snowFall) for (let i = 0; i < w; i += 5) for (let j = (i * 3) % 7; j < h - 3; j += 9) c.px(i + (j % 3), j, '#F2F6FA');
    if (o.haze) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + y * 2) % 5 === 0) c.px(x, y, m.sky[Math.min(4, 2 + (y * 3 / h) | 0)]);
    return c.g;
  }

  darken(grid, amt) {
    const hx = v => parseInt(v, 16);
    return grid.map(row => row.map(v => {
      if (!v || v === '.' || v[0] !== '#') return v;
      const r = Math.round(hx(v.slice(1, 3)) * (1 - amt) + 7 * amt);
      const g = Math.round(hx(v.slice(3, 5)) * (1 - amt) + 10 * amt);
      const b = Math.round(hx(v.slice(5, 7)) * (1 - amt) + 18 * amt);
      return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
    }));
  }

  stamp(dst, src, ox, oy, flip, k) {
    k = k || 1;
    const h = src.length, w = src[0].length;
    const oh = Math.round(h * k), ow = Math.round(w * k);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const sy = Math.min(h - 1, Math.floor(y / k)), sxi = Math.min(w - 1, Math.floor(x / k));
      const v = src[sy][flip ? w - 1 - sxi : sxi];
      if (!v || v === '.') continue;
      const col = (v[0] === '#') ? v : this.PAL[v];
      if (!col) continue;
      const tx = ox + x, ty = oy + y;
      if (ty >= 0 && ty < dst.length && tx >= 0 && tx < dst[0].length) dst[ty][tx] = col;
    }
  }

  /* bottom-aligned stamp: y is the baseline (feet), height derives from scale */
  stampOn(dst, src, cx, baseY, k, flip) {
    const oh = Math.round(src.length * k), ow = Math.round(src[0].length * k);
    this.stamp(dst, src, Math.round(cx - ow / 2), baseY - oh, flip, k);
  }

  /* 852x240 ≈ 3840x1080. 유닛 34px = 화면 높이의 14% — 실제 게임 비율 */
  wideScene() {
    const W = 852, H = 240;
    const m = this.MOOD.dusk;
    const c = this.mk(W, H);
    const skyH = Math.round(H * 0.62), bands = m.sky.length;
    for (let y = 0; y < skyH; y++) {
      const f = Math.pow(y / skyH, 0.75) * (bands - 1), i = Math.min(bands - 2, Math.floor(f)), t = f - i;
      for (let x = 0; x < W; x++) c.px(x, y, t > ((x + y) % 2 ? 0.65 : 0.35) ? m.sky[i + 1] : m.sky[i]);
    }
    c.disc(Math.round(W * 0.70), Math.round(skyH * 0.30), 22, m.sun);
    for (let k = 0; k < 7; k++) { const yy = 22 + k * 11; c.rect(60 + k * 42, yy, 70 - k * 6, 3, m.sky[Math.min(4, 2 + (k % 2))]); }
    const laneTop = H - 40;
    const far = [];
    for (let i = 0; i < 34; i++) far.push([i / 34 + 0.004, 0.16 + ((i * 37) % 11) / 55]);
    far.forEach((t, i) => {
      const x = Math.round(t[0] * W), bw = 16 + (i % 4) * 4, bh = Math.round(H * t[1]);
      c.rect(x, skyH - bh, bw, bh + 8, m.far);
      for (let y = skyH - bh + 5; y < skyH; y += 7) for (let px = x + 3; px < x + bw - 2; px += 5) if ((px * 5 + y * 3) % 7 < 4) c.rect(px, y, 2, 3, m.win);
    });
    [[0.05, .30, 30], [0.13, .40, 26], [0.22, .24, 34], [0.31, .34, 28], [0.42, .27, 36], [0.53, .38, 26], [0.62, .25, 32], [0.72, .33, 28], [0.83, .23, 34]].forEach(t => {
      const x = Math.round(t[0] * W), bw = t[2], bh = Math.round(H * t[1]), ty = skyH - bh;
      c.rect(x, ty, bw, bh + 14, m.mid);
      c.rect(x, ty, bw, 2, m.near);
      for (let y = ty + 7; y < skyH + 8; y += 8) for (let px = x + 4; px < x + bw - 3; px += 6) c.rect(px, y, 3, 4, (px * 3 + y) % 5 < 2 ? m.win : m.winDim);
    });
    [[0.00, .22, 46], [0.09, .27, 40], [0.19, .18, 44], [0.76, .20, 42], [0.86, .26, 40], [0.95, .17, 46]].forEach(t => {
      const x = Math.round(t[0] * W), bw = t[2], bh = Math.round(H * t[1]), ty = laneTop - bh;
      c.rect(x, ty, bw, bh + 10, m.near);
      c.rect(x, ty, bw, 2, '#1F4A42');
      for (let y = ty + 8; y < laneTop - 4; y += 10) for (let px = x + 6; px < x + bw - 5; px += 9) c.rect(px, y, 4, 6, (px * 7 + y * 5) % 6 < 3 ? m.win : m.winDim);
    });
    c.rect(0, laneTop, W, H - laneTop, m.gnd);
    c.rect(0, laneTop, W, 2, '#2F5F55');
    for (let x = 0; x < W; x += 14) c.rect(x, laneTop + 12, 6, 2, '#1B4A42');
    const g = this.darken(c.g, 0.5);
    const base = laneTop + 30;
    this.stampOn(g, this.baseAlly(), 52, base, 2.4);
    this.stampOn(g, this.baseEnemy(), W - 56, base, 2.4);
    this.stampOn(g, this.towerBasic(), 170, base, 1.15);
    this.stampOn(g, this.towerAA(), 232, base, 1.15);
    this.stampOn(g, this.towerSplash(), 296, base, 1.15);
    this.stampOn(g, this.allyScout(), 352, base, 1);
    this.stampOn(g, this.allyRookie(), 386, base, 1);
    this.stampOn(g, this.allyAnchor(), 418, base, 1);
    this.stampOn(g, this.enemyRusher(), 480, base, 1, true);
    this.stampOn(g, this.enemyBlocker(), 530, base, 1, true);
    this.stampOn(g, this.enemyTank(), 588, base, 1, true);
    this.stampOn(g, this.enemyKite(), 520, base - 96, 1, true);
    this.stampOn(g, this.enemySiren(), 640, base - 108, 1, true);
    this.stampOn(g, this.boss(), 706, base, 1.5, true);
    return g;
  }

  scrimCompare() {
    const src = this.scene('dusk', 60, 40);
    const dark = this.darken(src, 0.5);
    const out = this.mk(122, 40);
    src.forEach((row, y) => row.forEach((v, x) => { if (v !== '.') out.px(x, y, v); }));
    dark.forEach((row, y) => row.forEach((v, x) => { if (v !== '.') out.px(x + 62, y, v); }));
    for (let y = 0; y < 40; y++) out.px(60, y, '#E8ECF4').px(61, y, '#070A12');
    return out.g;
  }

  sheets() {
    if (this._s) return this._s;
    this._s = {
      'tf-ally-01': this.allyRookie(), 'tf-ally-02': this.allyScout(), 'tf-ally-03': this.allyAnchor(),
      'tf-ally-parts': this.allyParts(),
      'tf-enemy-01': this.enemyRusher(), 'tf-enemy-02': this.enemyBlocker(), 'tf-enemy-03': this.enemyTank(),
      'tf-enemy-air-01': this.enemyKite(), 'tf-enemy-air-02': this.enemySiren(),
      'tf-tower-01': this.towerBasic(), 'tf-tower-02': this.towerAA(), 'tf-tower-03': this.towerSplash(),
      'tf-base-ally': this.baseAlly(), 'tf-base-enemy': this.baseEnemy(), 'tf-boss': this.boss(),
      'tf-bg-r1-far': this.bgFar(1), 'tf-bg-r1-mid': this.bgMid(1),
      'tf-bg-r2-far': this.bgFar(2), 'tf-bg-r2-mid': this.bgMid(2),
      'tf-bg-r3-far': this.bgFar(3), 'tf-bg-r3-mid': this.bgMid(3),
      'tf-gnd-r1': this.ground(1, 1), 'tf-gnd-r2': this.ground(2, 1), 'tf-gnd-r3': this.ground(3, 1),
      'tf-gnd-s1': this.ground(1, 1), 'tf-gnd-s2': this.ground(1, 2), 'tf-gnd-s3': this.ground(1, 3),
      'tf-gnd-slot': this.groundSlot(),
      'tf-wx-01': this.weather(1), 'tf-wx-02': this.weather(2), 'tf-wx-03': this.weather(3), 'tf-wx-04': this.weather(4),
      'tf-fx-01': this.fx(1), 'tf-fx-02': this.fx(2), 'tf-fx-03': this.fx(3),
      'tf-w-01': this.proj(1), 'tf-w-02': this.proj(2), 'tf-w-03': this.proj(3), 'tf-w-04': this.proj(4),
      'tf-ui-chart': this.uiChart(), 'tf-ui-btn': this.uiButtons(),
      'tf-ui-icons': this.uiIcons(), 'tf-ui-reveal': this.uiReveal(),
      'tf-sky-dawn': this.scene('dawn', 116, 62), 'tf-sky-noon': this.scene('noon', 116, 62),
      'tf-sky-dusk': this.scene('dusk', 116, 62), 'tf-sky-night': this.scene('night', 116, 62),
      'tf-sky-rain': this.scene('rain', 100, 56, { rain: true }),
      'tf-sky-snow': this.scene('snow', 100, 56, { snowFall: true }),
      'tf-sky-dust': this.scene('dust', 100, 56, { haze: true }),
      'tf-sky-scrim': this.scrimCompare(), 'tf-sky-wide': this.wideScene(),
      'tf-r1-noon': this.scene('noon', 108, 56, { region: 1 }),
      'tf-r1-dusk': this.scene('dusk', 108, 56, { region: 1 }),
      'tf-r1-night': this.scene('night', 108, 56, { region: 1 }),
      'tf-r2-noon': this.scene('noon', 108, 56, { region: 2 }),
      'tf-r2-dusk': this.scene('dusk', 108, 56, { region: 2 }),
      'tf-r2-night': this.scene('night', 108, 56, { region: 2 }),
      'tf-r3-noon': this.scene('noon', 108, 56, { region: 3 }),
      'tf-r3-dusk': this.scene('dusk', 108, 56, { region: 3 }),
      'tf-r3-dust': this.scene('dust', 108, 56, { region: 3, haze: true }),
      'tf-melee-loop': this.strip([0, 1, 2, 3].map(i => this.meleeFrame(i)), 5),
      'tf-melee-hold': this.meleeFrame(1),
      'tf-can-idle': this.canFrame(0),
      'tf-can-spin': this.canSpin(),
      'tf-throw-loop': this.strip([0, 1, 2, 3].map(i => this.throwFrame(i)), 5),
      'tf-shield-idle': this.shieldFrame(0),
      'tf-shield-loop': this.strip([0, 1, 2, 3].map(i => this.shieldFrame(i)), 5),
      'tf-fx-seq-01': this.fxSeq(1), 'tf-fx-seq-02': this.fxSeq(2), 'tf-fx-seq-03': this.fxSeq(3),
      'tf-fx-screen': this.fxScreen()
    };
    return this._s;
  }

  paint(canvas, grid) {
    const h = grid.length, w = grid[0].length;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = grid[y][x];
      const col = (v && v[0] === '#') ? v : this.PAL[v];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
    const box = canvas.parentElement;
    const cw = box.clientWidth || w, ch = box.clientHeight || h;
    const fit = Math.min(cw / w, ch / h);
    const s = fit >= 1 ? Math.floor(fit) : 1 / Math.ceil(1 / fit);
    canvas.style.position = 'absolute';
    canvas.style.left = '50%'; canvas.style.top = '50%';
    canvas.style.transform = 'translate(-50%,-50%)';
    canvas.style.width = w * s + 'px';
    canvas.style.height = h * s + 'px';
  }

  draw() {
    const S = this.sheets();
    document.querySelectorAll('canvas[data-spr]').forEach(cv => {
      const grid = S[cv.dataset.spr];
      if (grid) this.paint(cv, grid);
    });
  }

  componentDidMount() { this.applyTint(); this.draw(); setTimeout(() => this.draw(), 150); }
  componentDidUpdate() { this.applyTint(); this.draw(); }
  renderVals() { return {}; }
}

