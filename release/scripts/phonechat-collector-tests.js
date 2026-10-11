/* Exercise the actual TV collector without Twitch or credentials. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const sockets = [],
    events = [];
let checks = 0;
const s = {
    Date,
    Math,
    JSON,
    OSInterface_AddPhoneChatHistory: (channel, payload) => events.push({channel, payload: JSON.parse(payload)}),
    WebSocket: function () {
        this.sent = [];
        this.send = text => this.sent.push(text);
        this.close = () => {
            if (this.onclose) this.onclose();
        };
        sockets.push(this);
    }
};
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync('app/thirdparty/irc-message.js', 'utf8'), s);
vm.runInContext(fs.readFileSync('app/specific/PhoneChat.js', 'utf8'), s);
function check(value, label) {
    assert.ok(value, label);
    checks++;
}
s.PhoneChat_Collect('twitchdev');
sockets[0].onopen();
check(
    sockets[0].sent.some(x => x.startsWith('NICK justinfan')),
    'collector uses anonymous login'
);
check(!sockets[0].sent.some(x => x.includes('oauth:')), 'collector never needs a Twitch token');
const message = (id, badges, login = 'human') =>
    '@id=' + id + ';badges=' + badges + ';user-id=u1;display-name=Human :' + login + '!u@host PRIVMSG #twitchdev :hello\r\n';
sockets[0].onmessage({
    data:
        message('partner', 'partner/1') +
        message('vip', 'vip/1') +
        message('mod', 'moderator/1') +
        message('ordinary', '') +
        message('bot', 'moderator/1', 'Nightbot')
});
check(events.length === 3, 'collector retains only requested roles and excludes bots');
check(events[0].payload.message.tags['user-id'] === 'u1', 'collector carries moderation identity');
const split = message('split', 'vip/1');
sockets[0].onmessage({data: split.slice(0, 40)});
sockets[0].onmessage({data: split.slice(40)});
check(events.length === 4, 'collector joins fragmented frames');
sockets[0].onmessage({
    data: 'PING :server\r\n@target-msg-id=split :tmi.twitch.tv CLEARMSG #twitchdev :hello\r\n@target-user-id=u1 :tmi.twitch.tv CLEARCHAT #twitchdev :human\r\n'
});
check(sockets[0].sent.includes('PONG :server'), 'collector responds to heartbeat');
check(events[4].payload.type === 'delete' && events[4].payload.id === 'split', 'collector records deletions');
check(events[5].payload.type === 'clear' && events[5].payload.userId === 'u1', 'collector records targeted clears');
s.PhoneChat_Collect('anotherchannel');
sockets[0].onmessage({data: message('stale', 'vip/1')});
check(events.length === 6, 'old socket cannot publish to changed channel');
check(sockets.length === 2, 'channel change opens replacement socket');
s.PhoneChat_Collect(null);
check(s.PhoneChat_HistorySocket === null, 'collection stops outside live playback');
console.log(checks + ' TV collector checks passed');
