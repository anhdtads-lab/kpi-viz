/**
 * KPI Bullet Chart — Looker Studio Community Visualization
 * Tác giả: German Link (Tuấn Anh)
 * Hiển thị: Thực tế vs Mục tiêu Tháng / Quý / Năm
 */
(function () {
  'use strict';

  // =============================================
  // CẤU HÌNH GIAO DIỆN
  // =============================================
  var CONFIG = {
    pad:     { top: 52, right: 210, bottom: 44, left: 172 },
    rowH:    80,      // chiều cao mỗi hàng KPI
    barH:    28,      // chiều cao thanh bar
    markW:   3,       // độ dày vạch mục tiêu
    overhang: 8,      // vạch nhô ra trên/dưới thanh bar
    font:    '"Google Sans", Roboto, Arial, sans-serif',
    col: {
      track:       '#ECEFF1',   // nền thanh xám nhạt
      monthMark:   '#1967D2',   // vạch Tháng — xanh dương
      quarterMark: '#7B1FA2',   // vạch Quý — tím
      yearMark:    '#E65100',   // vạch Năm — cam đậm
      textDark:    '#202124',
      textMid:     '#5F6368',
      textLight:   '#9AA0A6',
      rowAlt:      'rgba(0,0,0,0.018)',
      separator:   '#EEEEEE'
    }
  };

  // =============================================
  // TIỆN ÍCH
  // =============================================
  var NS = 'http://www.w3.org/2000/svg';

  // Tạo SVG element với attributes
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        e.setAttribute(k, attrs[k]);
      });
    }
    return e;
  }

  // Tạo SVG text node
  function txt(content, x, y, attrs) {
    var e = el('text', Object.assign({ x: x, y: y }, attrs || {}));
    e.textContent = content;
    return e;
  }

  // Format số: 1.200.000 → "1.2 tr", 9600000000 → "9.6 tỷ"
  function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '')  + ' tỷ';
    if (abs >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '')  + ' tr';
    if (abs >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, '')  + 'K';
    return Math.round(n).toLocaleString('vi-VN');
  }

  // Tính tỷ lệ % (trả về null nếu target = 0)
  function ratio(actual, target) {
    return (!target || target === 0) ? null : actual / target;
  }

  // Định dạng % hiển thị
  function pp(r) {
    return r == null ? '—' : (r * 100).toFixed(0) + '%';
  }

  // Icon trạng thái
  function icon(r) {
    if (r == null) return '';
    if (r >= 1)    return ' ✓';
    if (r >= 0.8)  return ' !';
    return ' ✗';
  }

  // Màu thanh dựa theo % vs mục tiêu tháng
  function barColor(r, style) {
    if (r == null) return '#4285F4';
    var good = (style.colorGood    && style.colorGood.value    && style.colorGood.value.color)    || '#34A853';
    var warn = (style.colorWarning && style.colorWarning.value && style.colorWarning.value.color) || '#FBBC04';
    var bad  = (style.colorBad     && style.colorBad.value     && style.colorBad.value.color)     || '#EA4335';
    return r >= 1 ? good : r >= 0.8 ? warn : bad;
  }

  // Giới hạn giá trị trong khoảng [lo, hi]
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // Cắt chuỗi quá dài
  function truncate(s, max) {
    max = max || 22;
    return (s && s.length > max) ? s.slice(0, max - 1) + '…' : (s || '');
  }

  // =============================================
  // VẼ BIỂU ĐỒ
  // =============================================
  var lastData = null;

  function draw(data) {
    lastData = data;

    var root = document.getElementById('root');
    root.innerHTML = '';

    // Lấy dữ liệu từ Looker Studio
    var rows = (data && data.tables && data.tables.concepts) || [];

    if (!rows.length) {
      root.innerHTML = '<div class="empty">Kéo thả trường dữ liệu vào biểu đồ để bắt đầu.<br>Cần: Tên KPI + Thực tế (+ tùy chọn: Mục tiêu Tháng/Quý/Năm)</div>';
      return;
    }

    var style = data.style || {};
    var C     = CONFIG;
    var W     = root.clientWidth  || 800;
    var cW    = W - C.pad.left - C.pad.right;  // chiều rộng vùng vẽ bar
    var H     = rows.length * C.rowH + C.pad.top + C.pad.bottom;
    var barYOffset = Math.floor((C.rowH - C.barH) / 2);

    var svg = el('svg', { width: W, height: H });
    svg.style.fontFamily = C.font;
    svg.style.fontSize   = '12px';
    svg.style.display    = 'block';

    // --- Defs: gradient riêng cho từng bar ---
    var defs = el('defs');

    // Filter đổ bóng nhẹ cho thanh bar
    var shadow = el('filter', { id: 'bShadow', x: '-5%', y: '-30%', width: '115%', height: '160%' });
    var fe = el('feDropShadow', { dx: '0', dy: '1', stdDeviation: '1.5', 'flood-color': '#000', 'flood-opacity': '0.12' });
    shadow.appendChild(fe);
    defs.appendChild(shadow);

    svg.appendChild(defs);

    // --- Header cột bên phải ---
    var hx = C.pad.left + cW + 10;
    svg.appendChild(txt('THỰC TẾ', hx, C.pad.top - 24, {
      fill: C.col.textMid, 'font-size': '9', 'font-weight': '600', 'letter-spacing': '0.7'
    }));

    // =============================================
    // VẼ TỪNG HÀNG KPI
    // =============================================
    rows.forEach(function (row, i) {
      var name     = truncate((row.dimKPI    || [])[0] || ('KPI ' + (i + 1)));
      var actual   = (row.metActual    || [])[0] || 0;
      var monthly  = (row.metMonthly   || [])[0] || 0;
      var quarterly= (row.metQuarterly || [])[0] || 0;
      var yearly   = (row.metYearly    || [])[0] || 0;

      var rM = ratio(actual, monthly);
      var rQ = ratio(actual, quarterly);
      var rY = ratio(actual, yearly);
      var color = barColor(rM, style);

      // Scale: max value làm chuẩn 100% chiều rộng
      var maxVal = Math.max(actual, yearly, quarterly, monthly) * 1.08 || 1;
      var sc = function (v) { return clamp((v / maxVal) * cW, 0, cW); };

      var gy = C.pad.top + i * C.rowH;
      var g  = el('g', { transform: 'translate(' + C.pad.left + ',' + gy + ')' });

      // Nền xen kẽ hàng
      if (i % 2 === 1) {
        g.appendChild(el('rect', {
          x: -C.pad.left, y: 0, width: W, height: C.rowH,
          fill: C.col.rowAlt
        }));
      }

      // Đường kẻ phân cách hàng
      g.appendChild(el('line', {
        x1: -C.pad.left, y1: 0, x2: W - C.pad.left, y2: 0,
        stroke: C.col.separator, 'stroke-width': '1'
      }));

      // --- Track (nền xám) ---
      g.appendChild(el('rect', {
        x: 0, y: barYOffset, width: cW, height: C.barH,
        fill: C.col.track, rx: 5, ry: 5
      }));

      // --- Thanh thực tế ---
      var aW = sc(actual);
      if (aW > 2) {
        // Tạo gradient riêng cho bar này
        var gradId = 'g_' + i;
        var grad   = el('linearGradient', { id: gradId, x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
        var s1 = el('stop', { offset: '0%',   'stop-color': color, 'stop-opacity': '1'    });
        var s2 = el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0.78' });
        grad.appendChild(s1);
        grad.appendChild(s2);
        defs.appendChild(grad);

        g.appendChild(el('rect', {
          x: 0, y: barYOffset, width: aW, height: C.barH,
          fill: 'url(#' + gradId + ')',
          rx: 5, ry: 5,
          filter: 'url(#bShadow)'
        }));
      }

      // --- Vạch mục tiêu Tháng / Quý / Năm ---
      [
        { v: monthly,    c: C.col.monthMark,   lbl: 'T' },
        { v: quarterly,  c: C.col.quarterMark,  lbl: 'Q' },
        { v: yearly,     c: C.col.yearMark,     lbl: 'N' }
      ].forEach(function (mk) {
        if (!mk.v) return;
        var mx = sc(mk.v);
        if (mx <= 1 || mx > cW) return;

        // Vạch dọc
        g.appendChild(el('rect', {
          x: mx - 1, y: barYOffset - C.overhang,
          width: C.markW, height: C.barH + C.overhang * 2,
          fill: mk.c
        }));

        // Nhãn chữ cái nhỏ phía trên vạch
        g.appendChild(txt(mk.lbl, mx + 0.5, barYOffset - C.overhang - 3, {
          'text-anchor': 'middle', fill: mk.c,
          'font-size': '8', 'font-weight': '700'
        }));
      });

      // --- Tên KPI (bên trái, căn phải) ---
      g.appendChild(txt(name, -10, barYOffset + C.barH / 2 + 4.5, {
        'text-anchor': 'end',
        fill: C.col.textDark,
        'font-size': '12',
        'font-weight': '500'
      }));

      // --- Nhãn bên phải ---
      var rx = cW + 10;

      // Giá trị thực tế (to, đậm)
      g.appendChild(txt(fmt(actual), rx, barYOffset + 14, {
        fill: C.col.textDark, 'font-size': '14', 'font-weight': '700'
      }));

      // % vs Tháng (màu theo trạng thái + icon)
      if (rM !== null) {
        g.appendChild(txt('T: ' + pp(rM) + icon(rM), rx, barYOffset + 27, {
          fill: color, 'font-size': '10', 'font-weight': '600'
        }));
      }

      // % vs Quý (xám vừa)
      if (rQ !== null) {
        g.appendChild(txt('Q: ' + pp(rQ), rx, barYOffset + 39, {
          fill: C.col.textMid, 'font-size': '10'
        }));
      }

      // % vs Năm (xám nhạt)
      if (rY !== null) {
        g.appendChild(txt('N: ' + pp(rY), rx, barYOffset + 51, {
          fill: C.col.textLight, 'font-size': '10'
        }));
      }

      svg.appendChild(g);
    });

    // =============================================
    // LEGEND PHÍA DƯỚI
    // =============================================
    var legendY = H - 10;
    [
      { c: CONFIG.col.monthMark,   t: 'T = Mục tiêu Tháng' },
      { c: CONFIG.col.quarterMark, t: 'Q = Mục tiêu Quý'   },
      { c: CONFIG.col.yearMark,    t: 'N = Mục tiêu Năm'   }
    ].forEach(function (item, i) {
      var lx = C.pad.left + i * 170;
      svg.appendChild(el('rect', {
        x: lx, y: legendY - 7, width: C.markW, height: 10,
        fill: item.c
      }));
      svg.appendChild(txt(item.t, lx + 8, legendY + 1, {
        fill: C.col.textLight, 'font-size': '10'
      }));
    });

    root.appendChild(svg);
  }

  // =============================================
  // KẾT NỐI VỚI LOOKER STUDIO
  // =============================================
  if (typeof dscc !== 'undefined') {
    // Chế độ production: nhận dữ liệu từ Looker Studio
    dscc.subscribeToData(draw, { transform: dscc.objectTransform });
  } else {
    // Chế độ test offline: dùng dữ liệu mẫu
    draw({
      tables: {
        concepts: [
          {
            dimKPI:       ['Doanh thu'],
            metActual:    [750000000],
            metMonthly:   [800000000],
            metQuarterly: [2400000000],
            metYearly:    [9600000000]
          },
          {
            dimKPI:       ['Học viên mới'],
            metActual:    [87],
            metMonthly:   [100],
            metQuarterly: [300],
            metYearly:    [1200]
          },
          {
            dimKPI:       ['Tỷ lệ tái đăng ký'],
            metActual:    [68],
            metMonthly:   [70],
            metQuarterly: [70],
            metYearly:    [75]
          },
          {
            dimKPI:       ['NPS Score'],
            metActual:    [82],
            metMonthly:   [80],
            metQuarterly: [80],
            metYearly:    [85]
          }
        ]
      },
      style: {}
    });
  }

  // Vẽ lại khi resize cửa sổ
  window.addEventListener('resize', function () {
    if (lastData) draw(lastData);
  });

})();
