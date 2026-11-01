const { FAKE_PLATFORM: platform, FAKE_ARCH: arch, FAKE_MUSL: isMusl, FAKE_UID: uid } = process.env;

if (platform) Object.defineProperty(process, 'platform', { value: platform });
if (arch) Object.defineProperty(process, 'arch', { value: arch });
if (isMusl) process.report.getReport = () => ({ header: {} });
if (uid) process.getuid = () => Number(uid);
