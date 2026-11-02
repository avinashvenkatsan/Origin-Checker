export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
export const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
export const baseConfig = { maxImageBytes: 1024, maxTextChars: 5000, demoMode: false, allowUnvalidatedVerdicts: false, trustProxy: false, c2patoolPath: '', rateLimitPerMinute: 100 };
export const okFetch = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
