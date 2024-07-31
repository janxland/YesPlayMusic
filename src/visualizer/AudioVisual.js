/* eslint-disable */
export class AudioVisual {
  constructor(canvas, audio, options) {
    this.canvas = canvas;
    this.audio = audio;
    console.log(canvas.width);
    this.WIDTH = canvas.width;
    this.HEIGHT = canvas.height;
    this.defaultSetting = {
      centerX: 0.5,
      centerY: 0.7,
      lineWidth: 10,
      lineSpacing: 8,
      lineColor: '#e93b81',
      lineColorO: 1,
      shadowColor: '#231018',
      shadowColorO: 1,
      shadowBlur: 10,
      isRound: true,
      circleEdge: 1.618,
      circleSplit: 2,
      circleRadius: 100,
      circleRange: 360,
      fftSize: 7,
      type: 1,
    };
    this.opt = Object.assign({}, this.defaultSetting, options);
    this.init();
  }
  init() {}
  setSetting(options) {
    this.opt = Object.assign({}, this.defaultSetting, options);
    console.log(Number(this.opt.fftSize));
    this.analyser.fftSize = Math.pow(2, Number(this.opt.fftSize)) || 128;
  }
  changeMediaElementSource(audio) {
    this.audio = audio;
    this.MediaSource = this.AudioContext.createMediaElementSource(this.audio);

    // 将 MediaElementAudioSourceNode 连接到 AnalyserNode
    this.MediaSource.connect(this.analyser);

    // 将 AnalyserNode 连接到输出（destination）
    this.analyser.connect(this.AudioContext.destination);
  }
  loadMusic(audioContext, audio) {
    this.AudioContext = audioContext || new AudioContext();
    // 获取画布上下文
    this.CanvasContext = this.canvas.getContext('2d');

    // 创建 AnalyserNode
    this.analyser = this.AudioContext.createAnalyser();
    // this.analyser.fftSize = 360;

    // 创建 MediaElementAudioSourceNode
    this.MediaSource = this.AudioContext.createMediaElementSource(
      audio || this.audio
    );

    this.MediaSource.connect(this.analyser);
    this.analyser.connect(this.AudioContext.destination);
    console.log('成功加载音乐');

    let th = this;
    function renderFrame() {
      let typeMap = ['drawRect', 'drawCircle'];
      th[typeMap[th.opt.type]]?.();
      th.animation = requestAnimationFrame(renderFrame);
    }
    renderFrame();
  }
  drawCircle() {
    this.audio.crossOrigin = 'anonymous';
    const { CanvasContext, WIDTH, HEIGHT, analyser } = this;
    let {
      lineColor,
      lineColorO,
      shadowColor,
      shadowColorO,
      shadowBlur,
      lineWidth,
      isRound,
      circleSplit,
      circleEdge,
      circleRange,
      circleRadius, // 添加中间空圆的半径
    } = this.opt;
    let bufferLength = Number(circleRange);
    let buffer = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(buffer);

    let cx = WIDTH * this.opt.centerX;
    let cy = HEIGHT * this.opt.centerY;

    CanvasContext.clearRect(0, 0, WIDTH, HEIGHT);
    CanvasContext.beginPath();
    CanvasContext.shadowBlur = shadowBlur;
    CanvasContext.strokeStyle = `rgba(${this.colorToRGB(lineColor).join(
      ','
    )}, ${lineColorO})`;
    CanvasContext.shadowColor = `rgba(${this.colorToRGB(shadowColor).join(
      ','
    )}, ${shadowColorO})`;
    CanvasContext.lineWidth = lineWidth;
    if (isRound) {
      CanvasContext.lineCap = 'round';
    } else {
      CanvasContext.lineCap = 'butt';
    }
    const kickEnergy =
      buffer
        .slice(0, buffer.length / 4)
        .reduce((sum, value) => sum + value, 0) /
      (buffer.length / 4);
    console.log(kickEnergy);
    circleRadius += kickEnergy * circleEdge * 1.618;
    for (let i = 0; i < bufferLength; i++) {
      if(i < 60 ) continue
      let value = buffer[i];
      if (i % (circleSplit || 3) != 0) continue;
      let angle = (Math.PI * (i * 1)) / 180; // 计算角度
      value = Math.max(5, value);
      let R1 = circleRadius - (value / 600) * circleRadius * circleEdge;
      let R2 = circleRadius + (value / 256) * circleRadius * circleEdge;
      CanvasContext.moveTo(
        cx + Math.cos(angle) * R1,
        cy + Math.sin(angle) * R1
      );
      CanvasContext.lineTo(
        cx + Math.cos(angle) * R2,
        cy + Math.sin(angle) * R2
      );
    }
    CanvasContext.stroke();
    CanvasContext.closePath();
  }
  drawRect() {
    this.audio.crossOrigin = 'anonymous';
    const { CanvasContext, WIDTH, HEIGHT, analyser } = this;
    const {
      lineColor,
      lineColorO,
      shadowColor,
      shadowColorO,
      shadowBlur,
      lineWidth,
      lineSpacing,
      isRound,
    } = this.opt;

    let bufferLen = analyser.frequencyBinCount;
    let buffer = new Uint8Array(bufferLen);
    analyser.getByteFrequencyData(buffer);

    let cx = WIDTH * this.opt.centerX;
    let cy = HEIGHT * this.opt.centerY;
    let sp = (lineWidth + lineSpacing) / 2;

    CanvasContext.clearRect(0, 0, WIDTH, HEIGHT);
    CanvasContext.beginPath();
    CanvasContext.lineWidth = lineWidth;
    CanvasContext.shadowBlur = shadowBlur;
    CanvasContext.strokeStyle = `rgba(${this.colorToRGB(lineColor).join(
      ','
    )}, ${lineColorO})`;
    CanvasContext.shadowColor = `rgba(${this.colorToRGB(shadowColor).join(
      ','
    )}, ${shadowColorO})`;
    if (isRound) {
      CanvasContext.lineCap = 'round';
    } else {
      CanvasContext.lineCap = 'butt';
    }

    for (let i = 0; i < bufferLen; i++) {
      let h = buffer[i] + 1;
      let xl = cx - i * (lineWidth + lineSpacing) - sp;
      let xr = cx + i * (lineWidth + lineSpacing) + sp;
      let y1 = cy - h / 2;
      let y2 = cy + h / 2;
      CanvasContext.moveTo(xl, y1);
      CanvasContext.lineTo(xl, y2);
      CanvasContext.moveTo(xr, y1);
      CanvasContext.lineTo(xr, y2);
    }

    CanvasContext.stroke();
    CanvasContext.closePath();
  }
  colorToRGB(color) {
    if (color.length !== 7 && !color.startsWith('#')) return [0, 0, 0];
    let rgb = [];
    color = color.replace('#', '');
    for (let i = 0; i < 3; i++) {
      rgb.push(parseInt(color.substring(i * 2, i * 2 + 2), 16));
    }
    return rgb;
  }
  start() {}
  stop() {}
  destroy() {}
  static getInstance() {}
}
