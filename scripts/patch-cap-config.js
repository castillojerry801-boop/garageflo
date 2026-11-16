// Ensures NativeAuthPlugin stays in packageClassList after `cap sync` overwrites it.
// cap sync regenerates ios/App/App/capacitor.config.json from npm plugin paths only
// (it never scans the App target), so our inline Swift plugin must be re-injected.
// Run via: npm run cap-sync:ios
const fs = require('fs')
const path = require('path')

const configPath = path.join(__dirname, '..', 'ios', 'App', 'App', 'capacitor.config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

if (!config.packageClassList) {
  config.packageClassList = []
}

if (!config.packageClassList.includes('NativeAuthPlugin')) {
  config.packageClassList.push('NativeAuthPlugin')
  fs.writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n')
  console.log('patch-cap-config: added NativeAuthPlugin to packageClassList')
} else {
  console.log('patch-cap-config: NativeAuthPlugin already present')
}
