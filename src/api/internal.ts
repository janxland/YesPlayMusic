// api 层内部共享小工具：只收 9 个 api 文件里反复出现的参数拼装样板，不引入行为差异；
// api 层不得反向依赖 store/router（依赖方向铁律），故工具保持纯函数。

// 防缓存时间戳：服务端按完整 URL（含 query）做 apicache，写操作与轮询/榜单类 GET 需每次不同的 timestamp 才能绕过缓存。
export function bust(): number {
  return new Date().getTime();
}
