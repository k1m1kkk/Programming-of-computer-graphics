(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};

  class ColorView {
    constructor(controller) {
      this.controller = controller;
      this.modelElements = new Map();
      this.modelsContainer = document.getElementById('models');
      this.buildModelCards();
      this.bindSettings();
      this.controller.subscribe((state) => this.render(state));
    }

    buildModelCards() {
      ['cmyk', 'lab', 'rgb'].forEach((model) => {
        const meta = Lab.ColorModel.MODEL_META[model];
        const article = document.createElement('article');
        article.className = 'card model-card';
        article.dataset.model = model;

        const heading = document.createElement('div');
        heading.className = 'model-heading';

        const title = document.createElement('h2');
        title.textContent = meta.title;

        const palette = document.createElement('input');
        palette.type = 'color';
        palette.className = 'model-color-picker';
        palette.setAttribute('aria-label', `Выбрать цвет для модели ${meta.title}`);
        palette.title = 'Выбрать цвет из палитры';

        heading.append(title, palette);
        article.appendChild(heading);

        const channelElements = [];
        meta.channels.forEach((channel, index) => {
          const row = document.createElement('div');
          row.className = 'channel-row';

          const top = document.createElement('div');
          top.className = 'channel-top';

          const label = document.createElement('label');
          label.textContent = channel.key;

          const number = document.createElement('input');
          number.type = 'number';
          number.min = String(channel.min);
          number.max = String(channel.max);
          number.step = String(channel.step);
          number.className = 'channel-number';
          number.setAttribute('aria-label', `${meta.title} ${channel.key}`);

          top.append(label, number);

          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = String(channel.min);
          slider.max = String(channel.max);
          slider.step = String(channel.step);
          slider.className = 'channel-slider';
          slider.setAttribute('aria-label', `${meta.title} ${channel.key}`);

          const limits = document.createElement('div');
          limits.className = 'channel-limits';
          limits.innerHTML = `<span>${channel.min}</span><span>${channel.max}</span>`;

          row.append(top, slider, limits);
          article.appendChild(row);

          const update = (value) => {
            if (!Number.isFinite(value)) return;
            const safeValue = Math.min(channel.max, Math.max(channel.min, value));
            const values = this.controller.state[model].slice();
            values[index] = safeValue;
            this.controller.setColor(model, values);
          };

          slider.addEventListener('input', () => update(Number(slider.value)));
          number.addEventListener('input', () => {
            if (number.value.trim() === '') return;
            update(Number(number.value));
          });
          number.addEventListener('change', () => update(Number(number.value)));

          channelElements.push({ number, slider, channel, index });
        });

        palette.addEventListener('input', () => this.controller.setFromPalette(model, palette.value));
        this.modelsContainer.appendChild(article);
        this.modelElements.set(model, { article, palette, channels: channelElements });
      });
    }

    bindSettings() {
      const illuminant = document.getElementById('illuminant');
      const cmykAlgorithm = document.getElementById('cmyk-algorithm');
      const gamut = document.getElementById('gamut-strategy');
      const ucrThreshold = document.getElementById('ucr-threshold');

      illuminant.addEventListener('change', () => this.controller.setSetting('illuminant', illuminant.value));
      cmykAlgorithm.addEventListener('change', () => this.controller.setSetting('cmykAlgorithm', cmykAlgorithm.value));
      gamut.addEventListener('change', () => this.controller.setSetting('gamutStrategy', gamut.value));
      ucrThreshold.addEventListener('input', () => this.controller.setSetting('ucrShadowThreshold', Number(ucrThreshold.value) / 100));
    }

    formatValue(value) {
      if (Math.abs(value) < 0.0005) return '0';
      return Number(value.toFixed(2)).toString();
    }

    render(state) {
      document.getElementById('hero-color').style.background = state.hex;
      document.getElementById('hero-hex').textContent = state.hex.toUpperCase();

      document.getElementById('illuminant').value = state.settings.illuminant;
      document.getElementById('cmyk-algorithm').value = state.settings.cmykAlgorithm;
      document.getElementById('gamut-strategy').value = state.settings.gamutStrategy;
      document.getElementById('ucr-setting').hidden = state.settings.cmykAlgorithm !== 'ucr';
      document.getElementById('ucr-threshold').value = String(Math.round(state.settings.ucrShadowThreshold * 100));
      document.getElementById('ucr-threshold-value').textContent = `${Math.round(state.settings.ucrShadowThreshold * 100)}%`;

      this.modelElements.forEach((elements, model) => {
        elements.palette.value = state.hex;
        elements.article.classList.toggle('is-source', state.sourceModel === model);
        const values = state[model];

        elements.channels.forEach(({ number, slider, channel, index }) => {
          const value = values[index];
          const mappedLabInput = state.gamut.outOfGamut && state.sourceModel === 'lab' && model === 'lab';
          if (document.activeElement !== number || mappedLabInput) {
            number.value = this.formatValue(value);
          }
          slider.value = String(Math.min(channel.max, Math.max(channel.min, value)));
          slider.style.backgroundImage = this.controller.gradientFor(model, index);
        });
      });

      this.renderWarning(state);
    }

    renderWarning(state) {
      const warning = document.getElementById('warning');
      if (!state.gamut.outOfGamut) {
        warning.hidden = true;
        warning.textContent = '';
        return;
      }

      const raw = state.gamut.original.map((value) => value.toFixed(2)).join(', ');
      const strategy = state.settings.gamutStrategy === 'scaling' ? 'Scaling' : 'Clipping';
      warning.hidden = false;
      warning.innerHTML = `Цвет выходит за диапазон RGB: RGB(${raw}). Применено <strong>${strategy}</strong>; LAB и CMYK пересчитаны по скорректированному RGB.`;
    }
  }

  Lab.ColorView = ColorView;
})(globalThis);
