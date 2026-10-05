// 原生 Clipboard API 仅在安全上下文可用，回退 execCommand；恒返回 Promise，提示文案由调用方负责。
export function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const nativeWrite = navigator.clipboard.writeText(text);
    return nativeWrite.catch(() => copyWithExecCommand(text));
  }
  return copyWithExecCommand(text);
}

function copyWithExecCommand(text) {
  return new Promise<void>((resolve, reject) => {
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      if (document.execCommand('copy')) {
        resolve();
      } else {
        reject(new Error('document.execCommand("copy") failed'));
      }
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(tempInput);
    }
  });
}
