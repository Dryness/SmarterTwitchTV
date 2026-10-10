package com.fgl27.twitch;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

/** Plain JVM integration checks against the actual APK server, without a device or live Twitch credentials. */
public final class PhoneChatServerTest {
    private static int checks;
    private static void check(boolean result, String label) {
        if (!result) throw new AssertionError(label);
        checks++;
    }
    private static String request(String method, String path, String host, String headers) throws Exception {
        try (Socket socket = new Socket("127.0.0.1", PhoneChatServer.PORT)) {
            socket.setSoTimeout(5000);
            socket.getOutputStream().write((method + " " + path + " HTTP/1.1\r\nHost: " + host + "\r\n" + headers + "\r\n").getBytes(StandardCharsets.US_ASCII));
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] bytes = new byte[8192];
            int count;
            while ((count = socket.getInputStream().read(bytes)) != -1) output.write(bytes, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    public static void main(String[] args) throws Exception {
        Path assets = Paths.get(args[0]);
        PhoneChatServer server = new PhoneChatServer(path -> Files.newInputStream(assets.resolve(path)), () -> {
            try { return InetAddress.getByName("127.0.0.1"); } catch (UnknownHostException e) { return null; }
        });
        try {
            String url = server.getUrl();
            check(url.matches("http://127.0.0.1:8978/chat/#pair=[a-f0-9]{64}"), "Local pairing URL");
            String token = url.substring(url.indexOf("#pair=") + 6);
            String host = "127.0.0.1:8978";
            String paired = "X-SPTV-Pairing: " + token + "\r\n";
            String page = request("GET", "/chat/", host, "");
            check(page.startsWith("HTTP/1.1 200"), "Bundled HTML served");
            check(page.contains("src=PhoneChat.js") || page.contains("src=\"PhoneChat.js\""), "Relative bundle path");
            check(page.contains("Cache-Control: no-store"), "No cached stale TV page");
            check(request("GET", "/chat/PhoneChat.js", host, "").startsWith("HTTP/1.1 200"), "Bundled JavaScript served");
            check(request("GET", "/chat/phonechat.min.css", host, "").startsWith("HTTP/1.1 200"), "Bundled CSS served");
            check(request("GET", "/chat/../../debug.log", host, "").startsWith("HTTP/1.1 404"), "Traversal rejected");
            check(request("GET", "/log", host, "").startsWith("HTTP/1.1 404"), "No debug logs exposed");
            check(request("GET", "/chat/state", host, "").startsWith("HTTP/1.1 403"), "Pairing required");
            check(request("GET", "/chat/state", host, "X-SPTV-Pairing: wrong\r\n").startsWith("HTTP/1.1 403"), "Wrong pairing rejected");
            check(request("GET", "/chat/state", "evil.example", paired).startsWith("HTTP/1.1 403"), "Host check rejects rebinding");
            check(request("GET", "/chat/state", host, paired + "Origin: https://evil.example\r\n").startsWith("HTTP/1.1 403"), "Foreign origin rejected");
            check(request("POST", "/chat/state", host, paired).startsWith("HTTP/1.1 405"), "State cannot be mutated over LAN");
            server.setChannel("twitchdev");
            String state = request("GET", "/chat/state", host, paired);
            check(state.contains("\"channel\":\"twitchdev\""), "Current channel published");
            check(!state.contains("access_token") && !state.contains("client_secret"), "No Twitch credentials in state");
            server.setChannel("anotherchannel");
            check(request("GET", "/chat/state", host, paired).contains("\"channel\":\"anotherchannel\""), "Channel update visible");
            server.setChannel("invalid\"channel");
            check(request("GET", "/chat/state", host, paired).contains("\"channel\":\"\""), "Malformed channel cleared");
            server.setChannel("twitchdev");
            java.lang.reflect.Field updated = PhoneChatServer.class.getDeclaredField("updatedAt");
            updated.setAccessible(true); updated.setLong(server, 0);
            check(request("GET", "/chat/state", host, paired).contains("\"channel\":\"\""), "Stale TV publisher expires");
            try (Socket malformed = new Socket("127.0.0.1", PhoneChatServer.PORT)) {
                malformed.getOutputStream().write("GET /chat/ HTTP/1.1\r\nHost: test\r\nmalformed\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                malformed.setSoTimeout(5000);
                try { check(malformed.getInputStream().read() == -1, "Malformed request closes"); }
                catch (SocketException closed) { check(true, "Malformed request resets socket"); }
            }
            check(request("GET", "/chat/", host, "").startsWith("HTTP/1.1 200"), "Bad request does not kill listener");
            server.stop();
            String restarted = server.getUrl();
            check(!restarted.equals(url), "Restart rotates pairing");
            check(request("GET", "/chat/state", host, paired).startsWith("HTTP/1.1 403"), "Previous pairing invalid after restart");
            check(server.getUrl().equals(restarted), "Repeated QR retains current pairing");
            PhoneChatServer missing = new PhoneChatServer(path -> { throw new FileNotFoundException(); }, () -> InetAddress.getLoopbackAddress());
            check(missing.getUrl().isEmpty(), "Missing assets fail before advertising QR");
            server.close();
            check(server.getUrl().isEmpty(), "Destroyed activity cannot restart server through a late bridge call");
            System.out.println(checks + " native phone server checks passed");
        } finally { server.stop(); }
    }
}
