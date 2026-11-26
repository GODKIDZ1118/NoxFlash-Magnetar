"""Build and publish clean Magnetar releases from the installed program files."""
import argparse
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zlib

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DIST = ROOT.parent / 'NoxFlash-Magnetar-Releases'
REPO = 'GODKIDZ1118/NoxFlash-Magnetar'
VERSION = re.compile(r'(?:0|[1-9][0-9]{0,4})\.(?:0|[1-9][0-9]{0,4})(?:\.(?:0|[1-9][0-9]{0,4}))?\Z')
BRAND = 'NoxFlash_Magnetar V'
OMIT_PREFIXES = (
    'resources/backend/static/images/screenshots/',
    'resources/backend/static/images/model-pick/',
    'resources/backend/static/updates/',
)
PRIVATE_NAMES = re.compile(r'(?i)(?:^|/)(?:\.env[^/]*|api_providers\.json|history\.json|private[^/]*\.pem|.*\.log)(?:/|$)')
KEY_PATTERN = re.compile(rb'(?i)(?<![a-z0-9_])(?:sk-(?:proj-)?[a-z0-9_-]{22,}|gh[pousr]_[a-z0-9]{25,}|github_pat_[a-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)')


def checked(*args, cwd=ROOT):
    return subprocess.run(args, cwd=cwd, check=True, text=True, encoding='utf-8', errors='replace',
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def owned_files():
    """The pre-existing uninstall manifest enumerates shipped files, not live folders."""
    manifest = ROOT / 'tools/maintenance/owned-files.nsh'
    paths = [item.replace('\\', '/') for item in re.findall(r'^Delete "\$INSTDIR\\([^"]+)"', manifest.read_text('utf-8'), re.M)]
    paths += [
        'desktop/browser-context-preload.js', 'desktop/magnetar-updater.js',
        'desktop/update-channel.json', 'Uninstall NoxFlash.exe',
        'resources/backend/config/providers.json',
        'resources/backend/config/capability_inputs.json',
        'resources/backend/config/mcp_servers.json',
        'resources/backend/config/openclaw.json',
        'resources/backend/server/store_data/curation.json',
    ]
    static = ROOT / 'resources/backend/static'
    paths += [file.relative_to(ROOT).as_posix() for file in static.rglob('*')
              if file.is_file() and file.suffix.lower() in {'.js', '.css', '.html', '.woff2'}
              and file.relative_to(static).parts[0] in {'js', 'css', 'canvas', 'v2', 'vendor'}]
    return sorted({name for name in paths if '/__pycache__/' not in name
                   and not name.startswith(OMIT_PREFIXES) and name != 'resources/app.asar'})


def local_secret_patterns():
    secrets = set()
    for folder in (ROOT, ROOT / 'resources/backend', ROOT / 'data'):
        env = folder / 'API/.env'
        if env.is_file():
            for line in env.read_text('utf-8-sig', errors='replace').splitlines():
                name, _, value = line.partition('=')
                value = value.strip().strip("\042\047")
                if re.search(r'KEY|TOKEN|SECRET|PASSWORD', name, re.I) and len(value) >= 12:
                    secrets.add(value.encode())
        providers = folder / 'data/api_providers.json'
        if providers.is_file():
            def walk(value):
                if isinstance(value, list):
                    for entry in value:
                        walk(entry)
                if isinstance(value, dict):
                    for name, entry in value.items():
                        if isinstance(entry, str) and re.search(r'key|token|secret|password', name, re.I) and len(entry) >= 12:
                            secrets.add(entry.encode())
                        elif isinstance(entry, (list, dict)):
                            walk(entry)
            walk(json.loads(providers.read_text('utf-8-sig')))
    return re.compile(b'|'.join(re.escape(s) for s in sorted(secrets))) if secrets else None


def inspect_backend(data, scan):
    # PyInstaller's compressed payload also needs checking. Scan both the outer archive and PYZ modules.
    marker = data.rfind(b'MEI\x0c\x0b\x0a\x0b\x0e')
    if marker < 0:
        raise ValueError('无法审查后端 EXE 内的程序文件')
    import marshal
    _, length, toc, toc_size, _, _ = struct.unpack_from('>8sIIII64s', data, marker)
    base = marker + 88 - length
    pos, end = base + toc, base + toc + toc_size
    while pos < end:
        size, offset, compressed, original, flag, kind = struct.unpack_from('>IIIIBc', data, pos)
        name = data[pos+18:pos+size].rstrip(b'\0').decode().replace('\\', '/')
        raw = data[base+offset:base+offset+compressed]
        blob = zlib.decompress(raw) if flag else raw
        scan('backend.exe/' + name, blob)
        if kind == b'z' and blob.startswith(b'PYZ\0'):
            entries = marshal.loads(blob[struct.unpack_from('>I', blob, 8)[0]:])
            for module, (_, start, size) in entries:
                if size:
                    scan('backend.exe/' + name + '/' + module.replace('.', '/') + '/__code__', zlib.decompress(blob[start:start+size]))
        pos += size


def validate_file_list(files):
    for name in files:
        if PRIVATE_NAMES.search(name) or any(part in ('..', '') for part in name.split('/')):
            raise ValueError('发布清单包含私有文件或无效路径')
        if name.split('/')[0] in {'API', 'assets', 'data', 'output', 'split_jobs', 'docs'}:
            raise ValueError('发布清单包含本机数据目录')


def source_digest(source):
    digest = hashlib.sha256()
    for file in sorted(source.rglob('*')):
        if file.is_symlink():
            raise ValueError('审核后的程序文件含外部链接')
        if not file.is_file():
            continue
        name = file.relative_to(source).as_posix()
        digest.update(name.encode() + b'\0')
        with file.open('rb') as fd:
            digest.update(hashlib.file_digest(fd, 'sha256').digest())
    return digest.hexdigest()


def build(version, notes, log=print):
    if not VERSION.fullmatch(version) or len(notes) > 4000:
        raise ValueError('请填写有效版本号和 4000 字以内的更新说明')
    out = DIST / ('magnetar-v' + version)
    DIST.mkdir(exist_ok=True)
    try:
        out.mkdir()
    except FileExistsError:
        raise ValueError('同版本的安装包已存在或正在生成。请使用已有安装包或递增版本号。') from None
    output = out.resolve()
    assert output.parent == DIST.resolve()
    try:
        stage = output / 'stage'
        files = owned_files()
        validate_file_list(files)
        secrets = local_secret_patterns()
        def scan(name, data):
            if PRIVATE_NAMES.search(name) or (secrets and secrets.search(data)):
                raise ValueError('发布检查发现本机密钥或数据文件，已停止。请检查 ' + name)
            # Key-pattern examples and documentation can be reviewed without revealing the contents.
            if KEY_PATTERN.search(data) and Path(name).suffix.lower() in {'.py', '.js', '.json', '.html', '.env'}:
                raise ValueError('发布检查发现疑似凭据，已停止。请检查 ' + name)

        log('正在组装程序文件并检查隐私')
        for name in files:
            src = ROOT / name
            if not src.is_file():
                if name in {'NoxFlash.exe', 'resources/backend/NoxFlash.exe', 'resources/backend/VERSION'}:
                    raise ValueError('缺少安装所需的程序文件 ' + name)
                continue
            if not src.resolve().is_relative_to(ROOT) or src.is_symlink():
                raise ValueError('发布清单含外部链接')
            dest = stage / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            blob = src.read_bytes()
            scan(name, blob)
            if name == 'resources/backend/NoxFlash.exe':
                inspect_backend(blob, scan)
            dest.write_bytes(blob)

        # Derive all visible version stamps from the release form in staging only.
        stage_version = BRAND + version
        (stage / 'resources/backend/VERSION').write_text(stage_version + '\n', encoding='utf-8')
        notes_path = stage / 'resources/backend/static/update-notes.json'
        release_notes = {'version': stage_version, 'items': [{'type': 'update', 'text': notes}]} if notes else {'version': stage_version, 'items': []}
        notes_path.write_text(json.dumps(release_notes, ensure_ascii=False, indent=2), 'utf-8')
        scan('release-notes.json', notes_path.read_bytes())
        shell = stage / 'resources/backend/static/v2/assets/noxflash-shell.js'
        shell.write_bytes(re.sub(rb'NoxFlash_Magnetar V[\d.]+', stage_version.encode(), shell.read_bytes()))
        index = stage / 'resources/backend/static/v2/index.html'
        hash_fragment = hashlib.sha256(shell.read_bytes()).hexdigest()[:12].encode()
        index.write_bytes(re.sub(rb'(noxflash-shell\.js\?v=)[a-f\d]+', rb'\g<1>' + hash_fragment, index.read_bytes()))
        checked('py', '-3', str(ROOT / 'tools/maintenance/repack-desktop.py'), str(stage / 'resources/app.asar'))

        source = output / 'source'
        for file in stage.rglob('*'):
            if not file.is_file() or file.suffix.lower() in {'.exe', '.dll', '.pak', '.asar', '.bin', '.dat'}:
                continue
            if file.relative_to(stage).as_posix() == 'tools/maintenance/owned-files.nsh':
                continue
            dest = source / file.relative_to(stage)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, dest)
        tool_paths = [*HERE.glob('*.py'), *HERE.glob('*.js'), *HERE.glob('*.nsi'), *HERE.glob('*.html'),
                      ROOT / 'NoxFlash更新工具.cmd', ROOT / 'tools/maintenance/owned-files.nsh',
                      *(HERE / 'source').iterdir()]
        for file in tool_paths:
            dest = source / file.relative_to(ROOT)
            dest.parent.mkdir(parents=True, exist_ok=True)
            blob = file.read_bytes()
            scan(file.relative_to(ROOT).as_posix(), blob)
            dest.write_bytes(blob)
        for name in ('README.md', 'LICENSE', '.gitignore'):
            dest = source / name
            blob = (HERE / 'source' / name).read_bytes()
            scan(name, blob)
            dest.write_bytes(blob)

        log('隐私检查通过，正在编译 Windows 安装包')
        installer = output / f'NoxFlash-Magnetar-{version}-Setup.exe'
        cache = Path(os.environ["LOCALAPPDATA"]) / 'electron-builder/Cache/nsis'
        compilers = sorted(cache.rglob('makensis.exe'), key=lambda p: len(str(p)))
        compiler = shutil.which('makensis') or (str(compilers[0]) if compilers else None)
        if not compiler:
            raise ValueError('找不到 NSIS 编译器')
        checked(compiler, '/V2', '/NOCD', '/DOUTPUT=' + str(installer), '/DSTAGE=' + str(stage), str(HERE / 'setup.nsi'))

        log('正在签名更新清单')
        manifest = output / 'release-manifest.json'
        with installer.open('rb') as fd:
            digest = hashlib.file_digest(fd, 'sha256').hexdigest()
        manifest.write_text(json.dumps({'version': version, 'file': installer.name, 'size': installer.stat().st_size,
                                        'sha256': digest, 'source_sha256': source_digest(source), 'notes': notes}, ensure_ascii=False), 'utf-8')
        signature = checked('node', str(HERE / 'sign.js'), str(manifest)).strip()
        ready_file = output / 'magnetar-update.json.tmp'
        ready_file.write_text(json.dumps({
            'manifest': base64.b64encode(manifest.read_bytes()).decode(), 'signature': signature,
        }), 'utf-8')
        manifest.unlink()
        shutil.rmtree(stage, ignore_errors=True)
        ready_file.replace(output / 'magnetar-update.json')
        log('安装包已生成 ' + installer.name)
        return out
    except BaseException:
        shutil.rmtree(output, ignore_errors=True)
        raise


def git_credential():
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'}
    p = subprocess.run(['git', 'credential', 'fill'],
                       input='protocol=https\nhost=github.com\nusername=GODKIDZ1118\n\n',
                       capture_output=True, text=True, env=env)
    values = dict(line.split('=', 1) for line in p.stdout.splitlines() if '=' in line)
    if p.returncode or not values.get('password'):
        raise ValueError('本机 GitHub 登录凭据不可用')
    return values['password']


def publish(out, log=print):
    """Create a new source commit, then upload both assets to a draft and publish it."""
    source = out / 'source'
    manifest = json.loads(checked(
        'node', '-e',
        'const fs = require("fs"); const updater = require("./desktop/magnetar-updater");'
        'console.log(JSON.stringify(updater.readRelease(JSON.parse(fs.readFileSync(process.argv[1])))));',
        str(out / 'magnetar-update.json'),
    ))
    if source_digest(source) != manifest.get('source_sha256'):
        raise ValueError('程序源码已变化，请重新打包')
    installer = out / manifest['file']
    # Revalidate the installation bytes at publish time.
    with installer.open('rb') as fd:
        if hashlib.file_digest(fd, 'sha256').hexdigest() != manifest['sha256']:
            raise ValueError('安装包内容已变化，请重新打包')
    token = git_credential()
    headers = {'Authorization': 'Bearer ' + token, 'User-Agent': 'NoxFlash-Publisher',
               'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}

    def api(method, route, body=None, missing=False):
        request = urllib.request.Request('https://api.github.com' + route, method=method, headers=headers)
        if body is not None:
            request.add_header('Content-Type', 'application/json')
            request.data = json.dumps(body).encode()
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404 and missing:
                return None
            raise ValueError(f'GitHub 请求失败（{error.code}）') from None

    account = api('GET', '/user')['login']
    if account.casefold() != REPO.split('/')[0].casefold():
        raise ValueError('GitHub 登录账号与发布仓库所有者不一致')
    repo_route = '/repos/' + REPO
    repo = api('GET', repo_route, missing=True)
    if repo is None:
        repo = api('POST', '/user/repos', {'name': REPO.split('/')[-1], 'private': False,
                                         'description': 'NoxFlash Magnetar Windows canvas'})
    if repo.get('private') or repo.get('full_name', '').casefold() != REPO.casefold():
        raise ValueError('GitHub 发布仓库不符合配置')
    version = manifest['version']
    tag = 'magnetar-v' + version
    releases = api('GET', repo_route + '/releases?per_page=100')
    existing = next((r for r in releases if r.get('tag_name') == tag), None)
    if existing and not existing['draft']:
        raise ValueError('该版本已发布，请使用新的版本号')

    log('正在提交审核后的程序源文件')
    git_url = 'https://github.com/' + REPO + '.git'
    with tempfile.TemporaryDirectory(prefix='noxflash-source-') as tmp:
        checkout = Path(tmp) / 'checkout'
        ref = 'refs/heads/main'
        populated = bool(checked('git', 'ls-remote', git_url, ref).strip())
        if populated:
            checked('git', 'clone', '--depth', '1', '--branch', 'main', git_url, str(checkout))
            checked('git', 'rm', '-r', '--ignore-unmatch', '.', cwd=checkout)
        else:
            checked('git', 'init', '-b', 'main', str(checkout))
            checked('git', 'remote', 'add', 'origin', git_url, cwd=checkout)
        shutil.copytree(source, checkout, dirs_exist_ok=True)
        checked('git', 'add', '--all', cwd=checkout)
        checked('git', '-c', 'user.name=NoxFlash Publisher', '-c',
                'user.email=314621527+GODKIDZ1118@users.noreply.github.com',
                'commit', '--allow-empty', '-m', BRAND + version, cwd=checkout)
        commit = checked('git', 'rev-parse', 'HEAD', cwd=checkout).strip()
        checked('git', 'push', 'origin', 'HEAD:' + ref, cwd=checkout)

    release = existing or api('POST', repo_route + '/releases', {
        'tag_name': tag, 'target_commitish': commit, 'name': BRAND + version,
        'body': manifest['notes'], 'draft': True, 'prerelease': False,
    })
    release_route = repo_route + '/releases/' + str(release['id'])
    log('正在上传安装包与签名清单')
    for file in (installer, out / 'magnetar-update.json'):
        # Retry an interrupted draft without replacing already uploaded assets.
        asset = next((a for a in release['assets'] if a['name'] == file.name), None)
        if asset:
            h = hashlib.sha256()
            with file.open('rb') as fd:
                h = hashlib.file_digest(fd, 'sha256')
            if asset.get('state') == 'uploaded' and asset.get('digest') == 'sha256:' + h.hexdigest():
                continue
            raise ValueError('发布草稿中有同名但未通过校验的文件')
        target = urllib.parse.urlparse(release['upload_url'].split('{', 1)[0])
        if target.scheme != 'https' or target.hostname != 'uploads.github.com':
            raise ValueError('GitHub 上传地址无效')
        size = file.stat().st_size
        def chunks(fd):
            sent, next_report = 0, 5
            for block in iter(lambda: fd.read(1024 * 1024), b''):
                yield block
                sent += len(block)
                percent = sent * 100 // size
                if size > 10 * 1024 * 1024 and percent >= next_report:
                    log(f'安装包上传 {percent}%')
                    next_report = percent + 5

        connection = http.client.HTTPSConnection(target.hostname, timeout=120)
        try:
            with file.open('rb') as fd:
                connection.request('POST', target.path + '?' + urllib.parse.urlencode({'name': file.name}), chunks(fd),
                                   {**headers, 'Content-Type': 'application/octet-stream',
                                    'Content-Length': str(size)})
                response = connection.getresponse()
                response.read()
                if response.status != 201:
                    raise ValueError(f'GitHub 安装包上传失败（{response.status}）')
        finally:
            connection.close()
    result = api('PATCH', release_route, {'draft': False, 'make_latest': 'true', 'target_commitish': commit})
    log('已发布 ' + result['html_url'])
    return result['html_url']


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('build', 'publish'))
    parser.add_argument('version')
    parser.add_argument('--notes', default='')
    args = parser.parse_args()
    if not VERSION.fullmatch(args.version):
        parser.error('版本号无效')
    try:
        if args.action == 'build':
            print(build(args.version, args.notes), flush=True)
        else:
            publish(DIST / ('magnetar-v' + args.version))
    except (ValueError, subprocess.CalledProcessError, OSError) as error:
        print('失败 ' + str(error), file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
