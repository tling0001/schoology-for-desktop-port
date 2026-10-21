import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const outputDir = path.resolve('macos-certificate-output');
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });

const privateKeyB64 = process.env.MACOS_CERTIFICATE_PRIVATE_KEY_PEM_BASE64?.trim();
const certificateCerB64 = process.env.MACOS_DEVELOPER_ID_CERTIFICATE_CER_BASE64?.trim();

if (!privateKeyB64 || !certificateCerB64) {
  const keyPath = path.join(outputDir, 'Schoology-Developer-ID-Application-private-key.pem');
  const csrPath = path.join(outputDir, 'Schoology-Developer-ID-Application.csr');
  execFileSync('openssl', [
    'req', '-new', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', csrPath,
    '-subj', '/CN=Schoology Desktop Port/O=Schoology Desktop Port/C=US'
  ], { stdio: 'inherit' });
  await fs.chmod(keyPath, 0o600);
  const privateKey = (await fs.readFile(keyPath)).toString('base64');
  await fs.writeFile(path.join(outputDir, 'MACOS_CERTIFICATE_PRIVATE_KEY_PEM_BASE64.txt'), privateKey + '\n', { mode: 0o600 });
  await fs.rm(keyPath, { force: true });
  await fs.writeFile(path.join(outputDir, 'SETUP-INSTRUCTIONS.txt'), [
    'MACOS DEVELOPER ID CERTIFICATE SETUP — keep all signing material private.',
    '',
    'This first run creates a CSR and its matching private key. Apple requires Developer ID certificates to be created through the Apple Developer website or Xcode; the App Store Connect API cannot create this certificate type.',
    '',
    '1. In GitHub Settings > Secrets and variables > Actions, add secret:',
    '   MACOS_CERTIFICATE_PRIVATE_KEY_PEM_BASE64 = full contents of MACOS_CERTIFICATE_PRIVATE_KEY_PEM_BASE64.txt',
    '2. Open https://developer.apple.com/account/resources/certificates/list and click +.',
    '3. Choose Developer ID > Developer ID Application.',
    '4. Upload Schoology-Developer-ID-Application.csr from this artifact and download the resulting .cer file.',
    '5. Base64-encode the downloaded .cer file and add it as the repository Actions secret:',
    '   MACOS_DEVELOPER_ID_CERTIFICATE_CER_BASE64',
    '   On Windows PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\\path\\to\\developerid.cer"))',
    '   Copy the entire one-line output into the secret.',
    '6. Run this workflow again with Generate macOS Developer ID certificate setup checked.',
    '   The next run will combine the certificate and private key into a password-protected .p12.',
    '',
    'The private key and CSR must remain a pair. Do not generate a new key after Apple issues the certificate.',
    'The setup artifact expires after one day. Never commit or share the private key, .p12, or password.'
  ].join('\n') + '\n');
  console.log('Generated Developer ID CSR and private key setup materials.');
} else {
  const keyPath = path.join(outputDir, 'Schoology-Developer-ID-Application-private-key.pem');
  const cerPath = path.join(outputDir, 'Schoology-Developer-ID-Application.cer');
  const pemPath = path.join(outputDir, 'Schoology-Developer-ID-Application.pem');
  const p12Path = path.join(outputDir, 'Schoology-Developer-ID-Application.p12');
  await fs.writeFile(keyPath, Buffer.from(privateKeyB64, 'base64'), { mode: 0o600 });
  await fs.writeFile(cerPath, Buffer.from(certificateCerB64, 'base64'), { mode: 0o600 });
  execFileSync('openssl', ['x509', '-inform', 'DER', '-in', cerPath, '-out', pemPath], { stdio: 'inherit' });
  const subject = execFileSync('openssl', ['x509', '-in', pemPath, '-noout', '-subject'], { encoding: 'utf8' }).trim();
  if (!subject.includes('Developer ID Application')) {
    throw new Error(`The supplied certificate does not appear to be a Developer ID Application certificate. Certificate subject: ${subject}`);
  }
  const p12Password = crypto.randomBytes(24).toString('base64url');
  execFileSync('openssl', [
    'pkcs12', '-export', '-inkey', keyPath, '-in', pemPath,
    '-out', p12Path, '-passout', `pass:${p12Password}`
  ], { stdio: 'inherit' });
  await fs.chmod(p12Path, 0o600);
  const p12Base64 = (await fs.readFile(p12Path)).toString('base64');
  await fs.writeFile(path.join(outputDir, 'MACOS_CERTIFICATE_P12_BASE64.txt'), p12Base64 + '\n', { mode: 0o600 });
  await fs.writeFile(path.join(outputDir, 'MACOS_CERTIFICATE_PASSWORD.txt'), p12Password + '\n', { mode: 0o600 });
  const identity = subject.replace(/^subject=\s*/, '').replaceAll('\\', '');
  await fs.writeFile(path.join(outputDir, 'MACOS_SIGNING_IDENTITY.txt'), identity + '\n');
  await fs.writeFile(path.join(outputDir, 'SETUP-INSTRUCTIONS.txt'), [
    'MACOS DEVELOPER ID CERTIFICATE READY.',
    '',
    'In GitHub Settings > Secrets and variables > Actions, create/update:',
    '  MACOS_CERTIFICATE_P12_BASE64 = full contents of MACOS_CERTIFICATE_P12_BASE64.txt',
    '  MACOS_CERTIFICATE_PASSWORD = contents of MACOS_CERTIFICATE_PASSWORD.txt without the trailing newline',
    '  MACOS_SIGNING_IDENTITY = full identity shown in MACOS_SIGNING_IDENTITY.txt',
    '',
    'Keep the private key, .p12, and password secret. Artifact expires after one day.',
    'After configuring the secrets, run the normal workflow with both certificate-generation checkboxes unchecked to build macOS and let the existing signing/notarization steps run.'
  ].join('\n') + '\n');
  await fs.rm(keyPath, { force: true });
  await fs.rm(cerPath, { force: true });
  await fs.rm(pemPath, { force: true });
  console.log('Created the Developer ID .p12 and setup instructions.');
}
