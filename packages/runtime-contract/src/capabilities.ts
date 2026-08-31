export type CapabilityName =
  | 'native_addons'
  | 'docker'
  | 'tcp_remote'
  | 'udp'
  | 'ssh'
  | 'linux_binary'
  | 'filesystem_watch'
  | 'text_search';

export type CapabilityState = 'supported' | 'experimental' | 'unsupported';
export type RuntimeCapabilities = Readonly<Record<CapabilityName, CapabilityState>>;

export function unsupportedCapabilities(): RuntimeCapabilities {
  return {
    native_addons: 'unsupported',
    docker: 'unsupported',
    tcp_remote: 'unsupported',
    udp: 'unsupported',
    ssh: 'unsupported',
    linux_binary: 'unsupported',
    filesystem_watch: 'unsupported',
    text_search: 'unsupported',
  };
}
