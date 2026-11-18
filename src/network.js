const os = require('os');

function getInterfacePriority(name, address) {
  const lower = name.toLowerCase();
  // Deprioritize virtual adapters (WSL, Hyper-V, Docker, VirtualBox, VMware)
  const virtualKeywords = ['vethernet', 'virtual', 'vmware', 'vbox', 'docker', 'wsl', 'loopback', 'tailscale', 'zerotier'];
  const isVirtual = virtualKeywords.some((kw) => lower.includes(kw));

  let score = 0;
  if (!isVirtual) score += 100;
  if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wlan')) score += 30;
  if (lower.includes('ethernet') || lower.includes('eth') || lower.includes('en0')) score += 25;

  // Prefer common private LAN ranges
  if (address.startsWith('192.168.')) score += 20;
  else if (address.startsWith('10.')) score += 15;
  else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) score += 10;

  return score;
}

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const results = [];

  for (const [interfaceName, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const info of addrs) {
      const family = typeof info.family === 'string' ? info.family : String(info.family);
      if ((family === 'IPv4' || family === '4') && !info.internal) {
        results.push({
          interfaceName,
          address: info.address,
          priority: getInterfacePriority(interfaceName, info.address),
        });
      }
    }
  }

  results.sort((a, b) => b.priority - a.priority);
  return results.map(({ interfaceName, address }) => ({ interfaceName, address }));
}

function getPrimaryLocalIP() {
  const ips = getLocalIPs();
  return ips.length > 0 ? ips[0].address : '127.0.0.1';
}

module.exports = {
  getLocalIPs,
  getPrimaryLocalIP,
};
