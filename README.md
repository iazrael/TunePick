# TunePick

打开网页就能用的吉他调音器。拨一根弦，它告诉你偏高还是偏低、差多少。

**在线使用：<https://iazrael.github.io/TunePick/>**

- 实时显示音名、频率（Hz）和偏差（音分），指针式仪表盘，调准时变绿。
- 标准调弦 E2 A2 D3 G3 B3 E4，自动识别目标弦，也可以手动选弦。
- 点琴弦听参考音；基准音 A4 可调，默认 440 Hz。
- 琴声只在浏览器里分析，不上传、不保存。
- 可以安装到手机主屏幕，离线可用。

## 开发

需要 Node.js 24 或更新的版本。

```sh
npm install
npm run dev        # 本地开发，默认 http://localhost:5173
npm test           # 单元测试
npm run typecheck  # 类型检查
npm run build      # 构建到 dist/
npm run preview    # 本地预览构建产物
```

麦克风只在 HTTPS 或 `localhost` 下可用。用手机访问电脑上的开发服务器时，需要 HTTPS 隧道。

改了 `public/favicon.svg` 之后运行 `npm run icons` 重新生成 PNG 图标。

## 目录

```
src/
  audio/     麦克风、每帧分析、基频检测、参考音
  tuner/     音名换算、读数稳定
  ui/        仪表盘
  main.ts    界面和各模块的连接
docs/
  需求/       做什么
  架构算法/   怎么运作
  规范/       必须遵守什么
```

## 文档

- [需求](docs/需求/调音器.md)
- [音高检测和读数稳定](docs/架构算法/音高检测.md)
- [版本与发布](docs/规范/版本与发布.md)
- [更新记录](CHANGELOG.md)

## 发布

推送正式版标签（例如 `v1.2.0`）会自动创建 GitHub Release 并更新线上页面。步骤见[版本与发布](docs/规范/版本与发布.md)。
