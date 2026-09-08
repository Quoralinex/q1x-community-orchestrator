export const MACOS_JXA_WORKER = String.raw`
ObjC.import('Foundation');
ObjC.import('ApplicationServices');

function readStdin() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
  return JSON.parse(text);
}

function now() { return new Date().toISOString(); }
function appName(action) { return action.application || (action.target && action.target.application); }
function systemEvents() { return Application('System Events'); }

function processFor(name) {
  if (!name) throw new Error('application is required');
  const matches = systemEvents().applicationProcesses.whose({ name: name })();
  if (!matches.length) throw new Error('application process not found: ' + name);
  return matches[0];
}

function elementChildren(element) {
  try { return element.uiElements(); } catch (_) { return []; }
}

function valueOf(fn, fallback) {
  try { const value = fn(); return value === undefined ? fallback : value; } catch (_) { return fallback; }
}

function describe(element) {
  return {
    role: valueOf(() => element.role(), null),
    name: valueOf(() => element.name(), null),
    description: valueOf(() => element.description(), null),
    value: valueOf(() => element.value(), null),
    enabled: valueOf(() => element.enabled(), null)
  };
}

function targetMatches(element, target) {
  if (!target) return false;
  const d = describe(element);
  if (target.by === 'role') return d.role === target.role && (!target.name || d.name === target.name);
  if (target.by === 'name') return d.name === target.name;
  if (target.by === 'text') return d.name === target.text || d.value === target.text || d.description === target.text;
  if (target.by === 'accessibility-id') return valueOf(() => element.attributes.byName('AXIdentifier').value(), null) === target.id;
  return false;
}

function findElement(root, target) {
  const queue = [root];
  let visited = 0;
  while (queue.length && visited < 5000) {
    const element = queue.shift();
    visited += 1;
    if (targetMatches(element, target)) return element;
    const children = elementChildren(element);
    for (const child of children) queue.push(child);
  }
  return null;
}

function targetElement(action) {
  const proc = processFor(appName(action));
  if (!action.target) return proc;
  const found = findElement(proc, action.target);
  if (!found) throw new Error('accessibility target not found');
  return found;
}

function pointerEvent(type, x, y, button) {
  const point = $.CGPointMake(Number(x), Number(y));
  const event = $.CGEventCreateMouseEvent(null, type, point, button || 0);
  $.CGEventPost($.kCGHIDEventTap, event);
}

function execute(action) {
  const se = systemEvents();
  switch (action.kind) {
    case 'list-applications':
      return se.applicationProcesses().map(p => ({ name: valueOf(() => p.name(), '') })).filter(v => v.name);
    case 'launch-application': {
      if (!action.application) throw new Error('application is required');
      Application(action.application).launch();
      return { application: action.application };
    }
    case 'focus-application': {
      const proc = processFor(action.application);
      proc.frontmost = true;
      return { application: action.application };
    }
    case 'close-application': {
      if (!action.application) throw new Error('application is required');
      Application(action.application).quit();
      return { application: action.application };
    }
    case 'list-windows': {
      const proc = processFor(action.application);
      return proc.windows().map(w => ({ name: valueOf(() => w.name(), ''), role: valueOf(() => w.role(), null) }));
    }
    case 'focus-window': {
      const proc = processFor(action.application);
      const windows = proc.windows();
      const match = action.window ? windows.find(w => valueOf(() => w.name(), '') === action.window) : windows[0];
      if (!match) throw new Error('window not found');
      try { match.actions.byName('AXRaise').perform(); } catch (_) { proc.frontmost = true; }
      return { window: valueOf(() => match.name(), '') };
    }
    case 'inspect':
      return describe(targetElement(action));
    case 'find': {
      const element = targetElement(action);
      return describe(element);
    }
    case 'click':
      targetElement(action).click();
      return {};
    case 'double-click': {
      const element = targetElement(action); element.click(); delay(0.08); element.click(); return {};
    }
    case 'type':
      se.keystroke(String(action.text || ''));
      return { characters: String(action.text || '').length };
    case 'press':
      se.keystroke(String(action.key || ''));
      return { key: action.key };
    case 'set-value': {
      const element = targetElement(action); element.value = action.value; return {};
    }
    case 'mouse-move':
      pointerEvent($.kCGEventMouseMoved, action.x, action.y, 0); return {};
    case 'mouse-down':
      pointerEvent($.kCGEventLeftMouseDown, action.x, action.y, 0); return {};
    case 'mouse-up':
      pointerEvent($.kCGEventLeftMouseUp, action.x, action.y, 0); return {};
    case 'drag':
      pointerEvent($.kCGEventLeftMouseDown, action.from.x, action.from.y, 0);
      pointerEvent($.kCGEventLeftMouseDragged, action.to.x, action.to.y, 0);
      pointerEvent($.kCGEventLeftMouseUp, action.to.x, action.to.y, 0); return {};
    case 'wheel': {
      const event = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitPixel, 2, Number(action.deltaY || 0), Number(action.deltaX || 0));
      $.CGEventPost($.kCGHIDEventTap, event); return {};
    }
    case 'wait':
      delay(Number(action.milliseconds || 0) / 1000); return {};
    default:
      throw new Error('unsupported macOS desktop action: ' + action.kind);
  }
}

function main() {
  const envelope = readStdin();
  const startedAt = now();
  const actions = [];
  let batchStatus = 'succeeded';
  for (const action of envelope.batch.actions) {
    const start = Date.now();
    try {
      const output = execute(action);
      actions.push({ id: action.id, status: 'succeeded', durationMs: Date.now() - start, output: output });
    } catch (error) {
      batchStatus = 'failed';
      actions.push({ id: action.id, status: 'failed', durationMs: Date.now() - start, error: { code: 'MACOS_ACTION_FAILED', message: String(error && error.message ? error.message : error) } });
      break;
    }
  }
  return JSON.stringify({
    contractVersion: '1.0.0',
    id: envelope.batch.id + '.result',
    batchId: envelope.batch.id,
    status: batchStatus,
    actions: actions,
    startedAt: startedAt,
    finishedAt: now(),
    metadata: { bridge: 'q1x-macos-accessibility' }
  });
}

main();
`;

export const MACOS_ACCESSIBILITY_PROBE = String.raw`
const se = Application('System Events');
JSON.stringify({ enabled: Boolean(se.UIElementsEnabled()) });
`;
