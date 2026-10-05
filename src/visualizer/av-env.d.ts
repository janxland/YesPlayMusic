// Visualizer 在原生对象上挂的自定义字段声明（AudioContext 复用 / 调试 / 缓存 source）
declare global {
  interface Window {
    /** 控制台调试开关：window.__AV_DEBUG__ = true 打印帧生命周期日志。 */
    __AV_DEBUG__?: boolean;
    /** 应用级共享 AudioContext 单例（HTMLMediaElement 绑定 ctx 不可逆）。 */
    __AV_SHARED_CTX__?: AudioContext;
    /** 旧版 Safari 的厂商前缀 AudioContext。 */
    webkitAudioContext?: typeof AudioContext;
  }
  interface HTMLMediaElement {
    /** AudioVisual 缓存的旁路 source（只 disconnect、绝不 track.stop()）。 */
    __avSource__?: MediaStreamAudioSourceNode | null;
    /** 标准规范外的实现差异 API（lib.dom 未收录）；缺失时回退程序化帧。 */
    captureStream?: () => MediaStream;
  }
  interface MediaStreamAudioSourceNode {
    /** 建立该 source 时的原始 captureStream。 */
    __avStream__?: MediaStream;
    /** 建立该 source 时的 audio.currentSrc，用于检测切歌导致的源过期。 */
    __avSrc__?: string;
  }
}

export {};
