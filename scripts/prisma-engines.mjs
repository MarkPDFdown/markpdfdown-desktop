/**
 * Which Prisma query engines each package carries. Shared by the script that generates the
 * client and the one that verifies the package, so the two can't drift apart.
 *
 * Prisma picks an engine at runtime from the distro family and the libssl version, not from the
 * machine that built the app, so a Linux package needs one engine per combination it can meet.
 * OpenSSL 1.0 is left out: the distros that ship it have a glibc too old to run Electron at all.
 */
const LINUX_ENGINE_TARGETS = {
  x64: ['debian-openssl-1.1.x', 'debian-openssl-3.0.x', 'rhel-openssl-1.1.x', 'rhel-openssl-3.0.x'],
  // Prisma has a single arm64 engine per libssl version, whatever the distro family.
  arm64: ['linux-arm64-openssl-1.1.x', 'linux-arm64-openssl-3.0.x'],
};

/** Engines a Linux package must contain. @returns {string[]} */
export function linuxEngineTargets(arch) {
  return LINUX_ENGINE_TARGETS[arch] ?? [];
}

/**
 * The `binaryTargets` to generate on a given host. macOS and Windows have one engine per arch,
 * which `native` already is. `native` stays on Linux too, for developing on any other distro.
 * @returns {string[]}
 */
export function binaryTargetsForHost(platform, arch) {
  return platform === 'linux' ? ['native', ...linuxEngineTargets(arch)] : ['native'];
}
