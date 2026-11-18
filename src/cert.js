const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');

const CERT_DIR = path.join(__dirname, '..', 'certs');
const CA_KEY_PATH = path.join(CERT_DIR, 'PadletLocal-RootCA.key');
const CA_CERT_PATH = path.join(CERT_DIR, 'PadletLocal-RootCA.crt');
const KEY_PATH = path.join(CERT_DIR, 'server.key');
const CERT_PATH = path.join(CERT_DIR, 'server.cert');
const META_PATH = path.join(CERT_DIR, 'meta.json');

const CA_VERSION = 2; // v2 = Proper Local Root CA + CA-signed Leaf Cert (<= 365 days)
const MAX_LEAF_AGE_MS = 300 * 24 * 60 * 60 * 1000; // Renew leaf cert after 300 days

function ensureCertDir() {
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
  }
}

function randomSerialHex() {
  // Positive 16-byte hex serial number (MSB cleared)
  const buf = crypto.randomBytes(16);
  buf[0] = buf[0] & 0x7f;
  if (buf[0] === 0) buf[0] = 1;
  return buf.toString('hex');
}

function createRootCA() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerialHex();
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000); // -1 day for clock skew
  cert.validity.notAfter = new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000); // 10 years

  const attrs = [
    { name: 'commonName', value: 'PadletLocal Root CA' },
    { name: 'organizationName', value: 'PadletLocal Red Local' },
    { name: 'countryName', value: 'ES' },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      critical: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      digitalSignature: true,
      critical: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certPem = forge.pki.certificateToPem(cert);

  fs.writeFileSync(CA_KEY_PATH, keyPem, 'utf8');
  fs.writeFileSync(CA_CERT_PATH, certPem, 'utf8');

  return {
    privateKey: keys.privateKey,
    certificate: cert,
    keyPem,
    certPem,
    created: true,
  };
}

function loadOrCreateRootCA() {
  ensureCertDir();
  if (fs.existsSync(CA_KEY_PATH) && fs.existsSync(CA_CERT_PATH)) {
    try {
      const keyPem = fs.readFileSync(CA_KEY_PATH, 'utf8');
      const certPem = fs.readFileSync(CA_CERT_PATH, 'utf8');
      const privateKey = forge.pki.privateKeyFromPem(keyPem);
      const certificate = forge.pki.certificateFromPem(certPem);
      return { privateKey, certificate, keyPem, certPem, created: false };
    } catch {
      // Regenerate if corrupted
    }
  }
  return createRootCA();
}

function isExistingLeafValid(ipAddresses, hostname) {
  if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH) || !fs.existsSync(META_PATH)) {
    return false;
  }
  try {
    const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    if (meta.caVersion !== CA_VERSION) return false;
    const age = Date.now() - (meta.createdAt || 0);
    if (age > MAX_LEAF_AGE_MS) return false;
    if (meta.hostname !== hostname) return false;

    const existingSet = new Set(meta.ipAddresses || []);
    return ipAddresses.every((ip) => existingSet.has(ip));
  } catch {
    return false;
  }
}

function createSignedServerCert(ca, ipAddresses, hostname) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerialHex();
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // Keep <= 365 days (browsers reject leaf certs > 398 days)
  cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const primaryLabel = ipAddresses.find((ip) => ip !== '127.0.0.1') || 'localhost';
  cert.setSubject([
    { name: 'commonName', value: primaryLabel },
    { name: 'organizationName', value: 'PadletLocal Red Local' },
  ]);
  cert.setIssuer(ca.certificate.subject.attributes);

  const altNames = [
    { type: 2, value: 'localhost' }, // DNS
    ...ipAddresses.map((ip) => ({ type: 7, ip })), // IP SAN
  ];

  if (hostname && /^[a-zA-Z0-9.-]+$/.test(hostname) && hostname.toLowerCase() !== 'localhost') {
    altNames.push({ type: 2, value: hostname });
    if (!hostname.includes('.')) {
      altNames.push({ type: 2, value: `${hostname}.local` });
    }
  }

  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false,
      critical: true,
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: ca.certificate.generateSubjectKeyIdentifier().getBytes(),
    },
    {
      name: 'subjectAltName',
      altNames,
    },
  ]);

  cert.sign(ca.privateKey, forge.md.sha256.create());

  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certPem = forge.pki.certificateToPem(cert);

  fs.writeFileSync(KEY_PATH, keyPem, 'utf8');
  fs.writeFileSync(CERT_PATH, certPem, 'utf8');
  fs.writeFileSync(
    META_PATH,
    JSON.stringify(
      {
        caVersion: CA_VERSION,
        createdAt: Date.now(),
        ipAddresses,
        hostname,
      },
      null,
      2
    ),
    'utf8'
  );

  return { keyPem, certPem };
}

async function getOrCreateCertificate(localIPs = [], { forceRegenerate = false } = {}) {
  ensureCertDir();
  const uniqueIPs = Array.from(new Set(['127.0.0.1', ...localIPs]));
  const hostname = os.hostname();

  const ca = forceRegenerate ? createRootCA() : loadOrCreateRootCA();

  if (!forceRegenerate && !ca.created && isExistingLeafValid(uniqueIPs, hostname)) {
    const keyPem = fs.readFileSync(KEY_PATH, 'utf8');
    const leafCertPem = fs.readFileSync(CERT_PATH, 'utf8');
    return {
      key: keyPem,
      cert: `${leafCertPem}\n${ca.certPem}`,
      caCertPath: CA_CERT_PATH,
      regenerated: false,
      caCreated: false,
    };
  }

  const leaf = createSignedServerCert(ca, uniqueIPs, hostname);
  return {
    key: leaf.keyPem,
    cert: `${leaf.certPem}\n${ca.certPem}`,
    caCertPath: CA_CERT_PATH,
    regenerated: true,
    caCreated: ca.created,
  };
}

// Allow running directly before server startup: `node src/cert.js [--force]`
if (require.main === module) {
  const { getLocalIPs } = require('./network');
  const forceRegenerate = process.argv.includes('--force');
  const ips = getLocalIPs().map((i) => i.address);

  getOrCreateCertificate(ips, { forceRegenerate })
    .then((res) => {
      console.log(
        res.caCreated
          ? `[Certificados] Nueva Autoridad Raiz creada: ${res.caCertPath}`
          : `[Certificados] Autoridad Raiz lista: ${res.caCertPath}`
      );
      console.log(
        res.regenerated
          ? `[Certificados] Certificado HTTPS firmado para IPs: 127.0.0.1, ${ips.join(', ')}`
          : `[Certificados] Certificado HTTPS vigente para IPs: 127.0.0.1, ${ips.join(', ')}`
      );
    })
    .catch((err) => {
      console.error('[Certificados] Error:', err.message);
      process.exit(1);
    });
}

module.exports = {
  getOrCreateCertificate,
  CA_CERT_PATH,
  CERT_DIR,
};
