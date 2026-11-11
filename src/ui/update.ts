/**
 * 升级界面：发现新版本时的弹窗、设置里的「更新到最新版」、升级完成后的提示。
 * 只有用户点了「立即更新」或「更新到最新版」才会刷新页面。
 */
import {
  createUpgradeGate,
  type PwaController,
  type RemoteRelease,
  type UpgradeFailReason,
} from '@nexus-kit/pwa';
import { APP_VERSION } from '../build-info';

const STAGE_TEXT = {
  idle: '',
  downloading: '正在下载新版本，通常十几秒，请别关掉页面…',
  switching: '正在切换到新版本…',
} as const;

const FAIL_TEXT: Record<UpgradeFailReason, string> = {
  'no-install': '新版本还在发布中，过几分钟再点更新就行。',
  'downloading-stuck': '网络有点慢，新版本没下完。连上稳定的网络后再点更新，或者关掉页面重新打开。',
  'switching-stuck': '新版本已经下载好了，关掉页面重新打开就能用上。',
};

/** 「已更新到」提示显示多久（毫秒）。 */
const TOAST_MS = 4000;

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function noteList(notes: readonly string[]): HTMLUListElement {
  const list = document.createElement('ul');
  for (const note of notes) {
    const item = document.createElement('li');
    item.textContent = note;
    list.append(item);
  }
  return list;
}

function olderReleases(releases: readonly RemoteRelease[], hiddenCount: number): HTMLDetailsElement {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `更早的 ${releases.length + hiddenCount} 个版本也会一起更新`;
  details.append(summary);
  for (const release of releases) {
    const heading = document.createElement('h3');
    heading.textContent = `v${release.version.replace(/^v/i, '')} ${release.date}`.trim();
    details.append(heading, noteList(release.notes));
  }
  return details;
}

export function setupUpdateUi(controller: PwaController): void {
  const dialog = byId<HTMLDialogElement>('update');
  const subtitle = byId('update-subtitle');
  const notes = byId('update-notes');
  const progress = byId('update-progress');
  const failure = byId('update-fail');
  const laterButton = byId<HTMLButtonElement>('update-later');
  const nowButton = byId<HTMLButtonElement>('update-now');
  const forceButton = byId<HTMLButtonElement>('force-update');
  const forceResult = byId('force-update-result');
  const toast = byId('toast');

  const gate = createUpgradeGate();
  let failReason: UpgradeFailReason | null = null;

  function onFail(reason: UpgradeFailReason): void {
    gate.release();
    failReason = reason;
    render();
  }

  function render(): void {
    const snapshot = controller.getSnapshot();
    const upgrading = snapshot.stage !== 'idle';
    const visible = snapshot.promptOpen || upgrading || failReason !== null;
    if (!visible) {
      if (dialog.open) dialog.close();
      return;
    }

    const local = APP_VERSION.replace(/^v/i, '');
    const remote = snapshot.remoteVersion;
    const pending = snapshot.pending;
    subtitle.textContent =
      pending?.kind === 'hotfix'
        ? `v${remote}，问题修复`
        : pending?.kind === 'revised'
          ? `v${remote}，这一版的内容有更新`
          : remote !== ''
            ? `当前 v${local}，最新 v${remote}`
            : '';

    const [latest, ...older] = pending?.releases ?? [];
    if (pending === null) {
      notes.replaceChildren('检测到新版本，但暂时拿不到更新说明。');
    } else if (latest === undefined) {
      notes.replaceChildren('修复了一些问题。');
    } else {
      notes.replaceChildren(noteList(latest.notes));
      if (older.length > 0) notes.append(olderReleases(older, pending.hiddenCount));
    }

    progress.textContent = STAGE_TEXT[snapshot.stage];
    progress.hidden = !upgrading;
    failure.textContent = failReason !== null && !upgrading ? FAIL_TEXT[failReason] : '';
    failure.hidden = failure.textContent === '';
    laterButton.disabled = upgrading;
    nowButton.disabled = upgrading || gate.busy();

    if (!dialog.open) dialog.showModal();
  }

  function dismiss(): void {
    // 已经开始下载或切换：用户授权过刷新，不能再取消
    if (controller.getSnapshot().stage !== 'idle') return;
    gate.release();
    failReason = null;
    controller.dismissPrompt();
    render();
  }

  nowButton.addEventListener('click', () => {
    if (gate.busy()) return;
    failReason = null;
    gate.begin(async () => {
      controller.beginUpgrade({ onFail });
      return true;
    });
    render();
  });
  laterButton.addEventListener('click', dismiss);
  // 按 Esc 等同于「稍后」；升级进行中不让关
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismiss();
  });

  forceButton.addEventListener('click', async () => {
    forceButton.disabled = true;
    forceResult.textContent = '正在检查…';
    failReason = null;
    const result = await controller.forceUpgrade({ onFail });
    forceButton.disabled = false;
    if (result === 'started') {
      forceResult.textContent = '';
      // 让位给升级弹窗显示进度
      byId<HTMLDialogElement>('settings').close();
    } else {
      forceResult.textContent = result === 'latest' ? '已经是最新版本' : '检查失败，确认网络正常后再试';
    }
    render();
  });

  controller.subscribe(render);

  const updated = controller.consumeUpdatedNotice();
  if (updated !== null) {
    toast.textContent = `已更新到 ${updated.to}`;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, TOAST_MS);
  }
}
