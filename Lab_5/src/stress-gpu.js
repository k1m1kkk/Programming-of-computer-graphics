export class StressRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!this.gl) throw new Error('WebGL2 is not available.');
    const gl = this.gl;
    const vertex = `#version 300 es
    in vec2 a_position;
    uniform vec2 u_center;
    uniform vec2 u_size;
    uniform vec2 u_shift;
    uniform float u_scale;
    void main() {
      vec2 p = (a_position + u_shift - u_center) * u_scale;
      gl_Position = vec4(2.0 * p.x / u_size.x, 2.0 * p.y / u_size.y, 0.0, 1.0);
    }`;
    const fragment = `#version 300 es
    precision mediump float;
    out vec4 fragColor;
    void main() { fragColor = vec4(0.067, 0.584, 0.427, 0.98); }`;
    const shader = (type, source) => {
      const handle = gl.createShader(type);
      gl.shaderSource(handle, source); gl.compileShader(handle);
      if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(handle));
      return handle;
    };
    this.program = gl.createProgram();
    gl.attachShader(this.program, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    this.buffer = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const index = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(['u_center', 'u_size', 'u_shift', 'u_scale']
      .map(name => [name, gl.getUniformLocation(this.program, name)]));
    this.vertices = 0;
  }
  upload(packed) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const input = packed instanceof Float32Array ? packed : Float32Array.from(packed);
    gl.bufferData(gl.ARRAY_BUFFER, input, gl.DYNAMIC_DRAW);
    this.vertices = input.length / 2;
  }
  draw(camera, width, height, ratio, r, shift) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.vertices) return;
    const left = Math.max(0, Math.floor(((r.xmin - camera.x) * camera.scale + width / 2) * ratio));
    const right = Math.min(this.canvas.width, Math.ceil(((r.xmax - camera.x) * camera.scale + width / 2) * ratio));
    const bottom = Math.max(0, Math.floor(((r.ymin - camera.y) * camera.scale + height / 2) * ratio));
    const top = Math.min(this.canvas.height, Math.ceil(((r.ymax - camera.y) * camera.scale + height / 2) * ratio));
    if (right <= left || top <= bottom) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, bottom, right - left, top - bottom);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uniforms.u_center, camera.x, camera.y);
    gl.uniform2f(this.uniforms.u_size, width, height);
    gl.uniform2f(this.uniforms.u_shift, shift.x, shift.y);
    gl.uniform1f(this.uniforms.u_scale, camera.scale);
    gl.drawArrays(gl.LINES, 0, this.vertices);
    gl.disable(gl.SCISSOR_TEST);
  }
}
