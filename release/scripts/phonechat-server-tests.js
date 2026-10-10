/* Compile and exercise the actual Android phone HTTP server against the local JVM. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.resolve(__dirname, '../..');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Library/Android/sdk');
const androidJar = path.join(sdk, 'platforms/android-35/android.jar');
if (!fs.existsSync(androidJar)) throw new Error('Set ANDROID_HOME to an SDK containing platform android-35.');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sptv-phone-java-'));
function run(command, args) {
    const result = spawnSync(command, args, {stdio: 'inherit', cwd: root});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(command + ' failed with exit ' + result.status);
}
try {
    const bin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : '';
    run(bin ? path.join(bin, 'javac') : 'javac', [
        '--release',
        '8',
        '-cp',
        androidJar,
        '-d',
        output,
        'apk/app/src/main/java/com/fgl27/twitch/PhoneChatServer.java',
        'release/scripts/java/PhoneChatServerTest.java'
    ]);
    run(bin ? path.join(bin, 'java') : 'java', [
        '-cp',
        output + path.delimiter + androidJar,
        'com.fgl27.twitch.PhoneChatServerTest',
        path.join(root, 'release/phonechat-assets')
    ]);
} finally {
    fs.rmSync(output, {recursive: true, force: true});
}
