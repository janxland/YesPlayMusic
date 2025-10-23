<template>
  <div>
    <div ref="visualizer-container" class="visualizer-container">
      <div class="settings-container">
        <div ref="handleRange" class="settings-bookstrap">></div>
        <div class="top-open-visualizer">
          <span class="label-text">打开可视化</span>
          <label class="switch" @click.prevent="openVisualizer()">
            <input v-model="switchOpenVisualizer" type="checkbox" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-item">
          <span>样式：</span>
          <input
            v-model="defaultSetting.type"
            type="range"
            min="0"
            max="1"
            step="1"
          />
        </div>
        <div class="setting-item">
          <span>fftSize：</span>
          <input
            v-model="defaultSetting.fftSize"
            type="range"
            :min="Math.log2(32)"
            :max="Math.log2(4096)"
            step="1"
          />
        </div>
        <div class="setting-item">
          <span>中心 X 值：</span>
          <input
            v-model="defaultSetting.centerX"
            type="range"
            min="0"
            max="1"
            step="0.01"
          />
        </div>
        <div class="setting-item">
          <span>中心 Y 值：</span>
          <input
            v-model="defaultSetting.centerY"
            type="range"
            min="0"
            max="1"
            step="0.01"
          />
        </div>
        <div class="setting-item">
          <span>歌词透视深度：</span>
          <input
            v-model="$store.state.visualSet.perspective"
            type="range"
            min="100"
            max="1000"
            step="50"
          />
        </div>
        <div class="setting-item">
          <span>歌词透视方向</span>
          <input
            v-model="$store.state.visualSet.rotateY"
            type="range"
            min="-180"
            max="180"
            step="1"
          />
        </div>
        <div class="setting-item">
          <span>线宽：</span>
          <input
            v-model="defaultSetting.lineWidth"
            type="range"
            min="1"
            max="15"
            step="1"
          />
        </div>
        <div class="setting-item">
          <span>线间距：</span>
          <input
            v-model="defaultSetting.lineSpacing"
            type="range"
            min="0.1"
            max="10"
            step="0.1"
          />
        </div>
        <div class="setting-item">
          <span>线条颜色：</span>
          <input v-model="defaultSetting.lineColor" type="color" />
        </div>
        <div class="setting-item">
          <span>阴影颜色：</span>
          <input v-model="defaultSetting.shadowColor" type="color" />
        </div>
        <div class="setting-item">
          <span>阴影模糊：</span>
          <input
            v-model="defaultSetting.shadowBlur"
            type="range"
            min="1"
            max="10"
            step="1"
          />
        </div>
        <div v-if="defaultSetting.type === 1" class="setting-item">
          <span>半径（环形）：</span>
          <input
            v-model="defaultSetting.circleRadius"
            type="range"
            min="10"
            max="500"
            step="10"
          />
        </div>
        <div v-if="defaultSetting.type === 1" class="setting-item">
          <span>分割数（环形）：</span>
          <input
            v-model="defaultSetting.circleSplit"
            type="range"
            min="1"
            max="30"
            step="1"
          />
        </div>
        <div v-if="defaultSetting.type === 1" class="setting-item">
          <span>循环数（环形）：</span>
          <input
            v-model="defaultSetting.circleRange"
            type="range"
            min="60"
            max="1080"
            step="30"
          />
        </div>
        <div v-if="defaultSetting.type === 1" class="setting-item">
          <span>边缘倍数（环形）：</span>
          <input
            v-model="defaultSetting.circleEdge"
            type="range"
            min="0.1"
            max="1.5"
            step="0.1"
          />
        </div>
        <div class="setting-item">
          <span>线头类型：</span>
          <input v-model="defaultSetting.isRound" type="checkbox" />
        </div>
      </div>
      <canvas
        v-show="switchOpenVisualizer"
        id="visualizer-canvas"
        ref="canvas"
      ></canvas>
    </div>
  </div>
</template>

<script>
import { isLoggedIn } from '@/utils/auth';

/* eslint-disable */
import { mapState, mapMutations, mapActions } from 'vuex';
import { AudioVisual } from '@/visualizer/AudioVisual';
export default {
  props: {
    option: { type: Object, default: {} },
  },
  data() {
    return {
      AV: null,
      switchOpenVisualizer: false,
      defaultSetting: {
        centerX: 0.5,
        centerY: 0.7,
        lineWidth: 10,
        lineSpacing: 8,
        lineColor: '#e93b81',
        lineColorO: 1,
        shadowColor: '#231018',
        shadowColorO: 1,
        shadowBlur: 10,
        circleRadius: 150,
        circleEdge: 0.618,
        circleSplit: 2,
        circleRange: 360,
        isRound: true,
        type: 1,
        fftSize: 12,
        isNormalize: false,
      },
    };
  },
  computed: {
    ...mapState(['player', 'settings', 'showLyrics']),
  },
  watch: {
    'defaultSetting.type': {
      handler(newValue) {
        if (newValue.type === 1) {
          this.defaultSetting.type = 1;
          this.defaultSetting.lineWidth = 2;
          this.defaultSetting.circleRadius = 300;
          this.defaultSetting.circleEdge = 0.618;
          this.defaultSetting.circleRange = 360;
          this.defaultSetting.circleSplit = 2;
          this.defaultSetting.fftSize = 32;
        }
        this.AV.setSetting(this.defaultSetting);
      },
    },
    defaultSetting: {
      deep: true,
      handler(newValue) {
        this.defaultSetting.type = Number(newValue.type);
        this.defaultSetting.centerX = Number(newValue.centerX);
        this.defaultSetting.centerY = Number(newValue.centerY);
        this.defaultSetting.lineWidth = Number(newValue.lineWidth);
        this.defaultSetting.circleEdge = Number(newValue.circleEdge);
        this.defaultSetting.circleRadius = Number(newValue.circleRadius);
        this.defaultSetting.lineSpacing = Number(newValue.lineSpacing);
        this.defaultSetting.shadowBlur = Number(newValue.shadowBlur);
        this.defaultSetting.fftSize = Number(newValue.fftSize);
        this.AV.setSetting(this.defaultSetting);
      },
    },
  },
  mounted() {
    this.bindDrag(this.$refs.handleRange);
  },
  methods: {
    openVisualizer() {
      this.switchOpenVisualizer = !this.switchOpenVisualizer;
      if (this.switchOpenVisualizer) {
        let loadInterval = setInterval(() => {
          if (
            this.player?._howler?._sounds[0]?._node &&
            isLoggedIn() &&
            !this.AV
          ) {
            this.nowSrc = this.player._howler._src;
            this.player._howler._sounds[0]._node.crossOrigin = 'anonymous';
            this.$refs.canvas.width = window.innerWidth; // 设置 canvas 宽度
            this.$refs.canvas.height = window.innerHeight; // 设置 canvas 高度
            this.AV = new AudioVisual(
              this.$refs.canvas,
              this.player._howler?._sounds[0]._node,
              {}
            );
            this.AV.loadMusic(
              this.player._howler?._sounds[0]._node.context,
              this.player._howler?._sounds[0]._node
            );
            clearInterval(loadInterval);
          }
        }, 500);
      }
    },
    bindDrag(el) {
      let thi = this;
      const bind = el => {
        let setPos = {
          x: 0,
          y: 0,
        };
        let lastPos = {
          x: 0,
          y: 0,
        };
        function move(curPos) {
          const d = {
            dX: curPos.x - lastPos.x,
            dY: curPos.y - lastPos.y,
          };
          setPos.x += d.dX;
          setPos.y += d.dY;
          thi.defaultSetting.centerX += d.dX / 1000;
          thi.defaultSetting.centerY += d.dY / 1000;
          // el.style.transform = `translate(${setPos.x}px,${setPos.y}px)`;
          lastPos.x = curPos.x;
          lastPos.y = curPos.y;
        }
        el.addEventListener('mousedown', e => {
          e.stopPropagation();
          document.body.style.userSelect = 'none';
          lastPos.x = e.clientX;
          lastPos.y = e.clientY;
          document.addEventListener('mousemove', mouseMove);
          document.addEventListener('mouseup', mouseUp);
        });
        function mouseMove(e) {
          const curPos = {
            x: e.clientX,
            y: e.clientY,
          };
          move(curPos);
        }
        function mouseUp(e) {
          e.stopPropagation();
          const curPos = {
            x: e.clientX,
            y: e.clientY,
          };
          move(curPos);
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', mouseMove);
          document.removeEventListener('mouseup', mouseUp);
        }
      };
      bind(el);
    },
  },
};
</script>

<style lang="scss" scoped>
.visualizer-container {
  width: 100vw;
  height: 100vh;
  position: absolute;
  top: 0;
  left: 0;
  canvas {
    width: 100vw;
    height: 100vh;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
}
.top-open-visualizer {
  display: flex;
  align-items: center;
  color: #fff;
  cursor: pointer;
  border-radius: 5px;
  z-index: 100;
}
.settings-container:hover,
.settings-container:focus,
.settings-container:active {
  transform: translateX(10px);
}
.settings-container {
  user-select: none;
  transform: translateX(-100%);
  transition: all 0.3s ease;
  padding: 5px 10px;
  border-radius: 5px;
  background-color: rgba(0, 0, 0, 0.5);
  color: #fff;
  position: absolute;
  top: 50px;
  z-index: 100;
  .settings-bookstrap {
    position: absolute;
    right: 0;
    width: 30px;
    height: 48px;
    transform: translate(100%, 0);
    text-align: center;
    line-height: 48px;
    top: 20px;
    border-radius: 0 7px 7px 0;
    background-color: rgba(0, 0, 0, 0.5);
  }
}
.setting-item span,
.label-text {
  margin-right: 5px;
}
.switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;
  transform: scale(0.8);
  cursor: pointer;
  input[type='checkbox'] {
    display: none;
  }

  .slider {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    border-radius: 34px;
    transition: 0.4s;

    &:before {
      position: absolute;
      content: '';
      height: 26px;
      width: 26px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      border-radius: 50%;
      transition: 0.4s;
    }
  }

  input:checked + .slider {
    background-color: #2196f3;

    &:before {
      transform: translateX(26px);
    }
  }
}
</style>
