export const MACOS_JXA_WORKER = String.raw`
ObjC.import('Foundation');
ObjC.import('ApplicationServices');

function readStdin() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
  return JSON.parse(text);
}

function now() { return new Date().toISOString(); }
function systemEvents() { return Application('System Events'); }
function valueOf(fn, fallback) { try { const value = fn(); return value === undefined ? fallback : value; } catch (_) { return fallback; } }

function processFor(name) {
  if (!name) throw new Error('application is required');
  const matches = systemEvents().applicationProcesses.whose({ name: name })();
  if (!matches.length) throw new Error('application process not found: ' + name);
  return matches[0];
}

function elementChildren(element) { try { return element.uiElements(); } catch (_) { return []; } }
function describe(element) {
  return {
    role: valueOf(() => element.role(), null),
    name: valueOf(() => element.name(), null),
    description: valueOf(() => element.description(), null),
    value: valueOf(() => element.value(), null),
    enabled: valueOf(() => element.enabled(), null),
    position: valueOf(() => element.position(), null),
    size: valueOf(() => element.size(), null)
  };
}

function equalText(actual, expected, exact) {
  if (actual === null || actual === undefined) return false;
  const a = String(actual); const e = String(expected);
  return exact === false ? a.toLowerCase().includes(e.toLowerCase()) : a === e;
}

function targetMatches(element, target) {
  if (!target) return false;
  const d = describe(element);
  if (target.by === 'role') return d.role === target.role && (!target.name || equalText(d.name, target.name, target.exact));
  if (target.by === 'name') return equalText(d.name, target.value, target.exact);
  if (target.by === 'text') return equalText(d.name, target.value, target.exact) || equalText(d.value, target.value, target.exact) || equalText(d.description, target.value, target.exact);
  if (target.by === 'accessibility-id') return valueOf(() => element.attributes.byName('AXIdentifier').value(), null) === target.value;
  if (target.by === 'path') return Array.isArray(target.value) && target.value.length === 1 && valueOf(() => element.attributes.byName('AXIdentifier').value(), null) === target.value[0];
  return false;
}

function findElement(root, target) {
  const queue = [root]; let visited = 0;
  while (queue.length && visited < 5000) {
    const element = queue.shift(); visited += 1;
    if (targetMatches(element, target)) return element;
    for (const child of elementChildren(element)) queue.push(child);
  }
  return null;
}

function targetElement(action, override) {
  const proc = processFor(action.application);
  const target = override || action.target;
  if (!target) return proc;
  const found = findElement(proc, target);
  if (!found) throw new Error('accessibility target not found');
  return found;
}

function centerOf(element) {
  const d = describe(element);
  if (!d.position || !d.size) throw new Error('target has no screen geometry');
  return { x: Number(d.position[0]) + Number(d.size[0]) / 2, y: Number(d.position[1]) + Number(d.size[1]) / 2 };
}

function pointerEvent(type, x, y, button) {
  const point = $.CGPointMake(Number(x), Number(y));
  const event = $.CGEventCreateMouseEvent(null, type, point, button || 0);
  $.CGEventPost($.kCGHIDEventTap, event);
}

function execute(action) {
  const se = systemEvents();
  switch (action.kind) {
    case 'list-applications': return se.applicationProcesses().map(p => ({ name: valueOf(() => p.name(), '') })).filter(v => v.name);
    case 'launch-application': if (!action.application) throw new Error('application is required'); Application(action.application).launch(); return { application: action.application };
    case 'focus-application': { const proc = processFor(action.application); proc.frontmost = true; return { application: action.application }; }
    case 'close-application': if (!action.application) throw new Error('application is required'); Application(action.application).quit(); return { application: action.application };
    case 'list-windows': { const proc = processFor(action.application); return proc.windows().map((w, index) => ({ id: String(index), name: valueOf(() => w.name(), ''), role: valueOf(() => w.role(), null) })); }
    case 'focus-window': { const proc = processFor(action.application); const windows = proc.windows(); const index = action.windowId === undefined ? 0 : Number(action.windowId); const w = Number.isInteger(index) && index >= 0 ? windows[index] : null; if (!w) throw new Error('window not found'); try { w.actions.byName('AXRaise').perform(); } catch (_) { proc.frontmost = true; } return { id: String(index), name: valueOf(() => w.name(), '') }; }
    case 'move-window': { const proc = processFor(action.application); const w = proc.windows()[Number(action.windowId || 0)]; if (!w || action.x === undefined || action.y === undefined) throw new Error('window/x/y are required'); w.position = [Number(action.x), Number(action.y)]; return {}; }
    case 'resize-window': { const proc = processFor(action.application); const w = proc.windows()[Number(action.windowId || 0)]; if (!w || action.width === undefined || action.height === undefined) throw new Error('window/width/height are required'); w.size = [Number(action.width), Number(action.height)]; return {}; }
    case 'inspect': return describe(targetElement(action));
    case 'find': return describe(targetElement(action));
    case 'click': targetElement(action).click(); return {};
    case 'double-click': { const element = targetElement(action); element.click(); delay(0.08); element.click(); return {}; }
    case 'hover': { const p = centerOf(targetElement(action)); pointerEvent($.kCGEventMouseMoved, p.x, p.y, 0); return p; }
    case 'type': se.keystroke(String(action.text || '')); return { characters: String(action.text || '').length };
    case 'press': se.keystroke(String(action.key || '')); return { key: action.key };
    case 'set-value': { const element = targetElement(action); element.value = action.value; return {}; }
    case 'select': { const element = targetElement(action); element.value = Array.isArray(action.values) ? action.values.join(',') : action.value; return {}; }
    case 'toggle': targetElement(action).click(); return {};
    case 'mouse-move': pointerEvent($.kCGEventMouseMoved, action.x, action.y, 0); return {};
    case 'mouse-down': pointerEvent($.kCGEventLeftMouseDown, action.x, action.y, 0); return {};
    case 'mouse-up': pointerEvent($.kCGEventLeftMouseUp, action.x, action.y, 0); return {};
    case 'drag': { const from = action.source ? centerOf(targetElement(action, action.source)) : { x: Number(action.x), y: Number(action.y) }; const to = action.target ? centerOf(targetElement(action, action.target)) : { x: Number(action.x), y: Number(action.y) }; pointerEvent($.kCGEventLeftMouseDown, from.x, from.y, 0); pointerEvent($.kCGEventLeftMouseDragged, to.x, to.y, 0); pointerEvent($.kCGEventLeftMouseUp, to.x, to.y, 0); return { from, to }; }
    case 'wheel': { const event = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitPixel, 2, Number(action.deltaY || 0), Number(action.deltaX || 0)); $.CGEventPost($.kCGHIDEventTap, event); return {}; }
    case 'wait': delay(Number(action.milliseconds || 0) / 1000); return {};
    default: throw new Error('unsupported macOS desktop action: ' + action.kind);
  }
}

function main() {
  const envelope = readStdin(); const startedAt = now(); const actions = []; let batchStatus = 'succeeded';
  for (const action of envelope.batch.actions) {
    const start = Date.now();
    try { actions.push({ id: action.id, status: 'succeeded', durationMs: Date.now() - start, output: execute(action) }); }
    catch (error) { batchStatus = actions.length ? 'partial' : 'failed'; actions.push({ id: action.id, status: 'failed', durationMs: Date.now() - start, error: { code: 'MACOS_ACTION_FAILED', message: String(error && error.message ? error.message : error) } }); if (envelope.batch.stopOnError !== false) break; }
  }
  return JSON.stringify({ contractVersion: '1.0.0', id: envelope.batch.id + '.result', batchId: envelope.batch.id, status: batchStatus, actions, startedAt, finishedAt: now(), metadata: { bridge: 'q1x-macos-accessibility' } });
}

main();
`;

export const MACOS_ACCESSIBILITY_PROBE = String.raw`
const se = Application('System Events');
JSON.stringify({ enabled: Boolean(se.UIElementsEnabled()) });
`;
