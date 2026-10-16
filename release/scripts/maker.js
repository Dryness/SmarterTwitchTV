const minify = require('html-minifier').minify;
const jshint = require('jshint').JSHINT;

const crass = require('crass');
const UglifyJS = require('uglify-js');

const prettier = require('prettier');

const tools = require('./tools');
const temp_maker_folder = 'release/temp_maker/';
const mainJSFile = temp_maker_folder + 'main_temp.js';

const UglifyJS_compress = {arrows: false}; //prevent devices with old browser implementation may not supporting arrows

//Set when a build step fails so run_all can exit with a failure code
let buildFailed = false;

//The standalone phone page bundle, in explicit dependency order
const phoneJSFiles = [
    'app/thirdparty/irc-message.js',
    'app/general/PhoneChatConfig.js',
    'app/PhoneChat/emotes.js',
    'app/PhoneChat/transport.js',
    'app/PhoneChat/auth.js',
    'app/PhoneChat/render.js',
    'app/PhoneChat/local.js',
    'app/PhoneChat/device.js',
    'app/PhoneChat/main.js'
];

//This will update the version JSON file and the temp Changelog_Up.md file
function version_up() {
    console.log('\nCreating Version files...');

    //create a temp file with the content of versions file (./app/general/version.js and ./release/scripts/version.js)
    const version = tools.readFileSync('./app/general/version.js') + tools.readFileSync('./release/scripts/version.js');
    const scripPath = './release/temp_maker/version.js';

    //write in sync as we will execute it
    tools.writeFileSync(scripPath, version);

    // execute
    tools.runNodeJsASync(scripPath);
}

//Clean up HTML files, replace all local reference and minify
function cleanMinifyHTML(filePath, singleJSPath, writePath, extraReplaces) {
    //read the main html file
    let htmlFile = tools.readFileSync(filePath);

    //replace all js code with single line of js code
    htmlFile = htmlFile.replace(/(.*jsstart)([\s\S]*)(.*jsend-->)/g, '<script src="' + singleJSPath + '" defer></script>');

    //replace local path reference
    htmlFile = htmlFile.replaceAll('../release/', '');

    //add .min reference to css files
    htmlFile = htmlFile.replaceAll('css/icons.css', 'css/icons.min.css');

    //page specific reference fixes (eg the phone page css)
    for (const pair of extraReplaces || []) {
        htmlFile = htmlFile.replaceAll(pair[0], pair[1]);
    }

    //write a uncompressed copy to temp folder for visual debug proposes
    tools.writeFileASync(writePath.replace('index', 'index_uncompressed').replace('release/', 'release/temp_maker/'), htmlFile);

    //minify and clean
    const options = {
        collapseWhitespace: true,
        removeComments: true,
        removeOptionalTags: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        useShortDoctype: true,
        minifyCSS: true,
        minifyJS: true
    };
    htmlFile = minify(htmlFile, options);

    //write to main folder
    tools.writeFileSync(writePath, htmlFile);
}

function make_HTML() {
    console.log('\nCreating HTML files...');

    cleanMinifyHTML('app/index.html', 'githubio/js/main.js', 'release/index.html');
    cleanMinifyHTML('app/Extrapage/index.html', 'githubio/js/Extrapage.js', 'release/extrapageindex.html');
    cleanMinifyHTML('app/PhoneChat/index.html', 'githubio/js/PhoneChat.js', 'release/phonechat.html', [
        //the source page ships its css as a sibling file; the generated page
        //loads the minified copy from the githubio folder next to it
        ['href="phonechat.css"', 'href="githubio/css/phonechat.min.css"']
    ]);
}

function make_CSS() {
    console.log('\nCreating CSS files...');

    const iconCSS = tools.readFileSync('release/githubio/css/icons.css');

    //compress the stylesheet
    let parsed = crass.parse(iconCSS);
    // Optimize the stylesheet:
    parsed = parsed.optimize();

    // Save the stylesheet:
    tools.writeFileASync('release/githubio/css/icons.min.css', parsed.toString());

    make_PhoneCSS();
}

function make_PhoneCSS() {
    //The phone page css source of truth is app/PhoneChat/phonechat.css:
    //an unminified copy is written so the SOURCE page works from an http server too
    const phoneCSS = tools.readFileSync('app/PhoneChat/phonechat.css');

    tools.writeFileASync('release/githubio/css/phonechat.css', phoneCSS);

    let parsed;

    try {
        parsed = crass.parse(phoneCSS).optimize();
    } catch (e) {
        console.log('\ncrass failed on app/PhoneChat/phonechat.css: ' + e);
        buildFailed = true;
        return;
    }

    tools.writeFileSync('release/githubio/css/phonechat.min.css', parsed.toString());
}

//Lint + minify the standalone phone page bundle
function make_PhoneJS(jshOnly) {
    let phoneJSContent = '';

    for (const file of phoneJSFiles) {
        phoneJSContent += tools.readFileSync(file);
    }

    //Lint the combined first-party phone source with its real dependencies
    if (js_jshint(phoneJSContent, {parseIRC: true, Promise: true})) {
        console.log('\nFile phone chat bundle (app/PhoneChat/)');
        console.log('');
        buildFailed = true; //a lint failure must fail the run, also in jsh-only mode
        return false;
    }

    if (jshOnly) return true;

    const minified = UglifyJS.minify(phoneJSContent, {
        compress: UglifyJS_compress,
        mangle: true
    });

    if (minified.error || !minified.code || minified.code.indexOf('undefined') === 0) {
        console.log('\nUglifyJS failed on the phone chat bundle:');
        console.log(minified.error);
        buildFailed = true;
        return false;
    }

    tools.writeFileSync('release/githubio/js/PhoneChat.js', minified.code);

    return true;
}

function make_JS(jshOnly) {
    console.log(jshOnly ? '\nVerifying js files...' : '\nCreating js files...');

    const options = {
        compress: UglifyJS_compress,
        mangle: true
    };

    const allJSFiles = tools.getFilesFromArrayByType(['app/languages/', 'app/general/', 'app/specific/', 'app/thirdparty/'], '.js');
    let mainJSContent = '';
    let mainJSContentCompressed = '';
    let fileContent = '';

    for (const file of allJSFiles) {
        fileContent = tools.readFileSync(file);

        if (file.includes('Main.js')) {
            fileContent = fileContent.replace('Main_Start();', '');
        }
        mainJSContent += fileContent;
        if (!jshOnly) mainJSContentCompressed += UglifyJS.minify(fileContent, options).code;
    }

    tools.writeFileASync(mainJSFile, mainJSContent);

    if (js_jshint(mainJSContent)) {
        console.log('\nFile ' + mainJSFile);
        console.log('');
        buildFailed = true; //lint failures must fail the run, also in jsh-only mode
        return false;
    }

    const extraJSContent = tools.readFileSync('app/Extrapage/Extrapage.js');

    if (js_jshint(extraJSContent)) {
        console.log('\nFile ' + 'app/Extrapage/Extrapage.js');
        console.log('');
        buildFailed = true;
        return false;
    }

    if (!make_PhoneJS(jshOnly)) return false;

    if (jshOnly) {
        console.log('\nVerifying complete no issues found...\n');
        return false;
    }

    tools.writeFileASync(temp_maker_folder + 'Extrapage.js', extraJSContent);

    makeMainJS(mainJSContentCompressed, mainJSContent, extraJSContent);

    return true;
}

async function makeMainJS(mainJSContentCompressed, mainJSContent, extraJSContent) {
    const releaseAPI = tools.readFileSync('release/api.js');

    const releaseAPIStart = releaseAPI.split('APISPLITSTART')[1].split('//APIMID')[0];
    const releaseAPIEnd = releaseAPI.split('APISPLITCENTER')[1].split('//APIEND')[0];

    const options = await prettier.resolveConfig('.prettierrc');

    const finalMainJSContent = await prettier.format(releaseAPIStart + mainJSContent + releaseAPIEnd, options);
    const finalMainJSContentCompressed = await prettier.format(releaseAPIStart + mainJSContentCompressed + releaseAPIEnd, options);

    tools.writeFileASync(temp_maker_folder + 'main_uncompressed.js', finalMainJSContent);
    tools.writeFileASync('release/githubio/js/main_uncompressed.js', finalMainJSContent);

    make_uglifyjs(finalMainJSContentCompressed, extraJSContent);
}

function make_uglifyjs(finalMainJSContentCompressed, extraJSContent) {
    const options = {
        compress: UglifyJS_compress,
        mangle: {
            toplevel: true,
            eval: true
        }
    };

    tools.writeFileASync('release/githubio/js/main.js', UglifyJS.minify(finalMainJSContentCompressed, options).code);
    tools.writeFileASync('release/githubio/js/Extrapage.js', UglifyJS.minify(extraJSContent, options).code);
}

function js_jshint(source, extraPredef) {
    const options = {
        eqeqeq: true,
        laxbreak: true,
        undef: true,
        unused: true,
        browser: true,
        node: true
    };

    const predef = {
        Android: true,
        punycode: true,
        smartTwitchTV: true,
        firebase: true,
        dataLayer: true,
        firebase: true,
        ActiveXObject: true,
        Twitch: true,
        global: true
    };

    for (const name in extraPredef || {}) {
        predef[name] = extraPredef[name];
    }

    jshint(source, options, predef);
    const errors = jshint.data().errors;

    if (errors) {
        console.log('\njshint fail:\n');
        for (const error of errors) {
            console.log('Line ' + error.line + ' reason ' + error.reason + ' code ' + error.code + ' evidence ' + error.evidence);
        }

        console.log('\nTotal errors = ' + errors.length);
    }

    return Boolean(errors && errors.length);
}

function run_all() {
    const args = process.argv.slice(2);
    const jshOnly = args[0] === 'jsh';

    if (!jshOnly) console.log('Started release maker...');

    tools.mkdirSync(temp_maker_folder);

    //make main js file if doesn't pass jshint validation exit.
    //Or if on jshint only mode also exit
    if (!make_JS(jshOnly)) {
        if (buildFailed) process.exitCode = 1;
        return;
    }

    make_HTML();
    make_CSS();
    const phoneAssets = 'release/phonechat-assets/phonechat/';
    tools.mkdirSync(phoneAssets);
    tools.writeFileSync(
        phoneAssets + 'index.html',
        tools
            .readFileSync('release/phonechat.html')
            .replaceAll('githubio/js/PhoneChat.js', 'PhoneChat.js')
            .replaceAll('githubio/css/phonechat.min.css', 'phonechat.min.css')
    );
    tools.copyFileSync('release/githubio/js/PhoneChat.js', phoneAssets + 'PhoneChat.js');
    tools.copyFileSync('release/githubio/css/phonechat.min.css', phoneAssets + 'phonechat.min.css');
    version_up();

    if (buildFailed) process.exitCode = 1;

    console.log('\nFinishing release maker...');
}

run_all();
