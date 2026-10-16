/* Compile the production dispatcher without Android or a full APK build. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const vm = require('vm');
let callbackScenarios = 0;
const assert = require('assert');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sptv-dispatcher-'));
const bin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') + path.sep : '';
try {
    for (const [command, args] of [
        ['javac', ['--release', '8', '-d', output, 'apk/app/src/main/java/com/fgl27/twitch/RequestDispatcher.java', 'release/scripts/java/RequestDispatcherTest.java']],
        ['java', ['-cp', output, 'com.fgl27.twitch.RequestDispatcherTest']]
    ]) {
        const result = spawnSync(bin + command, args, {encoding: 'utf8'});
        if (result.stderr) process.stderr.write(result.stderr);
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(command + ' failed with exit ' + result.status + ': ' + result.stdout);
        for (const line of (result.stdout || '').trim().split('\n')) {
            if (!line.startsWith('CALLBACK_SCRIPT:')) {
                if (line) console.log(line);
                continue;
            }
            const script = Buffer.from(line.slice('CALLBACK_SCRIPT:'.length), 'base64').toString().replace(/^javascript:/, '');
            for (const scenario of ['current', 'navigated', 'not-ready', 'abandoned', 'navigation-during-getter']) {
                let current = scenario !== 'navigated', reads = 0;
                const calls = [];
                const context = {
                    Android: {
                        IsRequestPageCurrent: page => current && page === 3,
                        BasexmlHttpGetResult: id => {
                            assert.strictEqual(id, 17); reads++;
                            if (scenario === 'navigation-during-getter') current = false;
                            return scenario === 'abandoned' ? null : 'owned-payload';
                        }
                    }
                };
                if (scenario !== 'not-ready') context.smartTwitchTV = {receive: (...args) => calls.push(args)};
                vm.runInNewContext(script, context);
                const stored = script.includes('BasexmlHttpGetResult');
                const delivered = scenario === 'current' || (!stored && ['abandoned', 'navigation-during-getter'].includes(scenario));
                assert.strictEqual(calls.length, delivered ? 1 : 0, scenario);
                assert.strictEqual(reads, stored && scenario !== 'navigated' ? 1 : 0, scenario + ' consumes even before smartTwitchTV exists');
                if (delivered) assert.deepStrictEqual(calls[0], [stored ? 'owned-payload' : 'inline-failure', 9, 'success', 'error', 10]);
                callbackScenarios++;
            }
        }
    }
    const bridge = {Main_IsOn_OSInterface: true, Android: {}};
    vm.runInNewContext(fs.readFileSync('app/specific/OSInterface.js', 'utf8'), bridge);
    assert.strictEqual(bridge.OSInterface_IsRequestPageCurrent(3), true, 'old APK bridge fallback');
    bridge.Android.IsRequestPageCurrent = page => page === 3;
    assert.strictEqual(bridge.OSInterface_IsRequestPageCurrent(3), true);
    assert.strictEqual(bridge.OSInterface_IsRequestPageCurrent(2), false);
    console.log(callbackScenarios + ' native-generated callback scenarios and 3 bridge compatibility checks passed');
} finally {
    fs.rmSync(output, {recursive: true, force: true});
}
