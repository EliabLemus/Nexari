export type CapabilityName =
  | 'native_addons'
  | 'docker'
  | 'tcp_remote'
  | 'udp'
  | 'ssh'
  | 'linux_binary'
  | 'permission_changes'
  | 'symlinks'
  | 'filesystem_watch'
  | 'interactive_terminal'
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
    permission_changes: 'unsupported',
    symlinks: 'unsupported',
    filesystem_watch: 'experimental',
    interactive_terminal: 'experimental',
    text_search: 'unsupported',
  };
}
