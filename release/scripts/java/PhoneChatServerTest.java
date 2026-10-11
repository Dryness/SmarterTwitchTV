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
        checkLogRotation();
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
            server.addHistory("twitchdev", "{\"type\":\"message\",\"message\":{\"id\":\"m1\",\"text\":\"history fixture\"}}");
            String history = request("GET", "/chat/state", host, paired);
            check(history.contains("history fixture"), "TV retains public history while phone absent");
            check(!request("GET", "/chat/state", host, paired + "X-SPTV-History-After: 1\r\n").contains("history fixture"), "History cursor avoids retransmission");
            server.addHistory("wrongchannel", "{\"type\":\"message\",\"text\":\"wrong channel fixture\"}");
            check(!request("GET", "/chat/state", host, paired).contains("wrong channel fixture"), "Stale collector channel rejected");
            java.lang.reflect.Field historyField = PhoneChatServer.class.getDeclaredField("history");
            historyField.setAccessible(true);
            Object first = ((java.util.ArrayDeque<?>) historyField.get(server)).peekFirst();
            java.lang.reflect.Field timeField = first.getClass().getDeclaredField("time");
            timeField.setAccessible(true);
            timeField.setLong(first, System.currentTimeMillis() - 21 * 60 * 1000);
            check(!request("GET", "/chat/state", host, paired).contains("history fixture"), "History expires at twenty minutes");
            server.addHistory("twitchdev", "{\"type\":\"delete\",\"id\":\"m1\"}");
            check(request("GET", "/chat/state", host, paired).contains("\"type\":\"delete\""), "Deletion retained for locked phones");
            server.setChannel("anotherchannel");
            check(!request("GET", "/chat/state", host, paired).contains("\"type\":\"delete\""), "Channel change clears prior history");
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
            System.out.println(checks + " native phone/debug server checks passed");
        } finally { server.stop(); }
    }

    private static void checkLogRotation() throws Exception {
        Path directory = Files.createTempDirectory("sptv-log-test-");
        try {
            Files.write(directory.resolve("debug.log.1"), "OLDER\n".getBytes(StandardCharsets.UTF_8));
            Files.write(directory.resolve("debug.log"), "CURRENT\n".getBytes(StandardCharsets.UTF_8));
            String shortLog = new String(DebugLogServer.collectLogFiles(directory.toFile()), StandardCharsets.UTF_8);
            check(shortLog.indexOf("OLDER") < shortLog.indexOf("CURRENT"), "Logs ordered oldest to newest");
            check(shortLog.endsWith("CURRENT\n"), "Current capture is the log tail");
            byte[] data = new byte[2 * 1024 * 1024];
            java.util.Arrays.fill(data, (byte) 'x');
            for (int i = 3; i >= 0; i--) {
                String marker = i == 0 ? "LATEST_CURRENT\n" : "ROTATED_" + i + "\n";
                byte[] bytes = marker.getBytes(StandardCharsets.UTF_8);
                System.arraycopy(bytes, 0, data, data.length - bytes.length, bytes.length);
                Files.write(directory.resolve(i == 0 ? "debug.log" : "debug.log." + i), data);
            }
            String fullLog = new String(DebugLogServer.collectLogFiles(directory.toFile()), StandardCharsets.UTF_8);
            check(fullLog.contains("log truncated"), "Full buffer reports truncation");
            check(fullLog.endsWith("LATEST_CURRENT\n"), "Full buffer retains newest current logs");
            check(fullLog.contains("ROTATED_1") && fullLog.contains("ROTATED_2"), "Full buffer retains recent rotated logs");
            check(!fullLog.contains("ROTATED_3"), "Full buffer discards oldest rotated logs");
        } finally {
            for (String name : new String[] {"debug.log", "debug.log.1", "debug.log.2", "debug.log.3"}) {
                Files.deleteIfExists(directory.resolve(name));
            }
            Files.deleteIfExists(directory);
        }
    }
}
