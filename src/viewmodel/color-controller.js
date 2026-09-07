(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};

  class ColorController {
    constructor() {
      this.settings = {
        illuminant: 'D65',
        cmykAlgorithm: 'gcr',
        gamutStrategy: 'clipping',
        ucrShadowThreshold: 0.5
      };
      this.sourceModel = 'rgb';
      this.sourceValues = [66, 135, 245];
      this.listeners = new Set();
      this.state = this.computeState();
    }

    computeState() {
      const converted = Lab.ColorModel.convert(this.sourceModel, this.sourceValues, this.settings);
      const matrices = Lab.Illuminants.calculateRgbXyzMatrices(this.settings.illuminant);
      return {
        ...converted,
        settings: { ...this.settings },
        sourceModel: this.sourceModel,
        sourceValues: this.sourceValues.slice(),
        hex: Lab.ColorModel.rgbToHex(converted.rgb),
        xy: Lab.ColorModel.xyFromXyz(converted.xyz),
        matrices
      };
    }

    subscribe(listener) {
      this.listeners.add(listener);
      listener(this.state);
      return () => this.listeners.delete(listener);
    }

    notify() {
      this.state = this.computeState();
      this.listeners.forEach((listener) => listener(this.state));
    }

    setColor(model, values) {
      this.sourceModel = model;
      this.sourceValues = values.map(Number);
      this.notify();
    }

    setSetting(name, value) {
      if (!(name in this.settings)) {
        throw new Error(`Unknown setting: ${name}`);
      }
      this.settings[name] = name === 'ucrShadowThreshold' ? Number(value) : value;
      this.notify();
    }

    setFromPalette(model, hex) {
      const rgb = Lab.ColorModel.hexToRgb(hex);
      const rgbState = Lab.ColorModel.fromRgb(rgb, this.settings);
      if (model === 'rgb') {
        this.setColor('rgb', rgbState.rgb);
      } else if (model === 'cmyk') {
        this.setColor('cmyk', rgbState.cmyk);
      } else {
        this.setColor('lab', rgbState.lab);
      }
    }

    setFromHex(hex) {
      this.setColor('rgb', Lab.ColorModel.hexToRgb(hex));
    }

    gradientFor(model, channelIndex, stops) {
      const meta = Lab.ColorModel.MODEL_META[model];
      const count = stops || 17;
      const current = this.state[model].slice();
      const channel = meta.channels[channelIndex];
      const segments = [];
      for (let i = 0; i < count; i += 1) {
        const ratio = i / (count - 1);
        const sample = current.slice();
        sample[channelIndex] = channel.min + (channel.max - channel.min) * ratio;
        const rgb = Lab.ColorModel.convert(model, sample, this.settings).rgb;
        const css = `rgb(${rgb.map((value) => Math.round(value)).join(', ')})`;
        segments.push(`${css} ${(ratio * 100).toFixed(2)}%`);
      }
      return `linear-gradient(90deg, ${segments.join(', ')})`;
    }
  }

  Lab.ColorController = ColorController;
})(globalThis);
