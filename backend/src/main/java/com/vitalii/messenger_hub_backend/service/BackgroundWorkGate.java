package com.vitalii.messenger_hub_backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Lets background jobs (archiving, embedding, transcription) run only when they are not in the
 * user's way:
 * <ul>
 * <li>one job at a time — they share the CPU and the messenger connections;</li>
 * <li>nothing starts while the user is active.</li>
 * </ul>
 * A skipped tick costs nothing: each job drains a backlog and gets the same work next time.
 */
@Service
@Slf4j
public class BackgroundWorkGate {

    /** Only one background job runs at a time, whichever asks first. */
    private final ReentrantLock lock = new ReentrantLock();

    private final AtomicLong lastUserRequest = new AtomicLong(0);

    /** For the system status panel: what is running now, and when each job last ran. */
    private volatile String running;
    private final Map<String, Long> lastRuns = new ConcurrentHashMap<>();

    /**
     * How long after the last user request background work stays paused. Longer than the chat
     * list's 25-second poll so an idle open tab does not count as activity.
     */
    @Value("${background.user-quiet-ms:20000}")
    private long quietMillis;

    /** Called for every request the browser makes. */
    public void markUserActivity() {
        lastUserRequest.set(System.currentTimeMillis());
    }

    public boolean userIsActive() {
        return System.currentTimeMillis() - lastUserRequest.get() < quietMillis;
    }

    /**
     * Runs the job if the machine is free and the user is not waiting on anything.
     *
     * @return true when the work ran, false when the tick was yielded
     */
    public boolean runIfIdle(String name, Runnable work) {
        if (userIsActive()) {
            log.debug("{} skipped: user is active", name);
            return false;
        }
        if (!lock.tryLock()) {
            log.debug("{} skipped: another background job is running", name);
            return false;
        }
        try {
            running = name;
            work.run();
            return true;
        } finally {
            running = null;
            lastRuns.put(name, System.currentTimeMillis());
            lock.unlock();
        }
    }

    public String runningJob() {
        return running;
    }

    /** Job name → epoch millis of its last finished run. */
    public Map<String, Long> lastRuns() {
        return Map.copyOf(lastRuns);
    }
}
