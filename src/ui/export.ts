export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * 把一段文字存成文件交给用户。
 * 手机上走系统分享面板（主屏应用里直接下载不可靠）；电脑上直接下载。
 * 文件用 .txt：系统分享只接受少数几种文件类型，纯文本到处都能传。
 */
export async function saveTextFile(name: string, text: string): Promise<SaveOutcome> {
  const file = new File([text], name, { type: 'text/plain' });

  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // 分享面板打不开（比如系统拒绝了这次调用）：改走下载
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // 立刻回收地址，部分浏览器会来不及开始下载
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
