/* Twitch Device Code Flow. Direct HTTPS requests keep the phone's account independent from the TV. */
SPTVPhoneChat.Device = (function () {
    function post(url, fields) {
        var body = [],
            name;
        for (name in fields) {
            if (fields.hasOwnProperty(name)) body.push(encodeURIComponent(name) + '=' + encodeURIComponent(fields[name]));
        }
        var controller = window.AbortController ? new window.AbortController() : null,
            timeout;
        return new Promise(function (resolve, reject) {
            timeout = setTimeout(function () {
                if (controller) controller.abort();
                reject(new Error('Twitch request timed out'));
            }, 15000);
            window
                .fetch(url, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: body.join('&'),
                    signal: controller ? controller.signal : undefined
                })
                .then(function (response) {
                    return response.json().then(function (json) {
                        return {status: response.status, json: json};
                    });
                })
                .then(resolve, reject);
        }).then(
            function (result) {
                clearTimeout(timeout);
                return result;
            },
            function (error) {
                clearTimeout(timeout);
                throw error;
            }
        );
    }

    function start(callbacks) {
        var active = true,
            timer = null,
            expires = 0,
            interval = 5000,
            deviceCode;

        function cancel() {
            active = false;
            clearTimeout(timer);
        }
        function fail(reason) {
            if (!active) return;
            cancel();
            callbacks.error(reason);
        }
        function schedule() {
            if (!active) return;
            if (Date.now() >= expires) {
                fail('expired');
                return;
            }
            timer = setTimeout(poll, Math.min(interval, expires - Date.now()));
        }
        function poll() {
            if (!active) return;
            if (Date.now() >= expires) {
                fail('expired');
                return;
            }
            post(PhoneChatConfig.oauth.tokenUrl, {
                client_id: PhoneChatConfig.clientId,
                scopes: PhoneChatConfig.scopes.join(' '),
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            }).then(
                function (response) {
                    if (!active) return;
                    if (Date.now() >= expires) {
                        fail('expired');
                        return;
                    }
                    var json = response.json || {},
                        error = String(json.error || json.message || '')
                            .toLowerCase()
                            .replace(/ /g, '_');
                    if (response.status === 200 && typeof json.access_token === 'string' && json.access_token) {
                        cancel();
                        callbacks.token(json.access_token, json.refresh_token);
                    } else if (error === 'authorization_pending') schedule();
                    else if (error === 'slow_down' || response.status === 429) {
                        interval += 5000;
                        schedule();
                    } else if (response.status >= 500) schedule();
                    else fail(error === 'access_denied' ? 'denied' : error === 'expired_token' ? 'expired' : 'failed');
                },
                function () {
                    schedule();
                }
            );
        }
        post(PhoneChatConfig.oauth.deviceUrl, {
            client_id: PhoneChatConfig.clientId,
            scopes: PhoneChatConfig.scopes.join(' ')
        }).then(
            function (response) {
                if (!active) return;
                var json = response.json || {};
                if (
                    response.status !== 200 ||
                    typeof json.device_code !== 'string' ||
                    !json.device_code ||
                    typeof json.user_code !== 'string' ||
                    !json.user_code ||
                    typeof json.expires_in !== 'number' ||
                    json.expires_in <= 0 ||
                    !/^https:\/\/www\.twitch\.tv\/activate(?:\?|$)/.test(json.verification_uri || '')
                ) {
                    fail('failed');
                    return;
                }
                deviceCode = json.device_code;
                expires = Date.now() + Math.min(json.expires_in, 1800) * 1000;
                interval = Math.max(1, Number(json.interval) || 5) * 1000;
                callbacks.code(json.user_code, json.verification_uri);
                schedule();
            },
            function () {
                fail('network');
            }
        );
        return {cancel: cancel};
    }
    function refresh(token) {
        return post(PhoneChatConfig.oauth.tokenUrl, {
            client_id: PhoneChatConfig.clientId,
            grant_type: 'refresh_token',
            refresh_token: token
        });
    }
    return {start: start, refresh: refresh};
})();
