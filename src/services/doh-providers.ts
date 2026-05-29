export const DOH_PROVIDERS: Record<string, string> = {
  // Cloudflare
  'one.one.one.one':             'https://one.one.one.one/dns-query',
  '1.1.1.1':                    'https://1.1.1.1/dns-query',
  '1.0.0.1':                    'https://1.0.0.1/dns-query',
  'dns.cloudflare.com':         'https://dns.cloudflare.com/dns-query',
  'security.cloudflare-dns.com':'https://security.cloudflare-dns.com/dns-query',
  'family.cloudflare-dns.com':  'https://family.cloudflare-dns.com/dns-query',

  // Google
  'dns.google':  'https://dns.google/dns-query',
  '8.8.8.8':     'https://8.8.8.8/dns-query',
  '8.8.4.4':     'https://8.8.4.4/dns-query',

  // Quad9
  'dns.quad9.net':   'https://dns.quad9.net/dns-query',
  'dns10.quad9.net': 'https://dns10.quad9.net/dns-query',
  'dns11.quad9.net': 'https://dns11.quad9.net/dns-query',
  '9.9.9.9':         'https://9.9.9.9/dns-query',
  '149.112.112.112': 'https://149.112.112.112/dns-query',

  // AdGuard
  'dns.adguard-dns.com':       'https://dns.adguard-dns.com/dns-query',
  'family.adguard-dns.com':    'https://family.adguard-dns.com/dns-query',
  'unfiltered.adguard-dns.com':'https://unfiltered.adguard-dns.com/dns-query',

  // Alibaba DNS
  'dns.alidns.com': 'https://dns.alidns.com/dns-query',

  // Caliph DNS
  'dns.caliph.dev': 'https://dns.caliph.dev/dns-query',

  // BebasID
  'dns.bebasid.com':           'https://dns.bebasid.com/dns-query',
  'antivirus.bebasid.com':     'https://antivirus.bebasid.com/dns-query',
  'internetsehat.bebasid.com': 'https://internetsehat.bebasid.com/dns-query',

  // CFIEC
  'dns.cfiec.net': 'https://dns.cfiec.net/dns-query',

  // OpenDNS (Cisco)
  'doh.opendns.com':              'https://doh.opendns.com/dns-query',
  'doh.familyshield.opendns.com': 'https://doh.familyshield.opendns.com/dns-query',
  'doh.sandbox.opendns.com':      'https://doh.sandbox.opendns.com/dns-query',

  // CleanBrowsing
  'doh.cleanbrowsing.org': 'https://doh.cleanbrowsing.org/doh/security-filter/',

  // ControlD
  'freedns.controld.com': 'https://freedns.controld.com/p0',

  // DeCloudUs
  'dns.decloudus.com': 'https://dns.decloudus.com/dns-query',

  // DNS.SB
  'doh.dns.sb': 'https://doh.dns.sb/dns-query',

  // DNSPub (Tencent)
  'dns.pub':      'https://dns.pub/dns-query',
  'sm2.doh.pub':  'https://sm2.doh.pub/dns-query',

  // Mullvad
  'dns.mullvad.net':          'https://dns.mullvad.net/dns-query',
  'adblock.dns.mullvad.net':  'https://adblock.dns.mullvad.net/dns-query',
  'base.dns.mullvad.net':     'https://base.dns.mullvad.net/dns-query',
  'extended.dns.mullvad.net': 'https://extended.dns.mullvad.net/dns-query',
  'family.dns.mullvad.net':   'https://family.dns.mullvad.net/dns-query',
  'all.dns.mullvad.net':      'https://all.dns.mullvad.net/dns-query',

  // Digitale Gesellschaft
  'dns.digitale-gesellschaft.ch': 'https://dns.digitale-gesellschaft.ch/dns-query',

  // DNS for Family
  'dns-doh.dnsforfamily.com': 'https://dns-doh.dnsforfamily.com/dns-query',

  // JoinDNS4EU
  'protective.joindns4.eu':  'https://protective.joindns4.eu/dns-query',
  'child.joindns4.eu':       'https://child.joindns4.eu/dns-query',
  'noads.joindns4.eu':       'https://noads.joindns4.eu/dns-query',
  'child-noads.joindns4.eu': 'https://child-noads.joindns4.eu/dns-query',

  // RESTENA
  'kaitain.restena.lu': 'https://kaitain.restena.lu/dns-query',

  // NextDNS
  'dns.nextdns.io':          'https://dns.nextdns.io/dns-query',
  'anycast.dns.nextdns.io':  'https://anycast.dns.nextdns.io/dns-query',

  // OpenBLD
  'ada.openbld.net': 'https://ada.openbld.net/dns-query',
  'ric.openbld.net': 'https://ric.openbld.net/dns-query',

  // QIS DNS
  'doh.qis.io': 'https://doh.qis.io/dns-query',

  // RabbitDNS
  'dns.rabbitdns.org':      'https://dns.rabbitdns.org/dns-query',
  'security.rabbitdns.org': 'https://security.rabbitdns.org/dns-query',
  'family.rabbitdns.org':   'https://family.rabbitdns.org/dns-query',

  // RethinkDNS
  'basic.rethinkdns.com': 'https://basic.rethinkdns.com/',

  // Hurricane Electric
  'ordns.he.net': 'https://ordns.he.net/dns-query',

  // 360 DNS
  'doh.360.cn': 'https://doh.360.cn/dns-query',

  // Surfshark
  'dns.surfsharkdns.com': 'https://dns.surfsharkdns.com/dns-query',

  // CERT Estonia
  'dns.cert.ee': 'https://dns.cert.ee/dns-query',

  // CIRA Canadian Shield
  'private.canadianshield.cira.ca':   'https://private.canadianshield.cira.ca/dns-query',
  'protected.canadianshield.cira.ca': 'https://protected.canadianshield.cira.ca/dns-query',
  'family.canadianshield.cira.ca':    'https://family.canadianshield.cira.ca/dns-query',

  // Comss.one
  'dns.comss.one':    'https://dns.comss.one/dns-query',
  'router.comss.one': 'https://router.comss.one/dns-query',

  // NIC.CZ
  'odvr.nic.cz': 'https://odvr.nic.cz/doh',

  // Applied Privacy
  'doh.applied-privacy.net': 'https://doh.applied-privacy.net/query',

  // IIJ DNS
  'public.dns.iij.jp': 'https://public.dns.iij.jp/dns-query',

  // JupitrDNS
  'dns.jupitrdns.com': 'https://dns.jupitrdns.com/dns-query',
}

export function normalizeDoHUrl(input: string): string {
  let url = input.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }
  try {
    const parsed = new URL(url)
    const canonical = DOH_PROVIDERS[parsed.hostname]
    if (canonical && (parsed.pathname === '/' || parsed.pathname === '')) {
      return canonical
    }
  } catch {
    // malformed URL
  }
  return url
}
