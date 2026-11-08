// Run once by the CI before the tests of Firefox: gets Firefox and geckodriver (from GitHub, from a mirror when GitHub does not
// answer) and starts the browser once, so that the test files, which are as many processes, find them on the machine instead of
// each one waiting for the failing download. See buildFirefox in lib.mjs.
import { buildFirefox } from './lib.mjs'

const driver = await buildFirefox({ persist: true })
await driver.quit()
