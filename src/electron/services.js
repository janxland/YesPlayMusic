import clc from 'cli-color';
// 只要副作用：该模块在模块级把 anonymous_token 写进 os.tmpdir()，
// 内嵌的 NeteaseCloudMusicApi 起来时要读它——没有绑定引用，但不能删。
import '../utils/checkAuthToken';
import server from '@neteaseapireborn/api/server';

export async function startNeteaseMusicApi() {
  // Let user know that the service is starting
  console.log(`${clc.redBright('[NetEase API]')} initiating NCM API`);

  // Load the NCM API.
  await server.serveNcmApi({
    port: 10754,
    moduleDefs: require('../ncmModDef'),
  });
}
