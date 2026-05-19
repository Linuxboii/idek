let cfg = {
  apiBaseUrl: '',
  wsBaseUrl: '',
  getToken: () => null,
  onUnauthorized: () => {},
}

export function configureCrm(partial) {
  cfg = { ...cfg, ...partial }
}

export function getCrmConfig() {
  return cfg
}
