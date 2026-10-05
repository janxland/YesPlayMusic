import request from '@/utils/request';
import { bust } from './internal';

// 手机登录：countrycode 国家码（如美国传 1）；md5_password 传入后 password 失效
export function loginWithPhone(params: any) {
  return request({
    url: '/login/cellphone',
    method: 'post',
    params,
  });
}

// 邮箱登录（163 邮箱）：md5_password 传入后 password 失效
export function loginWithEmail(params: any) {
  return request({
    url: '/login',
    method: 'post',
    params,
  });
}

// 二维码 key 生成
export function loginQrCodeKey() {
  return request({
    url: '/login/qr/key',
    method: 'get',
    params: {
      timestamp: bust(),
    },
  });
}

// 生成二维码：传入上一步的 key，返回二维码信息及 base64 图片（传 qrimg 时）
export function loginQrCodeCreate(params: any) {
  return request({
    url: '/login/qr/create',
    method: 'get',
    params: {
      ...params,
      timestamp: bust(),
    },
  });
}

// 轮询扫码状态：800 过期 / 801 等待扫码 / 802 待确认 / 803 成功（返回 cookies）
export function loginQrCodeCheck(key: any) {
  return request({
    url: '/login/qr/check',
    method: 'get',
    params: {
      key,
      timestamp: bust(),
    },
  });
}

// 刷新登录状态
export function refreshCookie() {
  return request({
    url: '/login/refresh',
    method: 'post',
  });
}

export function logout() {
  return request({
    url: '/logout',
    method: 'post',
  });
}
