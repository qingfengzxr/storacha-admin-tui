import blessed from 'blessed';
import process from 'node:process';

import { agentInfo } from '../state/agent.mjs';

let activeScreen = null;

const createScreen = (options) => {
  if (activeScreen) {
    try {
      activeScreen.destroy();
    } catch {
      // ignore
    }
  }
  const screen = blessed.screen(options);
  activeScreen = screen;
  screen.on('destroy', () => {
    if (activeScreen === screen) {
      activeScreen = null;
    }
  });
  return screen;
};

const exitApp = () => {
  if (activeScreen) {
    try {
      activeScreen.destroy();
    } catch {
      // ignore
    }
  }
  process.exit(0);
};

process.on('SIGINT', exitApp);

const formatAgentInfo = () => {
  const did = agentInfo.did ? `Agent: ${agentInfo.did}` : 'Agent: --';
  const accounts =
    agentInfo.accounts && agentInfo.accounts.length
      ? `Accounts: ${agentInfo.accounts.join(', ')}`
      : 'Accounts: --';
  return `${did}\n${accounts}`;
};

const buildMenu = ({ title, options }) => {
  const screen = createScreen({ smartCSR: true, title });
  blessed.box({
    parent: screen,
    top: 0,
    left: 1,
    width: '100%-2',
    height: 3,
    style: { fg: 'gray' },
    content: formatAgentInfo()
  });
  const list = blessed.list({
    parent: screen,
    top: 3,
    left: 'center',
    width: '90%',
    height: '100%-4',
    keys: true,
    vi: false,
    mouse: true,
    border: 'line',
    label: ` ${title} `,
    style: {
      selected: { bg: 'blue' }
    }
  });
  blessed.box({
    parent: screen,
    bottom: 0,
    left: 1,
    width: '100%-2',
    height: 1,
    style: { fg: 'gray' },
    content: '↑/↓ or j/k: move  |  Enter: select  |  q/esc: exit'
  });
  list.setItems(options);
  list.focus();
  screen.key(['j'], () => list.down(1));
  screen.key(['k'], () => list.up(1));
  screen.key(['C-c'], exitApp);
  list.key(['q', 'escape'], exitApp);
  list.key(['C-c'], exitApp);
  screen.render();
  return { screen, list };
};

const tuiMenu = async (title, options) =>
  new Promise((resolve) => {
    const { screen, list } = buildMenu({ title, options });
    const cleanup = (result) => {
      screen.destroy();
      resolve(result);
    };
    screen.key(['q', 'escape'], exitApp);
    screen.key(['C-c'], exitApp);
    list.on('select', (_, idx) => cleanup(idx));
  });

const tuiPrompt = async (title, message, fallback = '', hintText) =>
  new Promise((resolve) => {
    const screen = createScreen({ smartCSR: true, title });
    const form = blessed.form({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: 7,
      border: 'line',
      label: ` ${title} `
    });
    blessed.box({
      parent: form,
      top: 1,
      left: 2,
      width: '90%-2',
      height: 1,
      content: message
    });
    const input = blessed.textbox({
      parent: form,
      top: 3,
      left: 2,
      width: '90%-4',
      height: 1,
      inputOnFocus: true,
      value: fallback
    });
    blessed.box({
      parent: form,
      top: 5,
      left: 2,
      width: '90%-2',
      height: 1,
      style: { fg: 'gray' },
      content: hintText || 'Enter: confirm  |  Esc: cancel'
    });
    const cleanup = (value) => {
      screen.destroy();
      resolve(value);
    };
    screen.key(['escape'], () => cleanup(null));
    screen.key(['C-c'], exitApp);
    input.key(['escape'], () => cleanup(null));
    input.on('submit', (val) => cleanup(val));
    input.focus();
    screen.render();
  });

const tuiConfirm = async (title, message, defaultNo = true) =>
  new Promise((resolve) => {
    const screen = createScreen({ smartCSR: true, title });
    const box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: 5,
      border: 'line',
      label: ` ${title} `,
      content: `${message}\n\n${defaultNo ? '[y/N]' : '[Y/n]'}`
    });
    const cleanup = (value) => {
      screen.destroy();
      resolve(value);
    };
    const handleYes = () => cleanup(true);
    const handleNo = () => cleanup(false);
    screen.key(['y', 'Y'], handleYes);
    screen.key(['n', 'N', 'escape', 'q'], handleNo);
    screen.key(['C-c'], exitApp);
    box.key(['y', 'Y'], handleYes);
    box.key(['n', 'N', 'escape', 'q'], handleNo);
    box.focus();
    screen.render();
  });

const tuiChoice = async (title, message, options) => {
  const full = options.map((o) => o);
  return new Promise((resolve) => {
    const { screen, list } = buildMenu({ title, options: full });
    blessed.box({
      parent: screen,
      bottom: 0,
      left: 1,
      width: '100%-2',
      height: 1,
      style: { fg: 'gray' },
      content: message
    });
    const cleanup = (value) => {
      screen.destroy();
      resolve(value);
    };
    screen.key(['escape', 'q'], () => cleanup(null));
    screen.key(['C-c'], exitApp);
    list.on('select', (_, idx) => cleanup(idx));
  });
};

const tuiMessage = async (title, message, hintText) =>
  new Promise((resolve) => {
    const screen = createScreen({ smartCSR: true, title });
    blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '90%',
      height: '80%',
      border: 'line',
      label: ` ${title} `,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      content: message
    });
    blessed.box({
      parent: screen,
      bottom: 0,
      left: 1,
      width: '100%-2',
      height: 1,
      style: { fg: 'gray' },
      content: hintText || 'Enter: continue  |  q/esc: cancel  |  ↑↓ scroll'
    });
    const cleanup = () => {
      screen.destroy();
      resolve();
    };
    screen.key(['enter'], cleanup);
    screen.key(['q', 'escape'], cleanup);
    screen.key(['C-c'], exitApp);
    screen.render();
  });

const tuiLogger = (title) => {
  const screen = createScreen({ smartCSR: true, title });
  const box = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-1',
    border: 'line',
    label: ` ${title} `,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true
  });
  blessed.box({
    parent: screen,
    bottom: 0,
    left: 1,
    width: '100%-2',
    height: 1,
    style: { fg: 'gray' },
    content: 'q/esc: close  |  ↑↓ scroll'
  });

  const lines = [];
  const append = (line) => {
    lines.push(line);
    box.setContent(lines.join('\n'));
    box.setScrollPerc(100);
    screen.render();
  };

  const close = () => {
    screen.destroy();
  };

  box.focus();
  box.key(['q', 'escape'], close);
  box.key(['C-c'], exitApp);
  screen.render();

  return { append, close };
};

const tuiDangerConfirm = async (title, message, token = 'PURGE') => {
  const input = await tuiPrompt(
    title,
    `${message}\nType "${token}" to confirm:`,
    '',
    `Confirm: Type ${token} then Enter  |  Esc: cancel`
  );
  if (input == null) return false;
  if (input.trim() === token) return true;
  await tuiMessage(title, `Confirmation token mismatch. Expected "${token}".`);
  return false;
};

const paginateListTui = async ({
  title,
  fetchPage,
  renderItem,
  pageSize,
  onSelect,
  onSelectLabel
}) =>
  new Promise((resolve) => {
    const screen = createScreen({
      smartCSR: true,
      title
    });

    const table = blessed.listtable({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-1',
      border: 'line',
      keys: true,
      vi: false,
      mouse: true,
      pad: 0,
      align: 'left',
      style: {
        header: { bold: true },
        cell: { selected: { bg: 'blue' } }
      }
    });
    const footer = blessed.box({
      bottom: 0,
      height: 1,
      left: 0,
      width: '100%',
      style: { fg: 'gray' },
      content: ''
    });

    screen.append(table);
    screen.append(footer);

    let cursor;
    let pageIndex = 0;
    let nextCursor;
    const history = [];
    let loading = false;
    let currentResults = [];
    let selectedIndex = 1;
    let modalDepth = 0;

    const render = async () => {
      if (loading) return;
      loading = true;
      footer.setContent('Loading...');
      screen.render();
      try {
        const page = await fetchPage(cursor, pageSize);
        const results = page?.results ?? [];
        nextCursor = page?.cursor;
        currentResults = results;
        const rows = results.map((item, idx) => renderItem(item, idx));
        const header = rows[0]?.headerColumns ?? ['(no data)'];
        const data = [header, ...rows.map((row) => row.columns ?? [])];
        table.setData(data);
        if (results.length > 0) {
          selectedIndex = Math.min(selectedIndex, results.length);
          table.select(Math.max(1, selectedIndex));
          if (modalDepth === 0) {
            table.focus();
          }
        }
        const endMark = nextCursor ? '' : '  [end]';
        const selectHint = onSelect ? `  Enter: ${onSelectLabel || 'details'}` : '';
        footer.setContent(
          `page ${pageIndex + 1} (${results.length})  j/k or ↑/↓ select  h/← prev  l/→ next${selectHint}  q quit${endMark}`
        );
      } catch (err) {
        footer.setContent(`Failed to load page: ${err?.message || err}`);
      } finally {
        loading = false;
        screen.render();
      }
    };

    const goNext = async () => {
      if (modalDepth > 0) return;
      if (!nextCursor) {
        screen.program.bell();
        return;
      }
      history.push(cursor);
      cursor = nextCursor;
      pageIndex += 1;
      await render();
    };

    const goPrev = async () => {
      if (modalDepth > 0) return;
      if (!history.length) {
        screen.program.bell();
        return;
      }
      cursor = history.pop();
      pageIndex = Math.max(0, pageIndex - 1);
      await render();
    };

    const showModal = async (modalTitle, content, onLineEnter) =>
      new Promise((res) => {
        modalDepth += 1;
        const prevFocus = screen.focused;
        const lines = String(content || '').split('\n');
        const list = blessed.list({
          parent: screen,
          top: 'center',
          left: 'center',
          width: '90%',
          height: '80%',
          border: 'line',
          label: ` ${modalTitle} `,
          scrollable: true,
          alwaysScroll: true,
          keys: true,
          mouse: true,
          vi: false,
          style: { selected: { bg: 'blue' } }
        });
        const hint = blessed.box({
          parent: screen,
          bottom: 0,
          left: 1,
          width: '100%-2',
          height: 1,
          style: { fg: 'gray' },
          content: ''
        });

        const updateHint = () => {
          const total = lines.length;
          const current = Math.max(1, (list.selected ?? 0) + 1);
          hint.setContent(
            `line ${current}/${total}  ↑/↓ or j/k move  PgUp/PgDn page  y/c copy line  a copy all  q/esc/enter close`
          );
          screen.render();
        };

        const copyToClipboard = (text) => {
          if (!text) return;
          const b64 = Buffer.from(String(text)).toString('base64');
          process.stdout.write(`\u001b]52;c;${b64}\u0007`);
        };

        list.setItems(lines);
        list.select(0);
        list.focus();
        updateHint();

        const close = () => {
          list.detach();
          hint.detach();
          modalDepth = Math.max(0, modalDepth - 1);
          if (prevFocus && typeof prevFocus.focus === 'function') {
            prevFocus.focus();
          }
          screen.render();
          res();
        };

        list.key(['q', 'escape'], close);
        list.key(['C-c'], exitApp);
        list.key(['enter'], async () => {
          if (!onLineEnter) return close();
          const idx = list.selected ?? 0;
          const detail = await onLineEnter(idx);
          if (!detail) return close();
          if (typeof detail === 'string') {
            await showModal('Details', detail);
          } else {
            await showModal(detail.title || 'Details', detail.content || '');
          }
          updateHint();
        });
        list.key(['j'], () => {
          list.down(1);
          updateHint();
        });
        list.key(['k'], () => {
          list.up(1);
          updateHint();
        });
        list.key(['pageup'], () => {
          list.up(10);
          updateHint();
        });
        list.key(['pagedown'], () => {
          list.down(10);
          updateHint();
        });
        list.key(['g'], () => {
          list.select(0);
          updateHint();
        });
        list.key(['G'], () => {
          list.select(Math.max(0, lines.length - 1));
          updateHint();
        });
        list.key(['y', 'c'], () => {
          const idx = list.selected ?? 0;
          copyToClipboard(lines[idx]);
          updateHint();
        });
        list.key(['a'], () => {
          copyToClipboard(lines.join('\n'));
          updateHint();
        });

        list.on('scroll', updateHint);
        screen.render();
      });

    screen.key(['q', 'escape'], () => {
      if (modalDepth > 0) return;
      screen.destroy();
      resolve();
    });
    screen.key(['C-c'], exitApp);
    screen.key(['j'], () => {
      if (modalDepth > 0) return;
      table.down(1);
      selectedIndex = table.selected ?? selectedIndex;
      screen.render();
    });
    screen.key(['k'], () => {
      if (modalDepth > 0) return;
      table.up(1);
      selectedIndex = table.selected ?? selectedIndex;
      screen.render();
    });
    screen.key(['right', 'l'], goNext);
    screen.key(['left', 'h'], goPrev);
    if (onSelect) {
      screen.key(['enter'], async () => {
        if (modalDepth > 0) return;
        const idx = table.selected ?? 0;
        if (idx <= 0) return;
        const item = currentResults[idx - 1];
        if (!item) return;
        const detail = await onSelect(item);
        if (detail) {
          if (typeof detail === 'string') {
            await showModal('Details', detail);
          } else {
            await showModal(detail.title || 'Details', detail.content || '', detail.onLineEnter);
          }
        }
        await render();
        screen.render();
      });
    }

    render();
  });

const paginateList = async (params) => paginateListTui(params);

export {
  createScreen,
  exitApp,
  formatAgentInfo,
  buildMenu,
  tuiMenu,
  tuiPrompt,
  tuiConfirm,
  tuiChoice,
  tuiMessage,
  tuiLogger,
  tuiDangerConfirm,
  paginateList,
  paginateListTui
};
