var PageRides = (function() {
  var exports = {};
  var i18n_strings = {};
  var config = null;
  var initial_load_done = false;
  const GRAVITY = 9.80665;

  function i18n(s) {
    if (s in i18n_strings) {
      return i18n_strings[s];
    }

    return "";
  }

  function handleCartesian(gd, ev) {
    var button = ev.currentTarget;
    var astr = button.getAttribute('data-attr');
    var val = button.getAttribute('data-val') || true;
    var aobj = {};

    if (gd.layout[astr] == val) {
      aobj[astr] = false;
    }
    else {
      aobj[astr] = val;
    }

    Plotly.relayout(gd, aobj);
  }

  function init_video(video_id) {
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    var player;
    window.onYouTubeIframeAPIReady = function() {
      player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: video_id,
        events: {
          'onStateChange': onPlayerStateChange
        }
      });
    }

    function updateCharts() {
      const t = player.getCurrentTime();

      for (var i = 0; i < config.charts.children.length; i++) {
        const chart = config.charts.children[i];
        if (!chart.is_chart) {
          continue;
        }

        Plotly.relayout(chart, {
          shapes: [
            {
              type: 'line',
              layer: 'below',
              x0: t,
              y0: 0,
              yref: 'paper',
              x1: t,
              y1: 1,
              line: {
                color: '#f44336',
                width: 1.5,
              }
            }
          ],
        });
      }
    }

    var interval = null;
    function onPlayerStateChange(e) {
      if (e.data == YT.PlayerState.PLAYING) {
        if (interval === null) {
          interval = setInterval(updateCharts, 100);
        }
      }
      else {
        if (interval !== null) {
          clearInterval(interval);
          interval = null;
        }
      }
    }
  }

  function to_degrees(radians) {
    var pi = Math.PI;
    return radians * (180/pi);
  }

  function new_data(x) {
    return [
      {
        x: x,
        y: [],
        line: {
          color: '#039be5'
        }
      }
    ];
  }

  function load_data(data_file, data_format) {
    var oReq = new XMLHttpRequest();
    oReq.open("GET", "/data/" + data_file, true);
    oReq.responseType = "arraybuffer";
    oReq.onload = function (oEvent) {
      const buffer = oReq.response;
      if (!buffer) {
        return;
      }

      const view = new DataView(buffer);
      var off = 0;

      if (data_format == "pendulum") {
        const radius = view.getFloat32(off, false);
        off += 4;
        console.log('radius:', radius);

        const orientation_offset = view.getFloat32(off, false);
        off += 4;
        console.log('orientation_offset:', orientation_offset);

        const timestep = view.getUint32(off, false) | view.getUint32(off + 4, false) << 32;
        off += 8;
        console.log('timestep:', timestep);

        var data_x = [];
        const data_pa = new_data(data_x);
        const data_va = new_data(data_x);
        const data_vt = new_data(data_x);
        const data_at = new_data(data_x);
        for (var i=0; off < buffer.byteLength; i++) {
          const pa = float16.getFloat16(view, off);
          off += 2;

          const va = float16.getFloat16(view, off);
          off += 2;

          data_x.push(i * timestep / 1000000);
          data_pa[0].y.push(to_degrees(pa + orientation_offset));
          data_va[0].y.push(to_degrees(va));
          data_vt[0].y.push(va * radius);
          data_at[0].y.push((Math.pow(va, 2) * radius + GRAVITY * Math.cos(pa + orientation_offset)) / GRAVITY);
        }

        if (off != buffer.byteLength) {
          throw "trailing garbage";
        }

        add_chart(i18n("acceleration"), data_at);
        add_chart(i18n("velocity"), data_vt);
        add_chart(i18n("angular_position"), data_pa);
        add_chart(i18n("angular_velocity"), data_va);
      }
    };
    oReq.send(null);
  }

  function add_chart(title, data) {
    const chart_layout = {
      dragmode: false,
      margin: {
        l: 20,
        r: 0,
        t: 0,
        b: 25,
      },
    };

    const chart_config = {
      responsive: true,
      displayModeBar: true,
      doubleClick: false,
      modeBarButtons: [
        ['toImage'],
        [
          {
            name: 'zoom2d_mod',
            title: 'Zoom',
            attr: 'dragmode',
            val: 'zoom',
            icon: Plotly.Icons.zoombox,
            click: handleCartesian
          },
          {
              name: 'pan2d_mod',
              title: 'Pan',
              attr: 'dragmode',
              val: 'pan',
              icon: Plotly.Icons.pan,
              click: handleCartesian
          }
        ],
        ['zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d'],
      ]
    };

    var chart_title = document.createElement('div');
    chart_title.setAttribute("class", "fl w-100 mdc-typography--overline pl1 pt3");
    chart_title.innerHTML = title;
    config.charts.append(chart_title);

    var chart = document.createElement('div');
    chart.setAttribute("class", "fl w-100 vh-50");
    chart._pagerides_noevt = false;
    chart.is_chart = true;
    config.charts.append(chart);

    Plotly.newPlot(chart, data, chart_layout, chart_config);

    chart.on('plotly_afterplot', function(e){
      if (initial_load_done === false) {
        initial_load_done = true;
        config.on_loaded();
      }

      if (chart._pagerides_noevt) {
        chart._pagerides_noevt = false;
        return;
      }

      for (var i = 0; i < config.charts.children.length; i++) {
        const charti = config.charts.children[i];
        if (!charti.is_chart) {
          continue;
        }
        if (charti == chart) {
          continue;
        }

        charti._pagerides_noevt = true;
        Plotly.relayout(charti, {
          xaxis: {
            range: chart.layout.xaxis.range.slice(0)
          },
        });
      }
    });
  }

  exports.init = function(_config) {
    config = _config;
    i18n_strings = config.i18n_strings;

    //config.progressbar.determinate = false;

    init_video(config.video_id);
  };

  exports.load_data = function() {
    load_data(config.data_file, config.data_format);
  }

  return exports;
})();