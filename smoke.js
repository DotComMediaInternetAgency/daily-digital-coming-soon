/**
 * Interactive WebGL aurora and ambient smoke background
 *
 * Implements a GPU-accelerated fluid simulation with:
 * - Navier-Stokes velocity advection, vorticity confinement, and Jacobi pressure solver
 * - Aurora Borealis palette: Electric Cyan (#00B0F8), Aurora Mint (#00FFA3),
 *   Deep Cobalt (#0052D4), Cosmic Violet (#7928CA), and Radiant Azure (#54D3FF)
 * - Multi-stream autonomous wave ribbons drifting like northern lights curtains
 * - Spontaneous randomized smoke splats across the viewport
 * - High-intensity, velocity-reactive mouse & touch trails that cut through the aurora
 * - Visibility-aware throttling (0% CPU/GPU when tab is hidden)
 * - Reduced motion support (prefers-reduced-motion)
 * - Graceful Canvas 2D fallback
 */

(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.getElementById("smoke-canvas");
  if (!canvas) return;

  if (prefersReduced) {
    canvas.style.display = "none";
    return;
  }

  // Configuration constants
  const CONFIG = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 0.991, // Lingers as wide, silky aurora curtains
    VELOCITY_DISSIPATION: 0.985,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 16,
    CURL: 36.0,
    SPLAT_RADIUS_MOUSE: 0.0055,
    SPLAT_RADIUS_AURORA: 0.0095,
    SPLAT_FORCE: 6200,
    RANDOM_BURST_INTERVAL: 32, // Frames between random atmospheric splats everywhere
  };

  // Aurora Borealis palette (Electric Cyan, Emerald/Mint, Cobalt, Cosmic Violet, Radiant Azure)
  const AURORA_PALETTE = [
    { r: 0.0, g: 0.69, b: 0.97 },  // Electric Cyan #00B0F8
    { r: 0.0, g: 1.0, b: 0.64 },   // Aurora Mint/Emerald #00FFA3
    { r: 0.0, g: 0.32, b: 0.83 },  // Deep Cobalt #0052D4
    { r: 0.47, g: 0.16, b: 0.79 }, // Cosmic Violet #7928CA
    { r: 0.33, g: 0.83, b: 1.0 },  // Radiant Azure #54D3FF
    { r: 0.0, g: 0.92, b: 0.82 }   // Glacial Turquoise #00EBD1
  ];

  let gl = null;
  let ext = null;

  try {
    const params = {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    };
    gl = canvas.getContext("webgl2", params);
    const isWebGL2 = Boolean(gl);
    if (!isWebGL2) {
      gl = canvas.getContext("webgl", params) || canvas.getContext("experimental-webgl", params);
    }
    if (gl) {
      ext = getWebGLSupport(gl, isWebGL2);
    }
  } catch (e) {
    gl = null;
  }

  if (!gl || !ext || !ext.formatRGBA) {
    startCanvas2DFallback(canvas);
    return;
  }

  function getWebGLSupport(gl, isWebGL2) {
    let halfFloat = null;
    let supportLinearFiltering = null;

    if (isWebGL2) {
      gl.getExtension("EXT_color_buffer_float");
      supportLinearFiltering = gl.getExtension("OES_texture_float_linear");
      return {
        gl,
        isWebGL2: true,
        halfFloatTexType: gl.HALF_FLOAT,
        formatRGBA: getSupportedFormat(gl, true, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),
        formatRG: getSupportedFormat(gl, true, gl.RG16F, gl.RG, gl.HALF_FLOAT),
        formatR: getSupportedFormat(gl, true, gl.R16F, gl.RED, gl.HALF_FLOAT),
        supportLinear: Boolean(supportLinearFiltering),
      };
    } else {
      halfFloat = gl.getExtension("OES_texture_half_float");
      supportLinearFiltering = gl.getExtension("OES_texture_half_float_linear");
      const halfFloatType = halfFloat ? halfFloat.HALF_FLOAT_OES : gl.FLOAT;
      return {
        gl,
        isWebGL2: false,
        halfFloatTexType: halfFloatType,
        formatRGBA: getSupportedFormat(gl, false, gl.RGBA, gl.RGBA, halfFloatType),
        formatRG: getSupportedFormat(gl, false, gl.RGBA, gl.RGBA, halfFloatType),
        formatR: getSupportedFormat(gl, false, gl.RGBA, gl.RGBA, halfFloatType),
        supportLinear: Boolean(supportLinearFiltering),
      };
    }
  }

  function getSupportedFormat(gl, isWebGL2, internalFormat, format, type) {
    if (!supportRenderTexture(gl, isWebGL2, internalFormat, format, type)) {
      if (isWebGL2) {
        return getSupportedFormat(gl, true, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);
      } else {
        return getSupportedFormat(gl, false, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);
      }
    }
    return { internalFormat, format };
  }

  function supportRenderTexture(gl, isWebGL2, internalFormat, format, type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);

    return status === gl.FRAMEBUFFER_COMPLETE;
  }

  // GLSL Shader Sources
  const baseVertexShader = `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const clearShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    void main () {
      gl_FragColor = value * texture2D(uTexture, vUv);
    }
  `;

  const displayShader = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      // Vibrant aurora tone curve: deep obsidian base with glowing ribbons
      vec3 col = c * 1.52;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      gl_FragColor = vec4(col, clamp(lum * 1.25, 0.0, 1.0));
    }
  `;

  const splatShader = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    void main () {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }
  `;

  const advectionShader = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;
    void main () {
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      gl_FragColor = dissipation * texture2D(uSource, coord);
    }
  `;

  const divergenceShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; }
      if (vR.x > 1.0) { R = -C.x; }
      if (vT.y > 1.0) { T = -C.y; }
      if (vB.y < 0.0) { B = -C.y; }
      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `;

  const curlShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      float vorticity = R - L - T + B;
      gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
  `;

  const vorticityShader = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 vel = texture2D(uVelocity, vUv).xy;
      gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
    }
  `;

  const pressureShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).y;
      float B = texture2D(uPressure, vB).y;
      float C = texture2D(uPressure, vUv).x;
      float div = texture2D(uDivergence, vUv).x;
      float pressure = (L + R + B + T - div) * 0.25;
      gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
  `;

  const gradientSubtractShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).y;
      float B = texture2D(uPressure, vB).y;
      vec2 vel = texture2D(uVelocity, vUv).xy;
      vel.xy -= vec2(R - L, T - B);
      gl_FragColor = vec4(vel, 0.0, 1.0);
    }
  `;

  class Program {
    constructor(vertexShaderSource, fragmentShaderSource) {
      this.program = createProgram(vertexShaderSource, fragmentShaderSource);
      this.uniforms = getUniforms(this.program);
    }
    bind() {
      gl.useProgram(this.program);
    }
  }

  function createProgram(vertexSource, fragmentSource) {
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    return program;
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  function getUniforms(program) {
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i).name;
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return uniforms;
  }

  // Compile Programs
  const clearProgram = new Program(baseVertexShader, clearShader);
  const displayProgram = new Program(baseVertexShader, displayShader);
  const splatProgram = new Program(baseVertexShader, splatShader);
  const advectionProgram = new Program(baseVertexShader, advectionShader);
  const divergenceProgram = new Program(baseVertexShader, divergenceShader);
  const curlProgram = new Program(baseVertexShader, curlShader);
  const vorticityProgram = new Program(baseVertexShader, vorticityShader);
  const pressureProgram = new Program(baseVertexShader, pressureShader);
  const gradSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);

  // Fullscreen Quad Geometry
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  function blit(target) {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  function createFBO(w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      }
    };
  }

  function createDoubleFBO(w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);
    return {
      width: w,
      height: h,
      texelSizeX: 1.0 / w,
      texelSizeY: 1.0 / h,
      get read() { return fbo1; },
      set read(val) { fbo1 = val; },
      get write() { return fbo2; },
      set write(val) { fbo2 = val; },
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      }
    };
  }

  let density = null;
  let velocity = null;
  let divergence = null;
  let curl = null;
  let pressure = null;

  function initFBOs() {
    const filtering = ext.supportLinear ? gl.LINEAR : gl.NEAREST;
    const simRes = getResolution(CONFIG.SIM_RESOLUTION);
    const dyeRes = getResolution(CONFIG.DYE_RESOLUTION);

    density = createDoubleFBO(dyeRes.width, dyeRes.height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, ext.halfFloatTexType, filtering);
    velocity = createDoubleFBO(simRes.width, simRes.height, ext.formatRG.internalFormat, ext.formatRG.format, ext.halfFloatTexType, filtering);
    divergence = createFBO(simRes.width, simRes.height, ext.formatR.internalFormat, ext.formatR.format, ext.halfFloatTexType, gl.NEAREST);
    curl = createFBO(simRes.width, simRes.height, ext.formatR.internalFormat, ext.formatR.format, ext.halfFloatTexType, gl.NEAREST);
    pressure = createDoubleFBO(simRes.width, simRes.height, ext.formatR.internalFormat, ext.formatR.format, ext.halfFloatTexType, gl.NEAREST);
  }

  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
      return { width: max, height: min };
    } else {
      return { width: min, height: max };
    }
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      initFBOs();
      return true;
    }
    return false;
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Splats & Simulation
  const splatStack = [];
  let colorIndex = 0;

  function splat(x, y, dx, dy, color, radiusScale) {
    const radiusMultiplier = radiusScale || 1.0;
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius((CONFIG.SPLAT_RADIUS_MOUSE * radiusMultiplier) / 100.0));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, density.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(density.write);
    density.swap();
  }

  function correctRadius(radius) {
    const aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
  }

  function step(dt) {
    gl.disable(gl.BLEND);

    // 1. Curl & Vorticity Confinement
    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, CONFIG.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    // 2. Divergence
    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    // 3. Clear pressure
    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, CONFIG.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    // 4. Pressure Solve (Jacobi)
    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    // 5. Subtract Gradient
    gradSubtractProgram.bind();
    gl.uniform2f(gradSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    // 6. Advect Velocity
    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read.attach(0));
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, CONFIG.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    // 7. Advect Density (Smoke Dye)
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, density.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, CONFIG.DENSITY_DISSIPATION);
    blit(density.write);
    density.swap();
  }

  // Pointer Interaction
  const pointer = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    moved: false,
    down: false
  };

  function updatePointerMove(clientX, clientY) {
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.x = clientX / window.innerWidth;
    pointer.y = 1.0 - (clientY / window.innerHeight);
    pointer.moved = true;

    const dx = (pointer.x - pointer.prevX) * CONFIG.SPLAT_FORCE;
    const dy = (pointer.y - pointer.prevY) * CONFIG.SPLAT_FORCE;

    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      colorIndex = (colorIndex + 1) % AURORA_PALETTE.length;
      const color = AURORA_PALETTE[colorIndex];
      splatStack.push({
        x: pointer.x,
        y: pointer.y,
        dx: dx,
        dy: dy,
        color: color,
        radiusScale: 1.25
      });
    }
  }

  window.addEventListener("mousemove", (e) => {
    updatePointerMove(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (e.touches.length > 0) {
      updatePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  window.addEventListener("touchstart", (e) => {
    if (e.touches.length > 0) {
      pointer.x = e.touches[0].clientX / window.innerWidth;
      pointer.y = 1.0 - (e.touches[0].clientY / window.innerHeight);
    }
  }, { passive: true });

  // Initial introductory aurora curtain splats
  setTimeout(() => {
    for (let i = 0; i < 6; i++) {
      const px = 0.15 + i * 0.14;
      const py = 0.45 + Math.sin(i * 0.9) * 0.25;
      splatStack.push({
        x: px,
        y: py,
        dx: Math.cos(i) * 220,
        dy: Math.sin(i) * 220 + 80,
        color: AURORA_PALETTE[i % AURORA_PALETTE.length],
        radiusScale: 1.8
      });
    }
  }, 80);

  // Northern Lights Autonomous Aurora Ribbon Generators
  // 3 continuous wave oscillators moving at varied frequencies and phase angles
  const auroraStreams = [
    { freqX: 0.28, freqY: 0.35, ampX: 0.44, ampY: 0.20, baseY: 0.72, phase: 0.0, colorIdx: 1 },  // Upper emerald curtain
    { freqX: 0.22, freqY: 0.30, ampX: 0.42, ampY: 0.22, baseY: 0.48, phase: 1.8, colorIdx: 0 },  // Mid electric cyan wave
    { freqX: 0.18, freqY: 0.26, ampX: 0.46, ampY: 0.18, baseY: 0.28, phase: 3.4, colorIdx: 4 },  // Lower radiant azure drift
  ];

  let lastTime = Date.now();
  let frameCount = 0;
  let isTabActive = true;

  document.addEventListener("visibilitychange", () => {
    isTabActive = document.visibilityState === "visible";
    if (isTabActive) {
      lastTime = Date.now();
      requestAnimationFrame(update);
    }
  });

  function update() {
    if (!isTabActive) return;

    const now = Date.now();
    let dt = Math.min((now - lastTime) / 1000, 0.02);
    lastTime = now;
    frameCount++;

    const t = frameCount * 0.02;

    // 1. Continuous Northern Lights Aurora Ribbon Waves
    // Each stream injects soft, broad dye along its undulating path
    if (frameCount % 6 === 0) {
      auroraStreams.forEach((stream, idx) => {
        const streamTime = t + stream.phase;
        const ax = 0.5 + Math.sin(streamTime * stream.freqX) * stream.ampX;
        const ay = stream.baseY + Math.cos(streamTime * stream.freqY) * stream.ampY;

        // Tangential wave velocity creates organic vertical folding
        const vx = Math.cos(streamTime * stream.freqX) * 90;
        const vy = -Math.sin(streamTime * stream.freqY) * 70 + (Math.sin(streamTime * 2.0) * 40);

        // Cycle through aurora palette smoothly
        const col = AURORA_PALETTE[(stream.colorIdx + Math.floor(frameCount / 90)) % AURORA_PALETTE.length];

        splat(ax, ay, vx, vy, col, 1.8);
      });
    }

    // 2. Random Spontaneous Smokes Everywhere
    // Injects ethereal billowing smoke puffs at randomized positions across the screen
    if (frameCount % CONFIG.RANDOM_BURST_INTERVAL === 0) {
      const rx = 0.05 + Math.random() * 0.90;
      const ry = 0.10 + Math.random() * 0.80;
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 180;
      const randomCol = AURORA_PALETTE[Math.floor(Math.random() * AURORA_PALETTE.length)];

      splat(
        rx,
        ry,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        randomCol,
        1.5 + Math.random() * 1.0
      );
    }

    // 3. Process Queued User Splats (Mouse & Touch)
    while (splatStack.length > 0) {
      const s = splatStack.pop();
      splat(s.x, s.y, s.dx, s.dy, s.color, s.radiusScale || 1.0);
    }

    step(dt);

    // 4. Final Display Composition
    displayProgram.bind();
    gl.uniform1i(displayProgram.uniforms.uTexture, density.read.attach(0));
    blit(null);

    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);

  // --------------------------------------------------------------------------
  // Upgraded Canvas 2D Fallback with Aurora Waves & Random Bursts
  // --------------------------------------------------------------------------
  function startCanvas2DFallback(cvs) {
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    let width = (cvs.width = window.innerWidth);
    let height = (cvs.height = window.innerHeight);

    window.addEventListener("resize", () => {
      width = cvs.width = window.innerWidth;
      height = cvs.height = window.innerHeight;
    });

    const particles = [];
    const colors = [
      "rgba(0, 176, 248, ",  // Cyan
      "rgba(0, 255, 163, ",  // Mint
      "rgba(0, 82, 212, ",   // Cobalt
      "rgba(121, 40, 202, ", // Violet
      "rgba(84, 211, 255, "  // Azure
    ];

    function spawn(x, y, count, baseRadius) {
      const n = count || 4;
      const rad = baseRadius || 45;
      for (let i = 0; i < n; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 30,
          y: y + (Math.random() - 0.5) * 30,
          vx: (Math.random() - 0.5) * 2.2,
          vy: (Math.random() - 0.5) * 2.2 - 0.4,
          radius: rad + Math.random() * 50,
          alpha: 0.38,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }

    window.addEventListener("mousemove", (e) => spawn(e.clientX, e.clientY, 4, 45), { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (e.touches[0]) spawn(e.touches[0].clientX, e.touches[0].clientY, 4, 45);
    }, { passive: true });

    let count2d = 0;
    function loop() {
      count2d++;
      ctx.fillStyle = "rgba(6, 8, 12, 0.12)";
      ctx.fillRect(0, 0, width, height);

      // Autonomous aurora drifting particles
      if (count2d % 8 === 0) {
        const ax = (0.5 + Math.sin(count2d * 0.015) * 0.4) * width;
        const ay = (0.4 + Math.cos(count2d * 0.02) * 0.25) * height;
        spawn(ax, ay, 2, 70);
      }

      // Random spontaneous bursts everywhere
      if (count2d % 40 === 0) {
        spawn(Math.random() * width, Math.random() * height, 3, 60);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.radius += 0.9;
        p.alpha -= 0.005;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, p.color + p.alpha + ")");
        grad.addColorStop(1, p.color + "0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(loop);
    }

    loop();
  }
})();
