/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.fgl27.twitch;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.Collections;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Serves only the bundled phone page and the current public channel. Never receives Twitch credentials. */
public final class PhoneChatServer {
    static final int PORT = 8978;
    interface Assets { InputStream open(String path) throws IOException; }
    interface AddressSource { InetAddress get(); }
    private final Assets assets;
    private final AddressSource addresses;
    private final Set<Socket> clients = Collections.newSetFromMap(new ConcurrentHashMap<Socket, Boolean>());
    private boolean destroyed;
    private ServerSocket server;
    private ThreadPoolExecutor workers;
    private String origin = "";
    private String pairing = "";
    private String channel = "";
    private long revision;
    private long updatedAt;
    private long historySequence;
    private final java.util.ArrayDeque<HistoryEvent> history = new java.util.ArrayDeque<>();
    private static final long HISTORY_MILLIS = 20 * 60 * 1000;
    private static class HistoryEvent {
        final long time;
        final String json;
        final long sequence;
        HistoryEvent(long time, long sequence, String json) { this.time = time; this.sequence = sequence; this.json = json; }
    }
    private void pruneHistory(long now) {
        while (!history.isEmpty() && history.peekFirst().time < now - HISTORY_MILLIS) history.removeFirst();
    }
    public synchronized void addHistory(String login, String payload) {
        if (destroyed || !channel.equals(login) || channel.isEmpty() || payload == null || payload.length() > 8192 ||
            !payload.startsWith("{") || !payload.endsWith("}")) return;
        long now = System.currentTimeMillis();
        pruneHistory(now);
        history.addLast(new HistoryEvent(now, historySequence + 1, "{\"seq\":" + (++historySequence) + ",\"time\":" + now + "," + payload.substring(1)));
    }
    private String historyJSON(long now, long after) {
        pruneHistory(now);
        StringBuilder out = new StringBuilder("{\"now\":" + now + ",\"events\":[");
        for (HistoryEvent event : history) {
            if (event.sequence <= after) continue;
            if (out.charAt(out.length() - 1) != '[') out.append(',');
            out.append(event.json);
        }
        return out.append("]}").toString();
    }

    public PhoneChatServer(Context context) {
        this(path -> context.getAssets().open(path), () -> localAddress(context));
    }

    PhoneChatServer(Assets assets, AddressSource addresses) {
        this.assets = assets;
        this.addresses = addresses;
    }

    public synchronized String getUrl() {
        if (destroyed) return "";
        InetAddress address = addresses.get();
        if (address == null) { stop(); return ""; }
        String nextOrigin = "http://" + address.getHostAddress() + ":" + PORT;
        if (server != null && !origin.equals(nextOrigin)) stop();
        if (server == null) {
            try {
                // Fail before showing a QR if the APK was built without the generated phone assets.
                try (InputStream ignored = assets.open("phonechat/index.html")) {}
                ServerSocket listener = new ServerSocket();
                try { listener.bind(new InetSocketAddress(address, PORT)); }
                catch (IOException e) { listener.close(); throw e; }
                server = listener;
                origin = nextOrigin;
                byte[] random = new byte[32];
                new SecureRandom().nextBytes(random);
                StringBuilder key = new StringBuilder();
                for (byte value : random) key.append(String.format("%02x", value & 255));
                pairing = key.toString();
                workers = new ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(8), runnable -> {
                    Thread thread = new Thread(runnable, "SPTV-phone-request");
                    thread.setDaemon(true);
                    return thread;
                });
                ThreadPoolExecutor executor = workers;
                Thread accept = new Thread(() -> accept(listener, executor), "SPTV-phone-server");
                accept.setDaemon(true);
                accept.start();
            } catch (IOException e) { stop(); return ""; }
        }
        return origin + "/chat/#pair=" + pairing;
    }

    public synchronized void setChannel(String login) {
        if (destroyed) return;
        String next = login != null && login.matches("[a-z0-9_]{3,25}") ? login : "";
        if (!channel.equals(next)) { channel = next; revision++; history.clear(); }
        updatedAt = System.currentTimeMillis();
    }

    public synchronized void close() {
        destroyed = true;
        stop();
    }

    public synchronized void stop() {
        if (server != null) { try { server.close(); } catch (IOException ignored) {} }
        server = null;
        for (Socket client : clients) { try { client.close(); } catch (IOException ignored) {} }
        clients.clear();
        if (workers != null) workers.shutdownNow();
        workers = null;
        origin = "";
        pairing = "";
        channel = "";
        history.clear();
        revision++;
    }

    private void accept(ServerSocket listener, ThreadPoolExecutor executor) {
        int consecutiveFailures = 0;

        while (!listener.isClosed()) {
            try {
                Socket socket = listener.accept();
                consecutiveFailures = 0;
                clients.add(socket);
                try { executor.execute(() -> {
                    try (Socket client = socket) { client.setSoTimeout(3000); handle(client); }
                    catch (IOException ignored) {} // A bad client must not terminate the listener.
                    finally { clients.remove(socket); }
                }); }
                catch (RuntimeException e) { socket.close(); clients.remove(socket); }
            } catch (IOException e) {
                if (listener.isClosed()) return;

                //Back off so a persistent accept failure (fd exhaustion, network
                //stack errors) doesn't hot-spin the CPU
                consecutiveFailures++;
                if (consecutiveFailures >= 10) {
                    try {
                        Thread.sleep(1000);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }
    }

    private static String readLine(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int value;
        while ((value = input.read()) != -1) {
            if (value == '\n') return new String(bytes.toByteArray(), StandardCharsets.US_ASCII).trim();
            if (bytes.size() >= 4096) throw new IOException("Header too large");
            bytes.write(value);
        }
        throw new IOException("Incomplete request");
    }

    private void handle(Socket socket) throws IOException {
        InputStream input = socket.getInputStream();
        String[] request = readLine(input).split(" ");
        Map<String, String> headers = new HashMap<>();
        int total = 0;
        for (int i = 0; i < 32; i++) {
            String line = readLine(input);
            if (line.isEmpty()) break;
            total += line.length();
            if (total > 8192 || i == 31) throw new IOException("Too many headers");
            int colon = line.indexOf(':');
            if (colon <= 0) throw new IOException("Malformed header");
            headers.put(line.substring(0, colon).toLowerCase(java.util.Locale.US), line.substring(colon + 1).trim());
        }
        String currentOrigin;
        synchronized (this) { currentOrigin = origin; }
        if (request.length != 3 || !"GET".equals(request[0])) { respond(socket, 405, "text/plain", "GET required"); return; }
        if (currentOrigin.isEmpty() || !currentOrigin.substring(7).equals(headers.get("host")) ||
            (headers.containsKey("origin") && !currentOrigin.equals(headers.get("origin")))) {
            respond(socket, 403, "text/plain", "Forbidden"); return;
        }
        String path = request[1];
        if ("/chat/state".equals(path)) {
            String state;
            long after = 0;
            try { after = Math.max(0, Long.parseLong(headers.get("x-sptv-history-after"))); } catch (RuntimeException ignored) {}
            synchronized (this) {
                if (pairing.isEmpty() || !pairing.equals(headers.get("x-sptv-pairing"))) {
                    respond(socket, 403, "text/plain", "Scan the TV QR again"); return;
                }
                // Expire a stale publisher (e.g. TV web page exited or crashed) without ending the phone login.
                String active = System.currentTimeMillis() - updatedAt < 10000 ? channel : "";
                state = "{\"channel\":\"" + active + "\",\"revision\":" + revision + ",\"history\":" + historyJSON(System.currentTimeMillis(), after) + "}";
            }
            respond(socket, 200, "application/json", state); return;
        }
        String asset, type;
        switch (path) {
            case "/chat/": asset = "index.html"; type = "text/html; charset=utf-8"; break;
            case "/chat/PhoneChat.js": asset = "PhoneChat.js"; type = "application/javascript; charset=utf-8"; break;
            case "/chat/phonechat.min.css": asset = "phonechat.min.css"; type = "text/css; charset=utf-8"; break;
            default: respond(socket, 404, "text/plain", "Not found"); return;
        }
        try (InputStream file = assets.open("phonechat/" + asset)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = file.read(buffer)) != -1) {
                if (bytes.size() + count > 2 * 1024 * 1024) throw new IOException("Asset too large");
                bytes.write(buffer, 0, count);
            }
            respond(socket, 200, type, bytes.toByteArray());
        } catch (IOException e) { respond(socket, 404, "text/plain", "Missing phone assets"); }
    }

    private static void respond(Socket socket, int status, String type, String body) throws IOException {
        respond(socket, status, type, body.getBytes(StandardCharsets.UTF_8));
    }

    private static void respond(Socket socket, int status, String type, byte[] body) throws IOException {
        String reason = status == 200 ? "OK" : status == 403 ? "Forbidden" : status == 405 ? "Method Not Allowed" : "Not Found";
        OutputStream output = socket.getOutputStream();
        output.write(("HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length +
            "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n" +
            "Content-Security-Policy: frame-ancestors 'none'\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        output.write(body);
        output.flush();
    }

    private static InetAddress localAddress(Context context) {
        try {
            ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return null;
            for (Network network : manager.getAllNetworks()) {
                NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
                if (capabilities == null || (!capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                    !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))) continue;
                LinkProperties properties = manager.getLinkProperties(network);
                if (properties == null) continue;
                for (LinkAddress link : properties.getLinkAddresses()) {
                    InetAddress address = link.getAddress();
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) return address;
                }
            }
        } catch (RuntimeException ignored) {}
        return null;
    }
}
