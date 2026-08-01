
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
      'tf-ui-icons': this.uiIcons(), 'tf-ui-reveal': this.uiReveal()
    };
    return this._s;
  }

  paint(canvas, grid) {
    const h = grid.length, w = grid[0].length;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = this.PAL[grid[y][x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
    const box = canvas.parentElement;
    const cw = box.clientWidth || w, ch = box.clientHeight || h;
    const s = Math.max(1, Math.floor(Math.min(cw / w, ch / h)));
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

