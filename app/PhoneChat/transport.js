/*
 * SPTV phone chat - Twitch IRC transport over secure WebSocket.
 *
 * Part of the standalone phone page bundle (app/PhoneChat/), NOT the TV app.
 * ES5 only. Depends on: window.parseIRC (app/thirdparty/irc-message.js).
 *
 * Protocol reference: https://dev.twitch.tv/docs/chat/irc/
 *
 * Rules encoded here:
 * - One active socket and one reconnect timer per Transport instance.
 * - Every socket callback is tagged with a generation counter so callbacks
 *   from closed sockets can never overwrite current state.
 * - Socket-open is NOT "joined": the joined state only happens after the
 *   server confirms our JOIN, guarded by a bounded join timeout.
 * - Reconnect backoff 1, 2, 4, 8, 16, 30 seconds (with jitter), paused while
 *   offline, resumed when the network returns, stopped on invalid auth or
 *   intentional disconnect. No message queueing/replay across reconnects.
 */

SPTVPhoneChat.Transport = (function () {
    var States = {
        IDLE: 'idle',
        CONNECTING: 'connecting',
        AUTHENTICATING: 'authenticating',
        JOINING: 'joining',
        CONNECTED: 'connected',
        RECONNECTING: 'reconnecting',
        ERROR: 'error'
    };

    var BackoffSeconds = [1, 2, 4, 8, 16, 30];
    var JoinTimeoutMs = 15 * 1000;
    var MaxMessageLength = 480;

    //IRCv3 tag value unescaping, left to right (\: -> ; is NOT \s -> ' ' order safe if scanned sequentially)
    function unescapeTags(value) {
        if (typeof value !== 'string') return value;

        var out = '',
            i = 0,
            len = value.length,
            ch;

        while (i < len) {
            ch = value.charAt(i);

            if (ch === '\\' && i + 1 < len) {
                i++;
                ch = value.charAt(i);

                if (ch === ':') out += ';';
                else if (ch === 's') out += ' ';
                else if (ch === 'r') out += '\r';
                else if (ch === 'n') out += '\n';
                else if (ch === '\\') out += '\\';
                else out += ch;
            } else {
                out += ch;
            }

            i++;
        }

        return out;
    }

    //Split a WebSocket payload into IRC lines. Twitch frames use CRLF
    function splitPayload(payload) {
        if (typeof payload !== 'string' || !payload.length) return [];

        var lines = payload.split('\r\n'),
            out = [],
            i,
            len;

        for (i = 0, len = lines.length; i < len; i++) {
            //Keep interior content as-is; only fully empty lines (frame padding) are dropped
            if (lines[i].length) out.push(lines[i]);
        }

        return out;
    }

    //Parse one IRC line with window.parseIRC and unescape tag values.
    //Returns null for malformed lines (the parser returns null for those too).
    function parseLine(line) {
        var message;

        try {
            message = window.parseIRC(line);
        } catch (e) {
            return null;
        }

        if (!message || !message.command) return null;

        var name,
            tags = message.tags,
            value;

        for (name in tags) {
            if (tags.hasOwnProperty(name)) {
                value = tags[name];
                if (typeof value === 'string') tags[name] = unescapeTags(value);
            }
        }

        return message;
    }

    //Parse a whole payload into a list of IRC messages (null-safe)
    function parsePayload(payload) {
        var lines = splitPayload(payload),
            out = [],
            i,
            len,
            message;

        for (i = 0, len = lines.length; i < len; i++) {
            message = parseLine(lines[i]);
            if (message) out.push(message);
        }

        return out;
    }

    /*
     * Outbound validation. Returns { ok: true, value } or { ok: false, reason }.
     * - Rejects empty messages and anything over Twitch's practical length limit.
     * - Newlines from multiline paste are deliberately normalized to single spaces.
     * - Remaining control characters (CR, LF leftovers, NUL, other C0/DEL) are rejected:
     *   they are protocol injection vectors and cannot be sent safely over IRC.
     */
    function validateOutgoing(text) {
        if (typeof text !== 'string') return {ok: false, reason: 'invalid'};

        var normalized = text.replace(/\r\n|\r|\n/g, ' ');

        if (!normalized.length) return {ok: false, reason: 'empty'};

        var cleaned = '',
            i,
            len = normalized.length,
            code;

        for (i = 0; i < len; i++) {
            code = normalized.charCodeAt(i);

            if (code < 0x20 || code === 0x7f) return {ok: false, reason: 'control'};

            cleaned += normalized.charAt(i);
        }

        if (cleaned.length > MaxMessageLength) return {ok: false, reason: 'too_long'};

        return {ok: true, value: cleaned};
    }

    function Transport(options) {
        this.url = options.url;
        this.token = options.token;
        this.nick = options.nick;
        this.channel = options.channel;
        this.onEvent = options.onEvent || function () {};
        this.WebSocketImpl = options.WebSocketImpl || window.WebSocket;

        this.state = States.IDLE;
        this.generation = 0;
        this.socket = null;
        this.reconnectTimer = null;
        this.joinTimer = null;
        this.backoffIndex = 0;
        this.stopped = true;
    }

    Transport.prototype._setState = function (state) {
        if (this.state === state) return;
        this.state = state;
        this.onEvent({type: 'state', state: state});
    };

    Transport.prototype._emit = function (event) {
        this.onEvent(event);
    };

    Transport.prototype._clearTimers = function () {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.joinTimer !== null) {
            clearTimeout(this.joinTimer);
            this.joinTimer = null;
        }
    };

    Transport.prototype._closeSocket = function () {
        if (this.socket) {
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            try {
                this.socket.close();
            } catch (e) {
                //already closed
            }
            this.socket = null;
        }
    };

    Transport.prototype.start = function () {
        this.stopped = false;
        this.backoffIndex = 0;
        this._connect();
    };

    Transport.prototype._connect = function () {
        if (this.stopped) return;

        this._clearTimers();
        this._closeSocket();

        //New generation: callbacks of any previous socket become stale
        var gen = ++this.generation,
            self = this;

        this._setState(States.CONNECTING);

        this.joinTimer = setTimeout(function () {
            if (gen !== self.generation || self.state === States.CONNECTED) return;

            self._emit({type: 'error', kind: 'timeout'});
            self._scheduleReconnect();
        }, JoinTimeoutMs);

        var socket;

        try {
            socket = new this.WebSocketImpl(this.url);
        } catch (e) {
            this._emit({type: 'error', kind: 'network'});
            this._scheduleReconnect();
            return;
        }

        this.socket = socket;

        socket.onopen = function () {
            if (gen !== self.generation) return;

            self._setState(States.AUTHENTICATING);
            //Never log these commands: they contain the access token
            socket.send('PASS oauth:' + self.token);
            socket.send('NICK ' + self.nick);
            socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        };

        socket.onmessage = function (event) {
            if (gen !== self.generation) return;
            self._handlePayload(event.data, socket);
        };

        socket.onclose = function () {
            if (gen !== self.generation) return;

            self._emit({type: 'socket_closed'});

            if (self.state === States.ERROR) return; //auth failures stop retries

            self._scheduleReconnect();
        };

        socket.onerror = function () {
            if (gen !== self.generation) return;
            //onclose follows; reconnect handled there
        };
    };

    Transport.prototype._scheduleReconnect = function () {
        if (this.stopped || this.state === States.ERROR) return;

        //Invalidate in-flight callbacks of the closed socket immediately: the
        //new generation only comes back with the actual reconnect below
        this.generation++;

        this._clearTimers();
        this._closeSocket();

        var self = this,
            base = BackoffSeconds[Math.min(this.backoffIndex, BackoffSeconds.length - 1)],
            seconds = base + (Math.random() * base * 0.4 - base * 0.2); //+/-20% jitter

        if (this.backoffIndex < BackoffSeconds.length - 1) this.backoffIndex++;

        this._setState(States.RECONNECTING);

        this.reconnectTimer = setTimeout(
            function () {
                self.reconnectTimer = null;
                self._connect();
            },
            Math.max(500, Math.round(seconds * 1000))
        );
    };

    Transport.prototype._handlePayload = function (payload, socket) {
        var messages = parsePayload(payload),
            i,
            len = messages.length;

        for (i = 0; i < len; i++) {
            this._handleMessage(messages[i], socket);
        }
    };

    Transport.prototype._joinTimeoutCleared = function () {
        if (this.joinTimer !== null) {
            clearTimeout(this.joinTimer);
            this.joinTimer = null;
        }
    };

    Transport.prototype._handleMessage = function (message, socket) {
        switch (message.command) {
            case 'PING':
                if (socket && socket.readyState === 1) socket.send('PONG ' + (message.params[0] || ':tmi.twitch.tv'));
                break;

            case '001':
                this._setState(States.JOINING);
                if (socket && socket.readyState === 1) socket.send('JOIN #' + this.channel);
                break;

            case 'JOIN':
                this._joinTimeoutCleared();
                this.backoffIndex = 0;
                this._setState(States.CONNECTED);
                this._emit({type: 'joined'});
                break;

            case 'PRIVMSG':
                this._emit({type: 'message', message: this._parsePrivmsg(message)});
                break;

            case 'USERSTATE':
                this._emit({type: 'userstate', tags: message.tags});
                break;

            case 'ROOMSTATE':
                this._emit({type: 'roomstate', tags: message.tags});
                break;

            case 'NOTICE': {
                var msgId = message.tags && message.tags['msg-id'] ? message.tags['msg-id'] : null;
                var noticeText = message.params.length > 1 ? message.params[1] : '';

                /*
                 * Twitch's documented login failure is an UNTAGGED
                 * ":tmi.twitch.tv NOTICE * :Login authentication failed".
                 * Only trust the untagged text form while login is still in
                 * progress, so an ordinary room NOTICE can never be mistaken
                 * for an authentication rejection.
                 */
                var authFailed =
                    msgId === 'login_failure' ||
                    msgId === 'unauthorized' ||
                    msgId === 'invalid_user' ||
                    (!msgId &&
                        this.state !== States.CONNECTED &&
                        /login authentication failed/i.test(noticeText));

                if (!this.stopped && authFailed) {
                    //Invalid credentials: stop automatic retries, the user must reconnect
                    this.state = States.ERROR;
                    this._joinTimeoutCleared();
                    this._closeSocket();
                    this._emit({type: 'error', kind: 'auth', msgId: msgId});
                    return;
                }

                this._emit({type: 'notice', msgId: msgId, text: noticeText});
                break;
            }

            case 'CLEARMSG':
                this._emit({type: 'clearmsg', targetMsgId: message.tags ? message.tags['target-msg-id'] : null});
                break;

            case 'CLEARCHAT':
                //tags['target-user-id'] present: a user was banned/timeout; absent: the whole room was cleared
                this._emit({
                    type: 'clearchat',
                    targetUserId: message.tags ? message.tags['target-user-id'] : null,
                    banDuration: message.tags && message.tags['ban-duration'] ? parseInt(message.tags['ban-duration'], 10) : null
                });
                break;

            case 'RECONNECT':
                //Server asks clients to reconnect: drop and reconnect with the normal backoff
                this._scheduleReconnect();
                break;

            default:
                break;
        }
    };

    Transport.prototype._parsePrivmsg = function (message) {
        var tags = message.tags || {},
            text = message.params.length > 1 ? message.params[1] : '',
            action = false,
            actionMark = 'ACTION ',
            actionEnd;

        //Action (/me) messages arrive wrapped in \x01ACTION ... \x01
        if (text.indexOf('\x01') === 0 && text.charCodeAt(text.length - 1) === 1) {
            actionEnd = text.slice(1, text.length - 1);
            if (actionEnd.indexOf(actionMark) === 0) {
                action = true;
                text = actionEnd.slice(actionMark.length);
            }
        }

        return {
            id: tags.id || null,
            login: tags.login || (message.prefix ? message.prefix.split('!')[0] : ''),
            displayName: tags['display-name'] || tags.login || '',
            color: tags.color || null,
            badges: tags.badges || null,
            emotes: tags.emotes || null,
            firstMsg: tags['first-msg'] === '1',
            action: action,
            text: text,
            tags: tags
        };
    };

    Transport.prototype.getState = function () {
        return this.state;
    };

    Transport.prototype.isConnected = function () {
        return this.state === States.CONNECTED;
    };

    //Send is allowed only while joined. Returns validateOutgoing()'s result
    Transport.prototype.send = function (text) {
        var check = validateOutgoing(text);

        if (!check.ok) return check;

        if (this.state !== States.CONNECTED || !this.socket || this.socket.readyState !== 1) {
            return {ok: false, reason: 'not_connected'};
        }

        try {
            this.socket.send('PRIVMSG #' + this.channel + ' :' + check.value);
        } catch (e) {
            return {ok: false, reason: 'not_connected'};
        }

        return check;
    };

    Transport.prototype.stop = function () {
        this.stopped = true;
        this.generation++; //invalidate all in-flight callbacks
        this._clearTimers();
        this._closeSocket();
        this._setState(States.IDLE);
    };

    return {
        States: States,
        unescapeTags: unescapeTags,
        splitPayload: splitPayload,
        parseLine: parseLine,
        parsePayload: parsePayload,
        validateOutgoing: validateOutgoing,
        create: function (options) {
            return new Transport(options);
        }
    };
})();
