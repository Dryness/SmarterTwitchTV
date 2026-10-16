package com.fgl27.twitch;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class RequestDispatcherTest {
    private static int checks;
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
    public static void main(String[] args) throws Exception {
        RequestDispatcher lifetime = new RequestDispatcher();
        List<Runnable> ui = new ArrayList<>();
        AtomicInteger deliveries = new AtomicInteger();
        lifetime.post(ui::add, deliveries::incrementAndGet);
        ui.remove(0).run();
        check(deliveries.get() == 1, "live callback delivered (also during ordinary stop/resume)");
        lifetime.post(ui::add, deliveries::incrementAndGet);
        lifetime.close();
        ui.remove(0).run();
        check(deliveries.get() == 1, "already-posted callback suppressed after destroy");
        lifetime.post(ui::add, deliveries::incrementAndGet);
        check(ui.isEmpty(), "late completion cannot post after destroy");
        check(lifetime.awaitTermination(5, TimeUnit.SECONDS), "callback owner terminates");
        RequestDispatcher early = new RequestDispatcher();
        early.close();
        check(early.reserve() == -1, "destroy before submission");
        try { early.execute(() -> {}); throw new AssertionError("closed accepted job"); }
        catch (RejectedExecutionException expected) { checks++; }
        check(early.awaitTermination(5, TimeUnit.SECONDS), "unused pool terminates");

        RequestDispatcher busy = new RequestDispatcher();
        CountDownLatch started = new CountDownLatch(RequestDispatcher.WORKERS);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger queuedRuns = new AtomicInteger();
        for (int i = 0; i < RequestDispatcher.WORKERS; i++) busy.execute(() -> {
            started.countDown();
            // Model I/O that does not immediately honor interruption.
            boolean done = false;
            while (!done) {
                try { release.await(); done = true; } catch (InterruptedException ignored) {}
            }
            busy.post(ui::add, deliveries::incrementAndGet);
        });
        check(started.await(5, TimeUnit.SECONDS), "all 12 workers admitted");
        for (int i = 0; i < RequestDispatcher.WAITING_LIMIT; i++) busy.execute(queuedRuns::incrementAndGet);
        try { busy.execute(() -> { throw new AssertionError("caller-runs"); }); throw new AssertionError("unbounded queue"); }
        catch (RejectedExecutionException expected) { checks++; }
        busy.close();
        check(queuedRuns.get() == 0, "teardown cancels 128 waiting jobs");
        release.countDown();
        check(busy.awaitTermination(5, TimeUnit.SECONDS), "active jobs settle without waiting on UI");
        check(ui.isEmpty() && deliveries.get() == 1, "running download-like work cannot hand off stale UI after destroy");

        RequestDispatcher unordered = new RequestDispatcher();
        CountDownLatch[] gates = new CountDownLatch[12];
        CountDownLatch[] completionGates = new CountDownLatch[12];
        int[] slots = new int[12];
        List<Integer> completionOrder = Collections.synchronizedList(new ArrayList<Integer>());
        for (int i = 0; i < 12; i++) {
            gates[i] = new CountDownLatch(1); completionGates[i] = new CountDownLatch(1);
            slots[i] = unordered.reserve();
            final int index = i;
            unordered.execute(() -> {
                try { gates[index].await(); } catch (InterruptedException e) { throw new AssertionError(e); }
                unordered.publish(slots[index], "request-" + index);
                completionOrder.add(index); completionGates[index].countDown();
            });
        }
        for (int i = 11; i >= 0; i--) {
            gates[i].countDown();
            check(completionGates[i].await(5, TimeUnit.SECONDS), "controlled out-of-order completion");
        }
        for (int i = 0; i < 12; i++) {
            check(completionOrder.get(i) == 11 - i, "reverse completion order");
            check(("request-" + i).equals(unordered.consume(slots[i])), "concurrent requests retain their own payload");
        }
        unordered.close();
        check(unordered.awaitTermination(5, TimeUnit.SECONDS), "out-of-order pool terminates");

        RequestDispatcher results = new RequestDispatcher();
        List<Integer> owned = Collections.synchronizedList(new ArrayList<Integer>());
        CountDownLatch done = new CountDownLatch(500);
        for (int i = 0; i < 500; i++) {
            final int slot = results.reserve();
            check(slot >= 0, "free reservation");
            owned.add(slot);
            // Keep admission below saturation while accumulating unconsumed UI results.
            CountDownLatch published = new CountDownLatch(1);
            results.execute(() -> { results.publish(slot, "payload-" + slot); published.countDown(); done.countDown(); });
            check(published.await(5, TimeUnit.SECONDS), "completion published");
        }
        check(done.await(5, TimeUnit.SECONDS), "500 results waiting for UI consumption");
        for (int i = 0; i < 600; i++) check(results.reserve() == -1, "blocked UI never wraps occupied slots");
        Collections.reverse(owned);
        for (int slot : owned) {
            check(("payload-" + slot).equals(results.consume(slot)), "out-of-order payload pairing");
            check(results.consume(slot) == null, "single consumption");
        }
        int slot = results.reserve();
        check(slot >= 0 && results.consume(slot) == null, "premature read does not release");
        check(results.publish(slot, "after-read") && "after-read".equals(results.consume(slot)), "reservation survives early getter");
        slot = results.reserve();
        results.publish(slot, "completed before destroy");
        results.close();
        check(results.consume(slot) == null && !results.publish(slot, "stale"), "destroy releases completed results and suppresses late publication");
        check(results.awaitTermination(5, TimeUnit.SECONDS), "results pool terminates");
        for (int i = 0; i < 10; i++) {
            RequestDispatcher recreated = new RequestDispatcher();
            recreated.execute(() -> {}); recreated.close();
            check(recreated.awaitTermination(5, TimeUnit.SECONDS), "recreated pool terminates");
        }
        RequestDispatcher pages = new RequestDispatcher();
        long oldPage = pages.pageGeneration();
        int oldPending = pages.reserve(oldPage);
        int oldCompleted = pages.reserve(oldPage);
        pages.publish(oldCompleted, "old-completed");
        List<Runnable> pageUI = new ArrayList<>();
        AtomicInteger pageDeliveries = new AtomicInteger();
        pages.postPage(oldPage, pageUI::add, pageDeliveries::incrementAndGet);
        pages.post(pageUI::add, pageDeliveries::incrementAndGet); // Activity-owned installer work survives page reload.
        pages.navigate();
        long newPage = pages.pageGeneration();
        check(!pages.isCurrentPage(oldPage) && pages.isCurrentPage(newPage), "navigation advances page ownership");
        check(pages.reserve(oldPage) == -1, "old page cannot reserve after navigation");
        check(pages.consume(oldCompleted) == null, "completed unconsumed response abandoned on reload");
        int fresh = pages.reserve(newPage);
        check(fresh != oldPending && fresh != oldCompleted, "result IDs do not repeat across page reloads");
        check(!pages.publish(oldPending, "late-worker"), "old pending completion cannot publish into reused storage");
        check(!pages.publish(oldCompleted, "duplicate-old-completion"), "old completed reservation cannot publish again");
        check(pages.consume(oldPending) == null && pages.consume(oldCompleted) == null, "stale getters cannot consume a new-page reservation");
        pages.release(oldPending);
        check(pages.publish(fresh, "new-page") && "new-page".equals(pages.consume(fresh)), "old release/getter cannot damage new response");
        for (Runnable callback : pageUI) callback.run();
        check(pageDeliveries.get() == 1, "reload suppresses old page callback but preserves Activity callback");
        pageUI.clear();
        pages.postPage(newPage, pageUI::add, pageDeliveries::incrementAndGet);
        pageUI.remove(0).run();
        check(pageDeliveries.get() == 2, "new page receives its own callback after reload");
        pages.postPage(oldPage, pageUI::add, pageDeliveries::incrementAndGet);
        check(pageUI.isEmpty(), "late old-page completion cannot post into the new page");
        for (int reload = 0; reload < 5; reload++) {
            for (int i = 0; i < RequestDispatcher.RESULT_LIMIT; i++) {
                int id = pages.reserve();
                check(id >= 0, "repeated reload restores all 500 reservations");
                if ((i & 1) == 0) pages.publish(id, "never-consumed");
            }
            check(pages.reserve() == -1, "current page still enforces result budget");
            pages.navigate();
        }
        CountDownLatch running = new CountDownLatch(1), continueOld = new CountDownLatch(1), settled = new CountDownLatch(1);
        long runningPage = pages.pageGeneration();
        int runningId = pages.reserve(runningPage);
        AtomicInteger stalePublications = new AtomicInteger();
        pages.execute(() -> {
            running.countDown();
            try { continueOld.await(); } catch (InterruptedException e) { throw new AssertionError(e); }
            if (pages.publish(runningId, "obsolete")) stalePublications.incrementAndGet();
            pages.postPage(runningPage, pageUI::add, pageDeliveries::incrementAndGet);
            settled.countDown();
        });
        check(running.await(5, TimeUnit.SECONDS), "old request running before navigation");
        pages.navigate();
        int replacement = pages.reserve();
        continueOld.countDown();
        check(settled.await(5, TimeUnit.SECONDS), "old request finishes after navigation");
        check(stalePublications.get() == 0 && pageUI.isEmpty(), "running request cannot publish or deliver after reload");
        check(pages.publish(replacement, "replacement") && "replacement".equals(pages.consume(replacement)), "replacement reservation remains intact");
        pages.close();
        check(pages.awaitTermination(5, TimeUnit.SECONDS), "page-owner pool terminates");
        // The Node runner evaluates these exact production-generated scripts in a mocked JS bridge.
        for (String script : new String[] {
            RequestDispatcher.callbackScript(3, "Android.BasexmlHttpGetResult(17)", "receive", "9,'success','error',10"),
            RequestDispatcher.callbackScript(3, "'inline-failure'", "receive", "9,'success','error',10")
        }) System.out.println("CALLBACK_SCRIPT:" + java.util.Base64.getEncoder().encodeToString(script.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        System.out.println(checks + " native dispatcher checks passed");
    }
}
