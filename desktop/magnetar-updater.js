'use strict';

const { createHash, verify } = require('node:crypto');
const { createWriteStream, readFileSync } = require('node:fs');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { repository, publicKey } = require('./update-channel.json');

const versionPattern = /^\d{1,5}\.\d{1,5}(?:\.\d{1,5})?$/;
const channel = 'https://github.com/' + repository + '/releases';
const maxInstallerSize = 1_000_000_000;

function isNewer(next, current) {
  if (!versionPattern.test(next) || !versionPattern.test(current)) return false;
  const a = next.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return difference > 0;
  }
  return false;
}

function readRelease(payload, key = publicKey) {
  if (typeof payload.manifest !== 'string' || typeof payload.signature !== 'string') throw new Error('更新清单格式有误');
  const bytes = Buffer.from(payload.manifest, 'base64');
  if (!verify(null, bytes, key, Buffer.from(payload.signature, 'base64'))) throw new Error('更新签名无法验证');
  const release = JSON.parse(bytes.toString('utf8'));
  if (!versionPattern.test(release.version) || release.file !== `NoxFlash-Magnetar-${release.version}-Setup.exe`
      || !/^[a-f0-9]{64}$/.test(release.sha256) || !Number.isInteger(release.size)
      || release.size < 1 || release.size > maxInstallerSize || typeof release.notes !== 'string') {
    throw new Error('更新发布信息有误');
  }
  return release;
}

async function check(resourcesPath) {
  const currentVersion = readFileSync(path.join(resourcesPath, 'backend', 'VERSION'), 'utf8')
    .trim().match(/^NoxFlash_Magnetar V([\d.]+)$/)?.[1];
  if (!currentVersion || !versionPattern.test(currentVersion)) throw new Error('无法识别当前版本');
  const response = await fetch(channel + '/latest/download/magnetar-update.json', {
    signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  if (response.status === 404) return { currentVersion, release: null };
  if (!response.ok) throw new Error('无法读取更新信息');
  const body = await response.text();
  if (body.length > 65536) throw new Error('更新清单过大');
  const release = readRelease(JSON.parse(body));
  return { currentVersion, release: isNewer(release.version, currentVersion) ? release : null };
}

async function download(release, onProgress, url = `${channel}/download/magnetar-v${release.version}/${release.file}`) {
  const directory = await mkdtemp(path.join(tmpdir(), 'noxflash-update-'));
  const file = path.join(directory, release.file);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error('下载安装包失败');
    const hash = createHash('sha256');
    let received = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({
      transform(chunk, encoding, done) {
        received += chunk.length;
        if (received > release.size) return done(new Error('安装包大小不符'));
        hash.update(chunk);
        onProgress(received / release.size);
        done(null, chunk);
      },
    }), createWriteStream(file, { flags: 'wx' }));
    if (received !== release.size || hash.digest('hex') !== release.sha256) throw new Error('安装包校验失败');
    return file;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { check, download, isNewer, readRelease };
