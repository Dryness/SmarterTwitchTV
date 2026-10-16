package com.fgl27.twitch;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Activity-owned network admission and single-consumption bridge results. */
final class RequestDispatcher implements AutoCloseable {
    static final int WORKERS = 12;
    static final int WAITING_LIMIT = 128;
    static final int RESULT_LIMIT = 500;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
        WORKERS, WORKERS, 0, TimeUnit.SECONDS, new LinkedBlockingQueue<Runnable>(WAITING_LIMIT), new ThreadPoolExecutor.AbortPolicy()
    );
    private final Map<Integer, String> results = new HashMap<>();
    private int nextResultId;
    private long pageGeneration;
    private volatile boolean closed;
    private final List<PendingCallback> pendingCallbacks = new ArrayList<>();

    synchronized long pageGeneration() {
        return pageGeneration;
    }

    synchronized boolean isCurrentPage(long page) {
        return !closed && page == pageGeneration;
    }

    synchronized void navigate() {
        pageGeneration++;
        results.clear();
        for (int i = pendingCallbacks.size() - 1; i >= 0; i--) {
            PendingCallback pending = pendingCallbacks.get(i);
            if (pending.page >= 0) {
                pending.callback = null;
                pendingCallbacks.remove(i);
            }
        }
    }

    boolean isClosed() {
        return closed;
    }

    // Check at JS evaluation too: loadUrl's renderer execution can follow a navigation.
    static String callbackScript(long page, String result, String callback, String arguments) {
        return "javascript:(function(){if(!Android.IsRequestPageCurrent(" + page + "))return;var result=" + result +
            ";if(result!==null&&Android.IsRequestPageCurrent(" + page + ")&&typeof smartTwitchTV!=='undefined'){smartTwitchTV." +
            callback + "(result," + arguments + ");}})()";
    }

    interface CallbackQueue {
        void post(Runnable callback);
    }

    // Posted wrappers retain only this dispatcher after close, not the Activity callback/payload.
    private final class PendingCallback implements Runnable {
        private Runnable callback;
        private final long page;

        PendingCallback(long page, Runnable callback) {
            this.page = page;
            this.callback = callback;
        }

        @Override
        public void run() {
            synchronized (RequestDispatcher.this) {
                pendingCallbacks.remove(this);
                Runnable target = callback;
                callback = null;
                if (!closed && (page < 0 || page == pageGeneration) && target != null) target.run();
            }
        }
    }

    void post(CallbackQueue queue, Runnable callback) {
        postPage(-1, queue, callback);
    }

    void postPage(long page, CallbackQueue queue, Runnable callback) {
        PendingCallback pending;
        synchronized (this) {
            if (closed || (page >= 0 && page != pageGeneration)) return;
            pending = new PendingCallback(page, callback);
            pendingCallbacks.add(pending);
        }
        try {
            queue.post(pending);
        } catch (RuntimeException e) {
            synchronized (this) {
                pendingCallbacks.remove(pending);
                pending.callback = null;
            }
            throw e;
        }
    }

    synchronized void execute(Runnable job) {
        if (closed) throw new RejectedExecutionException("Activity closed");
        executor.execute(job);
    }

    synchronized int reserve() {
        return reserve(pageGeneration);
    }

    synchronized int reserve(long page) {
        if (!isCurrentPage(page) || results.size() >= RESULT_LIMIT || nextResultId == Integer.MAX_VALUE) return -1;
        // IDs never repeat within this Activity, including across page reloads.
        // A stale JS getter or worker must never address a new reservation.
        int id = ++nextResultId;
        results.put(id, null);
        return id;
    }

    synchronized boolean publish(int id, String value) {
        if (closed || !results.containsKey(id)) return false;
        results.put(id, value);
        return true;
    }

    synchronized String consume(int id) {
        if (closed) return null;
        String result = results.get(id);
        // A premature getter must not free an in-flight request's reservation.
        if (result != null) results.remove(id);
        return result;
    }

    synchronized void release(int id) {
        results.remove(id);
    }

    @Override
    public synchronized void close() {
        closed = true;
        executor.shutdownNow();
        for (PendingCallback pending : pendingCallbacks) pending.callback = null;
        pendingCallbacks.clear();
        results.clear();
    }

    boolean awaitTermination(long timeout, TimeUnit unit) throws InterruptedException {
        return executor.awaitTermination(timeout, unit);
    }
}
