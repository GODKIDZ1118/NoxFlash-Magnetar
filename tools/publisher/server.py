"""Local web interface for the NoxFlash publishing tool."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import threading
import webbrowser

from release import BRAND, DIST, HERE, REPO, ROOT, VERSION, build, publish

SESSION = secrets.token_urlsafe(24)
STATE = {'busy': False, 'messages': [], 'version': '', 'status': '', 'link': ''}
LOCK = threading.Lock()


def log(message):
    with LOCK:
        STATE['messages'].append(message)


def run(action, version, notes):
    try:
        out = DIST / ('magnetar-v' + version)
        if action == 'build':
            build(version, notes, log)
        else:
            url = publish(out, log)
            with LOCK:
                STATE['link'] = url
        with LOCK:
            STATE['status'] = 'built' if action == 'build' else 'published'
    except Exception as error:
        log('操作失败 ' + str(error))
        if getattr(error, 'stderr', ''):
            log(error.stderr[-3000:])
        with LOCK:
            STATE['status'] = 'failed'
    finally:
        with LOCK:
            STATE['busy'] = False


class Page(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, code, data, content_type='application/json; charset=utf-8'):
        if isinstance(data, dict):
            data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(data)

    def local_host(self):
        return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)

    def do_GET(self):
        if not self.local_host():
            return self.respond(403, {'error': '仅支持本机访问'})
        if self.path == '/' + SESSION + '/':
            return self.respond(200, (HERE / 'index.html').read_bytes(), 'text/html; charset=utf-8')
        if self.path == '/' + SESSION + '/logo.png':
            logo = ROOT / 'resources/backend/static/images/logo_mark_dark_128.png'
            return self.respond(200, logo.read_bytes(), 'image/png')
        if self.path == '/' + SESSION + '/status':
            with LOCK:
                info = {**STATE, 'messages': list(STATE['messages'])}
            current = (ROOT / 'resources/backend/VERSION').read_text('utf-8').strip().removeprefix(BRAND)
            built = sorted([p.name.removeprefix('magnetar-v') for p in DIST.glob('magnetar-v*') if (p / 'magnetar-update.json').is_file()])
            return self.respond(200, {**info, 'current': current, 'built': built, 'repository': REPO})
        return self.respond(404, {'error': '页面未找到'})

    def do_POST(self):
        if not self.local_host() or self.headers.get('Origin') != 'http://' + self.headers.get('Host', ''):
            return self.respond(403, {'error': '仅支持本机访问'})
        prefix = '/' + SESSION + '/'
        action = self.path.removeprefix(prefix)
        if not self.path.startswith(prefix) or action not in {'build', 'publish', 'open'}:
            return self.respond(404, {'error': '操作不可用'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 20000:
                raise ValueError()
            data = json.loads(self.rfile.read(length))
            version = data['version']
            notes = data.get('notes', '')
            if not VERSION.fullmatch(version) or not isinstance(notes, str) or len(notes) > 4000:
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            return self.respond(400, {'error': '请检查版本号和更新说明'})
        if action == 'open':
            folder = DIST / ('magnetar-v' + version)
            if not folder.is_dir():
                return self.respond(404, {'error': '还没有可打开的安装包'})
            os.startfile(folder)
            return self.respond(200, {'ok': True})
        with LOCK:
            if STATE['busy']:
                return self.respond(409, {'error': '已有工作正在进行'})
            STATE.update(busy=True, messages=[], version=version, status=action, link='')
        threading.Thread(target=run, args=(action, version, notes)).start()
        return self.respond(202, {'ok': True})


def main():
    with ThreadingHTTPServer(('127.0.0.1', 0), Page) as server:
        url = f'http://127.0.0.1:{server.server_port}/{SESSION}/'
        print(url, flush=True)
        if os.environ.get('NOXFLASH_PUBLISHER_NO_BROWSER') != '1':
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
