#!/usr/bin/env python3
import json
import os
import shutil
import signal
import subprocess
import sys
import time

import gi

gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

MAX_VISITED = 5000


def children(node):
    result = []
    try:
        count = int(node.get_child_count())
        for index in range(min(count, MAX_VISITED)):
            child = node.get_child_at_index(index)
            if child is not None:
                result.append(child)
    except Exception:
        return []
    return result


def safe(callable_value, fallback=None):
    try:
        value = callable_value()
        return fallback if value is None else value
    except Exception:
        return fallback


def describe(node):
    if node is None:
        return None
    record = {
        'name': safe(lambda: node.get_name(), ''),
        'description': safe(lambda: node.get_description(), ''),
        'role': safe(lambda: node.get_role_name(), ''),
        'accessibilityId': safe(lambda: node.get_accessible_id(), ''),
        'processId': safe(lambda: int(node.get_process_id()), None),
    }
    component = safe(lambda: node.get_component_iface(), None)
    if component is not None:
        rect = safe(lambda: component.get_extents(Atspi.CoordType.SCREEN), None)
        if rect is not None:
            record['bounds'] = {'x': rect.x, 'y': rect.y, 'width': rect.width, 'height': rect.height}
    text_iface = safe(lambda: node.get_text_iface(), None)
    if text_iface is not None:
        count = safe(lambda: int(text_iface.get_character_count()), 0)
        if count > 0:
            record['text'] = safe(lambda: text_iface.get_text(0, min(count, 4096)), '')
    value_iface = safe(lambda: node.get_value_iface(), None)
    if value_iface is not None:
        record['value'] = safe(lambda: value_iface.get_current_value(), None)
    return record


def matches_text(actual, expected, exact=False):
    if actual is None or expected is None:
        return False
    actual = str(actual)
    expected = str(expected)
    if exact:
        return actual.casefold() == expected.casefold()
    return expected.casefold() in actual.casefold()


def matches_target(node, target):
    if not target:
        return True
    by = target.get('by')
    if by == 'accessibility-id':
        return matches_text(safe(lambda: node.get_accessible_id(), ''), target.get('value'), True)
    if by == 'name':
        return matches_text(safe(lambda: node.get_name(), ''), target.get('value'), bool(target.get('exact')))
    if by == 'role':
        if not matches_text(safe(lambda: node.get_role_name(), ''), target.get('role'), False):
            return False
        name = target.get('name')
        return not name or matches_text(safe(lambda: node.get_name(), ''), name, bool(target.get('exact')))
    if by == 'text':
        expected = target.get('value')
        if matches_text(safe(lambda: node.get_name(), ''), expected, bool(target.get('exact'))):
            return True
        text_iface = safe(lambda: node.get_text_iface(), None)
        if text_iface is not None:
            count = safe(lambda: int(text_iface.get_character_count()), 0)
            value = safe(lambda: text_iface.get_text(0, min(count, 4096)), '')
            if matches_text(value, expected, bool(target.get('exact'))):
                return True
        return matches_text(safe(lambda: node.get_description(), ''), expected, bool(target.get('exact')))
    if by == 'path':
        return False
    return False


def desktop():
    root = Atspi.get_desktop(0)
    if root is None:
        raise RuntimeError('AT-SPI desktop is unavailable')
    return root


def find_application(name):
    if not name:
        return None
    root = desktop()
    for app in children(root):
        if matches_text(safe(lambda: app.get_name(), ''), name, True):
            return app
        process_name = safe(lambda: os.path.basename(os.readlink(f'/proc/{int(app.get_process_id())}/exe')), '')
        if process_name and matches_text(process_name, name, True):
            return app
    return None


def find_element(root, target):
    if root is None:
        return None
    queue = [root]
    visited = 0
    while queue and visited < MAX_VISITED:
        node = queue.pop(0)
        visited += 1
        if matches_target(node, target):
            return node
        queue.extend(children(node))
    return None


def resolve_element(action):
    root = find_application(action.get('application')) if action.get('application') else desktop()
    if root is None:
        raise RuntimeError(f"application not found: {action.get('application')}")
    target = action.get('target')
    if not target:
        return root
    node = find_element(root, target)
    if node is None:
        raise RuntimeError('AT-SPI target not found')
    return node


def invoke_named_action(node, preferred):
    iface = safe(lambda: node.get_action_iface(), None)
    if iface is None:
        return False
    count = safe(lambda: int(iface.get_n_actions()), 0)
    names = []
    for index in range(count):
        name = str(safe(lambda i=index: iface.get_action_name(i), '')).casefold()
        names.append(name)
        if name in preferred or any(token in name for token in preferred):
            if iface.do_action(index):
                return True
    if count > 0 and any(token in ('click', 'press', 'activate', 'invoke') for token in preferred):
        return bool(iface.do_action(0))
    return False


def element_center(node):
    component = safe(lambda: node.get_component_iface(), None)
    if component is None:
        raise RuntimeError('target does not expose AT-SPI Component bounds')
    rect = component.get_extents(Atspi.CoordType.SCREEN)
    if rect.width <= 0 or rect.height <= 0:
        raise RuntimeError('target has no clickable bounds')
    return int(rect.x + rect.width / 2), int(rect.y + rect.height / 2)


def mouse_event(x, y, name):
    if not Atspi.generate_mouse_event(int(x), int(y), name):
        raise RuntimeError(f'AT-SPI mouse event {name} failed')


def key_event(key):
    keymap = {
        'enter': 0xff0d, 'return': 0xff0d, 'tab': 0xff09, 'escape': 0xff1b, 'esc': 0xff1b,
        'backspace': 0xff08, 'delete': 0xffff, 'up': 0xff52, 'down': 0xff54,
        'left': 0xff51, 'right': 0xff53, 'home': 0xff50, 'end': 0xff57,
        'pageup': 0xff55, 'pagedown': 0xff56, 'space': 0x20,
    }
    lowered = str(key or '').casefold()
    if lowered in keymap:
        if not Atspi.generate_keyboard_event(keymap[lowered], None, Atspi.KeySynthType.SYM):
            raise RuntimeError(f'AT-SPI key event failed: {key}')
        return
    if not Atspi.generate_keyboard_event(0, str(key or ''), Atspi.KeySynthType.STRING):
        raise RuntimeError(f'AT-SPI key string failed: {key}')


def screenshot(path):
    if not path:
        raise RuntimeError('screenshot requires outputPath')
    candidates = [
        ('gnome-screenshot', ['-f', path]),
        ('grim', [path]),
        ('scrot', [path]),
    ]
    for command, args in candidates:
        executable = shutil.which(command)
        if executable:
            completed = subprocess.run([executable, *args], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30, check=False)
            if completed.returncode == 0:
                return {'outputPath': path, 'backend': command}
            raise RuntimeError((completed.stderr or f'{command} failed').strip()[:512])
    raise RuntimeError('no supported Linux screenshot utility found (gnome-screenshot, grim or scrot)')


def execute(action):
    kind = action.get('kind')
    if kind == 'list-applications':
        return [describe(app) for app in children(desktop())]
    if kind == 'launch-application':
        application = action.get('application')
        if not application:
            raise RuntimeError('application is required')
        process = subprocess.Popen([application, *list(action.get('arguments') or [])], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        return {'processId': process.pid, 'application': application}
    if kind == 'focus-application':
        app = find_application(action.get('application'))
        if app is None:
            raise RuntimeError('application not found')
        component = safe(lambda: app.get_component_iface(), None)
        if component is None or not component.grab_focus():
            window = find_element(app, {'by': 'role', 'role': 'window'})
            component = safe(lambda: window.get_component_iface(), None) if window is not None else None
            if component is None or not component.grab_focus():
                raise RuntimeError('application cannot be focused through AT-SPI')
        return describe(app)
    if kind == 'close-application':
        app = find_application(action.get('application'))
        if app is None:
            raise RuntimeError('application not found')
        if invoke_named_action(app, ('close', 'quit', 'exit')):
            return describe(app)
        pid = int(app.get_process_id())
        if pid <= 1:
            raise RuntimeError('application process id is unavailable')
        os.kill(pid, signal.SIGTERM)
        return {'processId': pid}
    if kind == 'list-windows':
        app = find_application(action.get('application')) if action.get('application') else desktop()
        if app is None:
            raise RuntimeError('application not found')
        result = []
        for node in children(app):
            role = str(safe(lambda n=node: n.get_role_name(), '')).casefold()
            if any(value in role for value in ('window', 'frame', 'dialog')):
                result.append(describe(node))
        return result
    if kind == 'focus-window':
        app = find_application(action.get('application')) if action.get('application') else desktop()
        if app is None:
            raise RuntimeError('application not found')
        window_id = action.get('windowId')
        node = None
        for candidate in children(app):
            info = describe(candidate)
            if not window_id or str(info.get('accessibilityId') or info.get('name') or '') == str(window_id):
                node = candidate
                break
        if node is None:
            raise RuntimeError('window not found')
        component = safe(lambda: node.get_component_iface(), None)
        if component is None or not component.grab_focus():
            raise RuntimeError('window cannot be focused through AT-SPI')
        return describe(node)
    if kind in ('inspect', 'find'):
        return describe(resolve_element(action))
    if kind in ('click', 'double-click'):
        node = resolve_element(action)
        if kind == 'click' and invoke_named_action(node, ('click', 'press', 'activate', 'invoke')):
            return {}
        x, y = element_center(node)
        mouse_event(x, y, 'b1d' if kind == 'double-click' else 'b1c')
        return {}
    if kind == 'type':
        node = resolve_element(action) if action.get('target') else None
        if node is not None:
            component = safe(lambda: node.get_component_iface(), None)
            if component is not None:
                component.grab_focus()
        text = str(action.get('text') or '')
        if not Atspi.generate_keyboard_event(0, text, Atspi.KeySynthType.STRING):
            raise RuntimeError('AT-SPI text input failed')
        return {'characters': len(text)}
    if kind == 'press':
        node = resolve_element(action) if action.get('target') else None
        if node is not None:
            component = safe(lambda: node.get_component_iface(), None)
            if component is not None:
                component.grab_focus()
        key_event(action.get('key'))
        return {'key': action.get('key')}
    if kind == 'set-value':
        node = resolve_element(action)
        value = action.get('value')
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            iface = safe(lambda: node.get_value_iface(), None)
            if iface is not None and iface.set_current_value(float(value)):
                return {'value': value}
        editable = safe(lambda: node.get_editable_text_iface(), None)
        if editable is not None and editable.set_text_contents('' if value is None else str(value)):
            return {'value': value}
        raise RuntimeError('target does not expose writable AT-SPI Value or EditableText')
    if kind == 'select':
        node = resolve_element(action)
        if invoke_named_action(node, ('select', 'choose', 'activate')):
            return {}
        parent = safe(lambda: node.get_parent(), None)
        selection = safe(lambda: parent.get_selection_iface(), None) if parent is not None else None
        index = safe(lambda: int(node.get_index_in_parent()), -1)
        if selection is not None and index >= 0 and selection.select_child(index):
            return {}
        raise RuntimeError('target does not expose an AT-SPI selection action')
    if kind == 'toggle':
        node = resolve_element(action)
        if invoke_named_action(node, ('toggle', 'check', 'press', 'activate')):
            return {}
        raise RuntimeError('target does not expose an AT-SPI toggle action')
    if kind == 'mouse-move':
        mouse_event(action.get('x', 0), action.get('y', 0), 'abs'); return {}
    if kind == 'mouse-down':
        mouse_event(action.get('x', 0), action.get('y', 0), 'b1p'); return {}
    if kind == 'mouse-up':
        mouse_event(action.get('x', 0), action.get('y', 0), 'b1r'); return {}
    if kind == 'wheel':
        raise RuntimeError('AT-SPI global wheel synthesis is not portable; use semantic actions or a platform session helper')
    if kind == 'drag':
        x = int(action.get('x', 0)); y = int(action.get('y', 0))
        mouse_event(x, y, 'b1p')
        mouse_event(x + int(action.get('width', 0)), y + int(action.get('height', 0)), 'abs')
        mouse_event(x + int(action.get('width', 0)), y + int(action.get('height', 0)), 'b1r')
        return {}
    if kind == 'wait':
        time.sleep(max(0, int(action.get('milliseconds', 0))) / 1000.0); return {}
    if kind == 'screenshot':
        return screenshot(action.get('outputPath'))
    raise RuntimeError(f'unsupported Linux desktop action: {kind}')


def main():
    envelope = json.loads(sys.stdin.read())
    started_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    results = []
    successes = 0
    for action in envelope.get('batch', {}).get('actions', []):
        started = time.monotonic()
        try:
            output = execute(action)
            successes += 1
            results.append({'id': action['id'], 'status': 'succeeded', 'durationMs': int((time.monotonic() - started) * 1000), 'output': output})
        except Exception as error:
            message = str(error)[:512]
            code = 'LINUX_ACTION_FAILED'
            if 'Wayland' in message or 'session' in message:
                code = 'LINUX_SESSION_CONSTRAINT'
            results.append({'id': action.get('id', 'unknown'), 'status': 'failed', 'durationMs': int((time.monotonic() - started) * 1000), 'error': {'code': code, 'message': message}})
            if envelope.get('batch', {}).get('stopOnError', True) is not False:
                break
    if not results or successes == len(results):
        status = 'succeeded'
    elif successes == 0:
        status = 'failed'
    else:
        status = 'partial'
    batch_id = str(envelope.get('batch', {}).get('id', 'desktop.batch'))
    result = {
        'contractVersion': '1.0.0',
        'id': batch_id + '.result',
        'batchId': batch_id,
        'status': status,
        'actions': results,
        'startedAt': started_at,
        'finishedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'metadata': {'bridge': 'q1x-linux-atspi'},
    }
    sys.stdout.write(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    main()
