import { configureCrm } from './config.js'

let _token = null
export let crmToken = null

export function setCrmToken(token) {
  _token = token
  crmToken = token
  configureCrm({ getToken: () => _token })
}

export function clearCrmToken() {
  _token = null
  crmToken = null
  configureCrm({ getToken: () => null })
}
