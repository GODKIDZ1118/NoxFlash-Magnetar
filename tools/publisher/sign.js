const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { generateKeyPairSync, createPublicKey, sign } = require('node:crypto');
const folder = path.join(process.env.LOCALAPPDATA || os.homedir(), 'NoxFlashPublisher');
const keyFile = path.join(folder, 'magnetar-ed25519.pem');
fs.mkdirSync(folder, { recursive: true });
if (!fs.existsSync(keyFile)) {
  const { privateKey } = generateKeyPairSync('ed25519');
  fs.writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
}
const privateKey = fs.readFileSync(keyFile);
const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
if (process.argv[2]) {
  const config = require('../../desktop/update-channel.json');
  if (config.publicKey !== publicKey) throw new Error('发布签名密钥与客户端内置公钥不匹配。');
  process.stdout.write(sign(null, fs.readFileSync(process.argv[2]), privateKey).toString('base64'));
} else {
  process.stdout.write(JSON.stringify({ repository: 'GODKIDZ1118/NoxFlash-Magnetar', publicKey }, null, 2) + '\n');
}
