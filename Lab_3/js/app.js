(function () {
  'use strict';

  const L = window.Lab3;
  const $ = (id) => document.getElementById(id);
  const state = {
    width: 0,
    height: 0,
    rgba: null,
    gray: null,
    resultGray: null,
    resultRgba: null
  };

  const sourceCanvas = $('sourceCanvas');
  const resultCanvas = $('resultCanvas');
  const compareCanvas = $('compareCanvas');
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const resultCtx = resultCanvas.getContext('2d', { willReadFrequently: true });
  const compareCtx = compareCanvas.getContext('2d', { willReadFrequently: true });

  function hasResult() {
    return !!(state.resultGray || state.resultRgba);
  }

  function setProgress(value, text) {
    const v = Math.max(0, Math.min(1, value));
    $('progressBar').style.width = Math.round(v * 100) + '%';
    $('progressText').textContent = text || (v >= 1 ? 'Готово' : Math.round(v * 100) + '%');
  }

  function setBusy(busy) {
    $('processBtn').disabled = busy || !state.gray;
    $('compareBtn').disabled = busy || !state.gray || $('categorySelect').value !== 'global';
  }

  function shouldParallelize() {
    return state.gray && state.gray.length >= 250000 && L.canUseWorkers();
  }

  function drawRgba(canvas, ctx, rgba, width, height) {
    canvas.width = width;
    canvas.height = height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }

  function drawGray(canvas, ctx, gray, width, height) {
    drawRgba(canvas, ctx, L.grayToRgba(gray), width, height);
  }

  function drawEmpty(canvas, ctx, text) {
    canvas.width = 700;
    canvas.height = 420;
    ctx.fillStyle = '#eef0f3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#68707d';
    ctx.font = '20px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  function prepareHistogramCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = Math.round((height * i) / 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    return { ctx, width, height };
  }

  function drawGrayHistogram(canvas, gray) {
    const surface = prepareHistogramCanvas(canvas);
    if (!gray) return;
    const histogram = L.histogram256(gray);
    let max = 1;
    for (let i = 0; i < 256; i += 1) if (histogram[i] > max) max = histogram[i];
    const logMax = Math.log1p(max);
    const barWidth = surface.width / 256;
    surface.ctx.fillStyle = '#315efb';
    for (let i = 0; i < 256; i += 1) {
      const barHeight = (Math.log1p(histogram[i]) / logMax) * (surface.height - 14);
      surface.ctx.fillRect(i * barWidth, surface.height - barHeight, Math.max(1, barWidth), barHeight);
    }
  }

  function drawRgbHistogram(canvas, rgba) {
    const surface = prepareHistogramCanvas(canvas);
    if (!rgba) return;
    const histograms = L.rgbaHistograms(rgba);
    const series = [
      { values: histograms.red, color: 'rgba(220, 38, 38, 0.80)' },
      { values: histograms.green, color: 'rgba(22, 163, 74, 0.80)' },
      { values: histograms.blue, color: 'rgba(37, 99, 235, 0.80)' }
    ];
    let max = 1;
    for (const item of series) {
      for (let i = 0; i < 256; i += 1) if (item.values[i] > max) max = item.values[i];
    }
    const logMax = Math.log1p(max);
    for (const item of series) {
      surface.ctx.strokeStyle = item.color;
      surface.ctx.lineWidth = 1.4;
      surface.ctx.beginPath();
      for (let i = 0; i < 256; i += 1) {
        const x = (i / 255) * surface.width;
        const y = surface.height - (Math.log1p(item.values[i]) / logMax) * (surface.height - 14);
        if (i === 0) surface.ctx.moveTo(x, y);
        else surface.ctx.lineTo(x, y);
      }
      surface.ctx.stroke();
    }
  }

  function drawSourceHistogram() {
    if (!state.gray) {
      drawGrayHistogram($('histBefore'), null);
      return;
    }
    if ($('categorySelect').value === 'rank') drawRgbHistogram($('histBefore'), state.rgba);
    else drawGrayHistogram($('histBefore'), state.gray);
  }

  function resetResult() {
    state.resultGray = null;
    state.resultRgba = null;
    drawEmpty(resultCanvas, resultCtx, 'Запустите обработку');
    drawEmpty(compareCanvas, compareCtx, 'Сравнение методов');
    $('compareCard').classList.add('hidden');
    $('resultInfo').textContent = '—';
    $('compareInfo').textContent = '—';
    $('metricMethod').textContent = '—';
    $('metricTime').textContent = '—';
    $('metricParams').textContent = '—';
    drawGrayHistogram($('histAfter'), null);
    setBusy(false);
  }

  function updateSource() {
    drawRgba(sourceCanvas, sourceCtx, state.rgba, state.width, state.height);
    $('sourceInfo').textContent = state.width + ' × ' + state.height;
    drawSourceHistogram();
    resetResult();
    setProgress(1, 'Изображение загружено');
  }

  function loadImageUrl(url) {
    setBusy(true);
    setProgress(0.08, 'Загрузка…');
    const image = new Image();
    image.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        state.width = canvas.width;
        state.height = canvas.height;
        state.rgba = new Uint8ClampedArray(data.data);
        state.gray = L.rgbaToGray(state.rgba, state.width, state.height);
        updateSource();
      } catch (error) {
        console.error(error);
        setProgress(0, 'Не удалось прочитать изображение');
        setBusy(false);
      }
    };
    image.onerror = function () {
      setProgress(0, 'Не удалось загрузить изображение');
      setBusy(false);
    };
    image.src = url;
  }

  function fieldSelect(label, id, options) {
    const items = options.map((item) => '<option value="' + item[0] + '">' + item[1] + '</option>').join('');
    return '<label class="field"><span>' + label + '</span><select id="' + id + '">' + items + '</select></label>';
  }

  function fieldRange(label, id, min, max, step, value) {
    return '<label class="field"><span>' + label + '</span><div class="range-row"><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"><output id="' + id + 'Out">' + value + '</output></div></label>';
  }

  function checkBox(label, id) {
    return '<label class="checkline"><input id="' + id + '" type="checkbox"><span>' + label + '</span></label>';
  }

  function bindRange(id) {
    const input = $(id);
    const output = $(id + 'Out');
    if (!input || !output) return;
    input.addEventListener('input', function () { output.textContent = input.value; });
  }

  function renderRankOptions() {
    const method = $('rankMethod').value;
    const container = $('rankOptions');
    let html = fieldRange(method === 'adaptiveMedian' ? 'Максимальный радиус' : 'Радиус', 'rankRadius', 1, 6, 1, method === 'adaptiveMedian' ? 3 : 1);
    if (method === 'percentile') html += fieldRange('Процентиль', 'rankPercentile', 0, 100, 1, 50);
    html += fieldSelect('Обработка краёв', 'edgeMode', [['clamp', 'Clamp'], ['reflect', 'Reflect']]);
    container.innerHTML = html;
    bindRange('rankRadius');
    if (method === 'percentile') bindRange('rankPercentile');
  }

  function renderControls() {
    const category = $('categorySelect').value;
    const container = $('methodControls');

    if (category === 'global') {
      container.innerHTML = fieldSelect('Метод', 'globalMethod', [['otsu', 'Otsu'], ['intermeans', 'Iterative Intermeans']]) + checkBox('Инвертировать', 'invert');
      $('compareBtn').classList.remove('hidden');
    } else if (category === 'adaptive') {
      container.innerHTML = fieldRange('Радиус окна', 'adaptiveRadius', 3, 40, 1, 15) + fieldRange('Коэффициент k', 'adaptiveK', 0.05, 0.80, 0.01, 0.34) + checkBox('Инвертировать', 'invert');
      bindRange('adaptiveRadius');
      bindRange('adaptiveK');
      $('compareBtn').classList.add('hidden');
    } else {
      container.innerHTML = fieldSelect('Фильтр', 'rankMethod', [
        ['median', 'Медианный'],
        ['min', 'Минимум'],
        ['max', 'Максимум'],
        ['percentile', 'Процентильный'],
        ['adaptiveMedian', 'Адаптивный медианный']
      ]) + '<div id="rankOptions"></div>';
      $('rankMethod').addEventListener('change', renderRankOptions);
      renderRankOptions();
      $('compareBtn').classList.add('hidden');
    }

    drawSourceHistogram();
    resetResult();
    setBusy(false);
  }

  function finalizeGray(gray, title, parameters, elapsed) {
    state.resultGray = gray;
    state.resultRgba = null;
    drawGray(resultCanvas, resultCtx, gray, state.width, state.height);
    drawGrayHistogram($('histAfter'), gray);
    $('resultInfo').textContent = title;
    $('metricMethod').textContent = title;
    $('metricTime').textContent = elapsed.toFixed(1) + ' мс';
    $('metricParams').textContent = parameters || '—';
    $('compareCard').classList.add('hidden');
    setProgress(1, 'Готово');
    setBusy(false);
  }

  function finalizeRgba(rgba, title, parameters, elapsed) {
    state.resultRgba = rgba;
    state.resultGray = null;
    drawRgba(resultCanvas, resultCtx, rgba, state.width, state.height);
    drawRgbHistogram($('histAfter'), rgba);
    $('resultInfo').textContent = title;
    $('metricMethod').textContent = title;
    $('metricTime').textContent = elapsed.toFixed(1) + ' мс';
    $('metricParams').textContent = parameters || '—';
    $('compareCard').classList.add('hidden');
    setProgress(1, 'Готово');
    setBusy(false);
  }

  async function processCurrent() {
    if (!state.gray) return;
    setBusy(true);
    setProgress(0.03, 'Обработка…');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const category = $('categorySelect').value;
    const started = performance.now();

    try {
      if (category === 'global') {
        const method = $('globalMethod').value;
        const invert = $('invert').checked;
        let threshold;
        let title;
        let params;

        if (method === 'otsu') {
          threshold = L.otsuThreshold(state.gray);
          title = 'Otsu';
          params = 'порог = ' + threshold;
        } else {
          const value = L.iterativeIntermeansThreshold(state.gray);
          threshold = value.threshold;
          title = 'Iterative Intermeans';
          params = 'порог = ' + threshold + ', итераций = ' + value.iterations;
        }

        const output = L.applyGlobalThreshold(state.gray, threshold, invert);
        finalizeGray(output, title, params, performance.now() - started);
        return;
      }

      if (category === 'adaptive') {
        const radius = Number($('adaptiveRadius').value);
        const k = Number($('adaptiveK').value);
        const invert = $('invert').checked;
        const options = { radius, k, dynamicRange: 128, invert };
        let output;

        if (shouldParallelize()) {
          output = await L.parallelSauvola(state.gray, state.width, state.height, options, L.suggestedWorkerCount(), function (value) {
            setProgress(value, 'Обработка: ' + Math.round(value * 100) + '%');
          });
        } else {
          output = L.sauvolaThreshold(state.gray, state.width, state.height, options);
        }

        finalizeGray(output, 'Sauvola', 'радиус = ' + radius + ', k = ' + k, performance.now() - started);
        return;
      }

      const method = $('rankMethod').value;
      const radius = Number($('rankRadius').value);
      const edgeMode = $('edgeMode').value;
      const parallel = shouldParallelize();
      let output;
      let title;
      let params = 'радиус = ' + radius + ', края = ' + (edgeMode === 'reflect' ? 'Reflect' : 'Clamp');

      if (method === 'adaptiveMedian') {
        title = 'Адаптивный медианный фильтр';
        const options = { maxRadius: radius, edgeMode };
        if (parallel) {
          output = await L.parallelAdaptiveMedianRgba(state.rgba, state.width, state.height, options, L.suggestedWorkerCount(), function (value) {
            setProgress(value, 'Обработка: ' + Math.round(value * 100) + '%');
          });
        } else {
          output = L.adaptiveMedianRgba(state.rgba, state.width, state.height, options);
        }
      } else {
        let percentile = 0.5;
        title = 'Медианный фильтр';
        if (method === 'min') { percentile = 0; title = 'Фильтр минимума'; }
        if (method === 'max') { percentile = 1; title = 'Фильтр максимума'; }
        if (method === 'percentile') {
          percentile = Number($('rankPercentile').value) / 100;
          title = 'Процентильный фильтр';
          params += ', p = ' + Math.round(percentile * 100) + '%';
        }

        const options = { radius, percentile, edgeMode };
        if (parallel) {
          output = await L.parallelRankFilterRgba(state.rgba, state.width, state.height, options, L.suggestedWorkerCount(), function (value) {
            setProgress(value, 'Обработка: ' + Math.round(value * 100) + '%');
          });
        } else {
          output = L.rankFilterRgba(state.rgba, state.width, state.height, options);
        }
      }

      finalizeRgba(output, title, params, performance.now() - started);
    } catch (error) {
      console.error(error);
      setProgress(0, 'Ошибка обработки');
      setBusy(false);
    }
  }

  async function compareGlobalMethods() {
    if (!state.gray) return;
    setBusy(true);
    setProgress(0.05, 'Сравнение…');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const started = performance.now();
    const invert = $('invert').checked;

    const otsu = L.otsuThreshold(state.gray);
    const intermeans = L.iterativeIntermeansThreshold(state.gray);
    const first = L.applyGlobalThreshold(state.gray, otsu, invert);
    const second = L.applyGlobalThreshold(state.gray, intermeans.threshold, invert);

    state.resultGray = first;
    state.resultRgba = null;
    drawGray(resultCanvas, resultCtx, first, state.width, state.height);
    drawGray(compareCanvas, compareCtx, second, state.width, state.height);
    drawGrayHistogram($('histAfter'), first);
    $('resultInfo').textContent = 'Otsu · порог ' + otsu;
    $('compareInfo').textContent = 'Intermeans · порог ' + intermeans.threshold;
    $('compareCard').classList.remove('hidden');
    $('metricMethod').textContent = 'Otsu / Iterative Intermeans';
    $('metricTime').textContent = (performance.now() - started).toFixed(1) + ' мс';
    $('metricParams').textContent = 'пороги = ' + otsu + ' / ' + intermeans.threshold;
    setProgress(1, 'Готово');
    setBusy(false);
  }

  $('categorySelect').addEventListener('change', renderControls);
  $('processBtn').addEventListener('click', processCurrent);
  $('compareBtn').addEventListener('click', compareGlobalMethods);

  $('fileInput').addEventListener('change', function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () { loadImageUrl(reader.result); };
    reader.readAsDataURL(file);
  });

  document.querySelectorAll('.test-image').forEach(function (button) {
    button.addEventListener('click', function () {
      const src = button.dataset.src;
      const embedded = L.TEST_IMAGES && L.TEST_IMAGES[src];
      loadImageUrl(embedded || src);
    });
  });

  drawEmpty(sourceCanvas, sourceCtx, 'Загрузите изображение');
  drawEmpty(resultCanvas, resultCtx, 'Запустите обработку');
  drawGrayHistogram($('histBefore'), null);
  drawGrayHistogram($('histAfter'), null);
  renderControls();
})();
