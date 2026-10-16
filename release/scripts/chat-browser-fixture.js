/* Local-only browser fixture. Run with Node, open /current and /baseline.
 * Main is instrumented in memory; app sources and generated assets are untouched.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const root = path.resolve(__dirname, '../..');
const fixture = `
<script>
window.fixtureStats = {scrolls:0, prunes:0, scans:0};
window.addEventListener('load', function () {
    var output = document.createElement('pre'); output.id = 'fixture-results';
    output.style.cssText = 'position:fixed;z-index:10000;top:0;right:0;background:#111;color:#fff;padding:12px;max-width:48%;font-size:13px';
    document.body.appendChild(output);
    var now = Date.now(), events = [], seq=0, failures=[];
    function check(value, label) { if (!value) failures.push(label); }
    for (var i=0;i<1000;i++) {
        events.push({seq:++seq,time:now-10000+i,type:'message',message:{id:'replay'+i,login:'fixture',badges:i%2?'vip/1':'',text:'Fixture '+i+' wrapped chat text for scrolling and layout.',tags:{'user-id':'u'+i%3}}});
        if (i===200) events.push({seq:++seq,time:now-9000,type:'delete',id:'replay51'});
        if (i===400) events.push({seq:++seq,time:now-9599,type:'clear',userId:'u1'});
    }
    var start=performance.now();
    Fixture.history({now:now,events:events});
    var replayMs=performance.now()-start, box=document.getElementById('pc-messages'),
        replayScrolls=fixtureStats.scrolls, replayPrunes=fixtureStats.prunes;
    check(box.querySelector('[data-id="replay51"]').textContent==='message deleted','replayed deletion');
    check(!box.querySelector('[data-id="replay1"]'),'historical user clear');
    check(!!box.querySelector('[data-id="replay403"]'),'later user message survives historical clear');
    var prior=0;
    Array.prototype.forEach.call(box.children,function(row){var time=Number(row.getAttribute('data-time'));check(!time||time>=prior,'row order');if(time)prior=time;});
    var replayRows=box.children.length;
    fixtureStats.scrolls=0;fixtureStats.prunes=0;fixtureStats.scans=0;
    start=performance.now();
    for (i=0;i<1000;i++) Fixture.message({id:'live'+i,login:'fixture',badges:'',text:'Live fixture '+i,receivedAt:now+i+1,tags:{'user-id':'live'}});
    var liveMs=performance.now()-start;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
        check(box.querySelectorAll('[data-priority="true"]').length===433,'priority retained through ordinary burst');
        check(box.querySelectorAll('[data-priority="false"]').length<=320,'ordinary bound');
        var liveScrolls=fixtureStats.scrolls,livePrunes=fixtureStats.prunes,liveScans=fixtureStats.scans;
        // A user scroll between insert and flush must preserve reading position.
        box.scrollTop=0;box.dispatchEvent(new Event('scroll'));
        Fixture.message({id:'reading',login:'fixture',badges:'vip/1',text:'Visible message while reading',receivedAt:now+2000,tags:{}});
        requestAnimationFrame(function(){requestAnimationFrame(function(){
            check(box.scrollTop===0,'reader not pulled down by flush');
            check(!document.getElementById('pc-jump-latest').hidden,'unread prompt');
            // Queue a frame, reset, then invoke captured stale frame through normal RAF dispatch.
            Fixture.message({id:'obsolete',login:'fixture',badges:'',text:'old session',tags:{}});
            Fixture.disconnect();
            requestAnimationFrame(function(){requestAnimationFrame(function(){
                check(box.children.length===0,'disconnect cancels pending maintenance');
                output.textContent=JSON.stringify({variant:location.pathname,failures:failures,replay:{events:events.length,rows:replayRows,ms:replayMs,scrolls:replayScrolls,prunes:replayPrunes},live:{messages:1000,ms:liveMs,scrolls:liveScrolls,prunes:livePrunes,orderingScans:liveScans}},null,2);
            });});
        });});
    });});
});
</script>`;
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/current' || url.pathname === '/baseline') {
        let html = fs.readFileSync(path.join(root, 'app/PhoneChat/index.html'), 'utf8');
        html = html.replace('<head>', '<head><base href="/app/PhoneChat/">').replace('src="main.js"', 'src="/fixture-main.js?variant=' + url.pathname.slice(1) + '"');
        res.setHeader('Content-Type', 'text/html'); res.end(html.replace('</head>', fixture + '</head>')); return;
    }
    if (url.pathname === '/fixture-main.js') {
        let source = url.searchParams.get('variant') === 'baseline' ? execFileSync('git', ['show', 'HEAD:app/PhoneChat/main.js'], {cwd: root, encoding:'utf8'}) : fs.readFileSync(path.join(root, 'app/PhoneChat/main.js'), 'utf8');
        source = source.replace('        init();', '        /* No external connections in fixture. */');
        source = source.replace('    SPTVPhoneChat.boot = function', '    window.Fixture = {history:receiveTVHistory,message:onChatMessage,disconnect:disconnect};\n    SPTVPhoneChat.boot = function');
        source = source.replace('    function scrollToBottom() {', '    function scrollToBottom() { window.fixtureStats.scrolls++;');
        source = source.replace('    function pruneRows(box) {', '    function pruneRows(box) { window.fixtureStats.prunes++;');
        source = source.replace("                if (Number(box.children[i].getAttribute('data-time')) > time)", "                window.fixtureStats.scans++;\n                if (Number(box.children[i].getAttribute('data-time')) > time)");
        res.setHeader('Content-Type', 'application/javascript'); res.end(source); return;
    }
    // Serve only public source assets required by the fixture.
    if (!/^\/app\/(PhoneChat\/[a-z.]+|thirdparty\/irc-message.js|general\/PhoneChatConfig.js)$/.test(url.pathname)) {res.writeHead(404);res.end();return;}
    const file = path.join(root, url.pathname.slice(1));
    if (!fs.existsSync(file)) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'application/javascript');
    res.end(fs.readFileSync(file));
}).listen(8765, '127.0.0.1', () => console.log('Fixture: http://127.0.0.1:8765/current and /baseline (no external requests)'));
